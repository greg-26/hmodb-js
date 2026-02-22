import type { ParsedEvent, ParsedSchedule, EventInstance, EventFilter } from "./types.js";
import { WikidataId } from "./types.js";

// ─── ISO 8601 duration parser (subset: weeks, days, months) ──────────────────

interface Duration {
  years?: number;
  months?: number;
  weeks?: number;
  days?: number;
}

function parseDuration(iso: string): Duration {
  const match = iso.match(/^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?/);
  if (!match) return { weeks: 1 };
  return {
    years: match[1] ? parseInt(match[1]) : undefined,
    months: match[2] ? parseInt(match[2]) : undefined,
    weeks: match[3] ? parseInt(match[3]) : undefined,
    days: match[4] ? parseInt(match[4]) : undefined,
  };
}

function addDuration(date: Date, dur: Duration): Date {
  const d = new Date(date);
  if (dur.years) d.setFullYear(d.getFullYear() + dur.years);
  if (dur.months) d.setMonth(d.getMonth() + dur.months);
  if (dur.weeks) d.setDate(d.getDate() + dur.weeks * 7);
  if (dur.days) d.setDate(d.getDate() + dur.days);
  return d;
}

function toYMD(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcYMD(date: Date): [number, number, number] {
  return [date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()];
}

function applyTimeToDate(date: Date, time: string, timezone?: string): Date {
  const ymd = toYMD(date);
  if (timezone) {
    try {
      const dtStr = `${ymd}T${time}:00`;
      const probe = new Date(`${dtStr}Z`);
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).formatToParts(probe);
      const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
      const localMs = new Date(
        `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}Z`
      ).getTime();
      const offsetMs = localMs - probe.getTime();
      return new Date(probe.getTime() - offsetMs);
    } catch {
      // fallback: treat as UTC
    }
  }
  return new Date(`${ymd}T${time}:00Z`);
}

// ─── Schedule expansion ───────────────────────────────────────────────────────

export interface ExpandOptions {
  /** Start of the window to expand into (defaults to now) */
  from?: Date;
  /** End of the window (defaults to 30 days from `from`) */
  to?: Date;
  /** Maximum instances to return as a safety cap (default 500) */
  limit?: number;
}

/**
 * Expand a recurring ParsedSchedule into concrete Date instances
 * within the given time window.
 */
export function expandSchedule(
  schedule: ParsedSchedule,
  opts: ExpandOptions = {}
): Date[] {
  const now = opts.from ?? new Date();
  const until = opts.to ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const limit = opts.limit ?? 500;

  const dur = parseDuration(schedule.repeatFrequency);
  const exceptSet = new Set(schedule.exceptDates);

  const boundsStart =
    schedule.startDate && schedule.startDate > now ? schedule.startDate : now;
  const boundsEnd =
    schedule.endDate && schedule.endDate < until ? schedule.endDate : until;

  if (boundsStart > boundsEnd) return [];

  const results: Date[] = [];

  if (schedule.byDay.length > 0) {
    const daySet = new Set(schedule.byDay);
    const [sy, sm, sd] = utcYMD(boundsStart);
    const cursor = new Date(Date.UTC(sy, sm, sd));

    const anchorSource = schedule.startDate ?? boundsStart;
    const [ay, am, ad] = utcYMD(anchorSource);
    const anchor = new Date(Date.UTC(ay, am, ad));

    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const repeatWeeks = dur.weeks ?? 1;

    while (cursor <= boundsEnd && results.length < limit) {
      if (daySet.has(cursor.getUTCDay())) {
        const weeksSinceAnchor = Math.round(
          (cursor.getTime() - anchor.getTime()) / weekMs
        );
        if (weeksSinceAnchor % repeatWeeks === 0) {
          const ymd = toYMD(cursor);
          if (!exceptSet.has(ymd)) {
            results.push(
              schedule.startTime
                ? applyTimeToDate(cursor, schedule.startTime, schedule.timezone)
                : new Date(cursor)
            );
          }
        }
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  } else if (dur.days || dur.weeks || dur.months || dur.years) {
    let cursor = new Date(boundsStart);
    while (cursor <= boundsEnd && results.length < limit) {
      const ymd = toYMD(cursor);
      if (!exceptSet.has(ymd)) {
        results.push(
          schedule.startTime
            ? applyTimeToDate(cursor, schedule.startTime, schedule.timezone)
            : new Date(cursor)
        );
      }
      cursor = addDuration(cursor, dur);
    }
  }

  return results;
}

// ─── Filter helpers ───────────────────────────────────────────────────────────

function toArr<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function matchesFilter(event: ParsedEvent, filter: EventFilter): boolean {
  const serviceTypes = toArr(filter.serviceType) as string[];
  const languages = toArr(filter.language);

  // ── serviceType ─────────────────────────────────────────────────────────────
  if (serviceTypes.length > 0) {
    if (!event.serviceType) {
      if (filter.includeUntyped !== true) return false;
    } else if (!serviceTypes.includes(event.serviceType)) {
      return false;
    }
  }

  // ── language ────────────────────────────────────────────────────────────────
  if (languages.length > 0) {
    if (event.languages.length === 0) {
      // No language declared — honour includeLanguageUnknown (default: false)
      if (filter.includeLanguageUnknown !== true) return false;
    } else if (!event.languages.some((l) => languages.includes(l))) {
      return false;
    }
  }

  return true;
}

// ─── Core resolver ────────────────────────────────────────────────────────────

function resolveEvents(
  events: ParsedEvent[],
  from: Date,
  to: Date,
  opts: ExpandOptions,
  filter: EventFilter
): EventInstance[] {
  const instances: EventInstance[] = [];

  for (const event of events) {
    if (!matchesFilter(event, filter)) continue;

    if (event.schedule) {
      if (event.schedule.endDate && event.schedule.endDate < from) continue;

      const dates = expandSchedule(event.schedule, { ...opts, from, to });
      for (const startDate of dates) {
        let endDate: Date | undefined;
        if (event.schedule.endTime) {
          endDate = applyTimeToDate(
            startDate,
            event.schedule.endTime,
            event.schedule.timezone
          );
        }
        instances.push({
          startDate,
          endDate,
          name: event.name,
          description: event.description,
          serviceType: event.serviceType,
          status: event.status,
          location: event.location,
          languages: event.languages,
          performers: event.performers,
        });
      }
    } else if (event.startDate) {
      if (event.startDate >= from && event.startDate <= to) {
        instances.push({
          startDate: event.startDate,
          endDate: event.endDate,
          name: event.name,
          description: event.description,
          serviceType: event.serviceType,
          status: event.status,
          location: event.location,
          languages: event.languages,
          performers: event.performers,
          previousStartDate: event.previousStartDate,
        });
      }
    }
  }

  // Apply one-off cancellation/rescheduled overrides to matching scheduled instances
  const scheduled = instances.filter((i) => i.status === "scheduled");
  const overrides = instances.filter(
    (i) => i.status === "cancelled" || i.status === "rescheduled"
  );

  const appliedOverrides = new Set<EventInstance>();
  const result: EventInstance[] = [];

  for (const s of scheduled) {
    const override = overrides.find(
      (o) =>
        toYMD(o.startDate) === toYMD(s.startDate) &&
        o.location?.osmId === s.location?.osmId
    );
    if (override) {
      result.push(override);
      appliedOverrides.add(override);
    } else {
      result.push(s);
    }
  }

  for (const o of overrides) {
    if (!appliedOverrides.has(o)) result.push(o);
  }

  return result.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve a list of ParsedEvents into concrete EventInstance objects
 * within the given time window, with optional filtering by service type
 * and language.
 *
 * @example
 * getUpcomingEvents(events, { from, to })
 *
 * @example
 * getUpcomingEvents(events, {
 *   serviceType: [WikidataId.Mass, WikidataId.EucharisticAdoration],
 * })
 *
 * @example
 * getUpcomingEvents(events, {
 *   serviceType: WikidataId.Mass,
 *   language: "la",
 *   includeUntyped: true,
 *   includeLanguageUnknown: true,
 * })
 */
export function getUpcomingEvents(
  events: ParsedEvent[],
  opts: ExpandOptions & EventFilter = {}
): EventInstance[] {
  const from = opts.from ?? new Date();
  const to = opts.to ?? new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);
  return resolveEvents(events, from, to, opts, opts);
}

/**
 * Convenience wrapper — returns Mass events only, including events where
 * `additionalType` is unset (most parishes don't set it yet).
 *
 * Equivalent to:
 * ```ts
 * getUpcomingEvents(events, { serviceType: WikidataId.Mass, includeUntyped: true })
 * ```
 */
export function getUpcomingMasses(
  events: ParsedEvent[],
  opts: ExpandOptions = {}
): EventInstance[] {
  return getUpcomingEvents(events, {
    ...opts,
    serviceType: WikidataId.Mass,
    includeUntyped: true,
  });
}

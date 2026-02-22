import type { ParsedEvent, ParsedSchedule, MassInstance, EventFilter } from "./types.js";
import { WikidataId } from "./types.js";

// ─── ISO 8601 duration parser (subset: weeks, days, months) ─────────────────

interface Duration {
  years?: number;
  months?: number;
  weeks?: number;
  days?: number;
}

function parseDuration(iso: string): Duration {
  // e.g. "P1W", "P2W", "P1D", "P1M", "P1Y", "P1DT12H" (we handle date part only)
  const match = iso.match(/^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?/);
  if (!match) return { weeks: 1 }; // default to weekly
  return {
    years: match[1] ? parseInt(match[1]) : undefined,
    months: match[2] ? parseInt(match[2]) : undefined,
    weeks: match[3] ? parseInt(match[3]) : undefined,
    days: match[4] ? parseInt(match[4]) : undefined,
  };
}

/** Advance a date by one duration unit */
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

/** Return the UTC year/month/day of a Date as separate values */
function utcYMD(date: Date): [number, number, number] {
  return [date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()];
}

/**
 * Given a UTC date (midnight) and an "HH:mm" time string in the given timezone,
 * return the exact UTC instant that represents that local time on that calendar day.
 */
function applyTimeToDate(date: Date, time: string, timezone?: string): Date {
  const ymd = toYMD(date); // "YYYY-MM-DD" based on UTC date
  if (timezone) {
    try {
      // We want: "what UTC instant is YYYY-MM-DDTHH:mm:00 in `timezone`?"
      // Strategy: parse as if UTC, then compute the timezone offset at that moment.
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
      const get = (t: string) =>
        parts.find((p) => p.type === t)?.value ?? "00";
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
  /** Start of the window to expand into (defaults to today) */
  from?: Date;
  /** End of the window (defaults to 30 days from `from`) */
  to?: Date;
  /** Maximum number of instances to return (safety cap, default 500) */
  limit?: number;
}

/**
 * Expand a recurring ParsedSchedule into concrete Date instances.
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

  // Effective bounds
  const boundsStart = schedule.startDate && schedule.startDate > now
    ? schedule.startDate
    : now;
  const boundsEnd = schedule.endDate && schedule.endDate < until
    ? schedule.endDate
    : until;

  if (boundsStart > boundsEnd) return [];

  const results: Date[] = [];

  if (schedule.byDay.length > 0) {
    // Day-of-week based recurrence (most common: weekly Mass schedule)
    // Walk day-by-day using UTC dates to avoid DST/local-time surprises.
    const daySet = new Set(schedule.byDay);

    // Start cursor at UTC midnight of boundsStart
    const [sy, sm, sd] = utcYMD(boundsStart);
    const cursor = new Date(Date.UTC(sy, sm, sd));

    // Anchor for multi-week cycle detection (clone to avoid mutation)
    const anchorSource = schedule.startDate ?? boundsStart;
    const [ay, am, ad] = utcYMD(anchorSource);
    const anchor = new Date(Date.UTC(ay, am, ad));

    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const repeatWeeks = dur.weeks ?? 1;

    while (cursor <= boundsEnd && results.length < limit) {
      if (daySet.has(cursor.getUTCDay())) {
        // For multi-week frequencies, check we're in the right week cycle
        const weeksSinceAnchor = Math.round(
          (cursor.getTime() - anchor.getTime()) / weekMs
        );
        if (weeksSinceAnchor % repeatWeeks === 0) {
          const ymd = toYMD(cursor);
          if (!exceptSet.has(ymd)) {
            const instance = schedule.startTime
              ? applyTimeToDate(cursor, schedule.startTime, schedule.timezone)
              : new Date(cursor);
            results.push(instance);
          }
        }
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  } else if (dur.days || dur.weeks || dur.months || dur.years) {
    // Fixed-interval recurrence without byDay (less common)
    let cursor = new Date(boundsStart);
    while (cursor <= boundsEnd && results.length < limit) {
      const ymd = toYMD(cursor);
      if (!exceptSet.has(ymd)) {
        const instance =
          schedule.startTime
            ? applyTimeToDate(cursor, schedule.startTime, schedule.timezone)
            : new Date(cursor);
        results.push(instance);
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

/**
 * Returns true if the event passes the given EventFilter.
 * Called before expansion so we never waste cycles on excluded events.
 */
function matchesFilter(event: ParsedEvent, filter: EventFilter): boolean {
  const serviceTypes = toArr(filter.serviceType);
  const languages = toArr(filter.language);

  // ── serviceType filter ──────────────────────────────────────────────────────
  if (serviceTypes.length > 0) {
    const hasType = !!event.serviceType;
    if (!hasType) {
      // Event has no additionalType — honour includeUntyped (default: false)
      if (filter.includeUntyped !== true) return false;
    } else if (!serviceTypes.includes(event.serviceType as any)) {
      return false;
    }
  }
  // No serviceType filter → includeUntyped implicitly true (include everything)

  // ── language filter ─────────────────────────────────────────────────────────
  // Strict: if a language filter is active, only events that explicitly
  // declare a matching language pass. Events with no language set are excluded.
  if (languages.length > 0) {
    if (
      event.languages.length === 0 ||
      !event.languages.some((l) => languages.includes(l))
    ) {
      return false;
    }
  }

  return true;
}

// ─── Core resolver (shared by both public functions) ─────────────────────────

function resolveEvents(
  events: ParsedEvent[],
  from: Date,
  to: Date,
  opts: ExpandOptions,
  filter: EventFilter
): MassInstance[] {
  const instances: MassInstance[] = [];

  for (const event of events) {
    // Pre-filter before any expansion work
    if (!matchesFilter(event, filter)) continue;

    if (event.schedule) {
      // Skip stale schedules (endDate in the past)
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

  // Separate scheduled instances from one-off overrides (cancellations / rescheduling)
  const scheduled = instances.filter((i) => i.status === "scheduled");
  const overrides = instances.filter(
    (i) => i.status === "cancelled" || i.status === "rescheduled"
  );

  const appliedOverrides = new Set<MassInstance>();
  const result: MassInstance[] = [];

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

  // Standalone overrides that didn't match a scheduled event (e.g. a one-off
  // event that was later cancelled)
  for (const o of overrides) {
    if (!appliedOverrides.has(o)) result.push(o);
  }

  return result.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve a list of ParsedEvents into concrete MassInstance objects
 * within the given time window, with optional filtering by service type
 * and language.
 *
 * This is the primary API. Use `WikidataId.*` constants for `serviceType`
 * to get full intellisense.
 *
 * @example
 * // All upcoming events in the next 7 days
 * getUpcomingEvents(events, { from, to })
 *
 * @example
 * // Only Mass and Adoration
 * getUpcomingEvents(events, {
 *   serviceType: [WikidataId.Mass, WikidataId.EucharisticAdoration],
 * })
 *
 * @example
 * // Latin Mass only, including parishes that haven't set additionalType
 * getUpcomingEvents(events, {
 *   serviceType: WikidataId.TraditionalLatinMass,
 *   language: "la",
 *   includeUntyped: true,
 * })
 */
export function getUpcomingEvents(
  events: ParsedEvent[],
  opts: ExpandOptions & EventFilter = {}
): MassInstance[] {
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
 * getUpcomingEvents(events, {
 *   serviceType: WikidataId.Mass,
 *   includeUntyped: true,
 * })
 * ```
 */
export function getUpcomingMasses(
  events: ParsedEvent[],
  opts: ExpandOptions = {}
): MassInstance[] {
  return getUpcomingEvents(events, {
    ...opts,
    serviceType: WikidataId.Mass,
    includeUntyped: true,
  });
}

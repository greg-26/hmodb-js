/**
 * generate.ts — JSON-LD generation for the Mass Times Protocol.
 *
 * Two levels:
 *   1. Builder API  — friendly helpers that hide schema.org verbosity
 *   2. Serialisers  — RawEvent → JSON string / <script> tag
 */

import type {
  RawEvent,
  RawSchedule,
  RawPlace,
  RawPerformer,
  ParsedEvent,
} from "./types.js";
import { WikidataId, EventStatus } from "./types.js";

// ─── Day-of-week helpers ──────────────────────────────────────────────────────

/** Friendly day names accepted by buildSchedule */
export type DayName =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

const DAY_URI: Record<DayName, string> = {
  Sunday: "https://schema.org/Sunday",
  Monday: "https://schema.org/Monday",
  Tuesday: "https://schema.org/Tuesday",
  Wednesday: "https://schema.org/Wednesday",
  Thursday: "https://schema.org/Thursday",
  Friday: "https://schema.org/Friday",
  Saturday: "https://schema.org/Saturday",
};

function toDayUri(day: DayName | string): string {
  return DAY_URI[day as DayName] ?? day; // pass through if already a URI
}

function toOsmUrl(osmId: string): string {
  // Accept "node/123", "way/456", "relation/789" or a full URL
  if (osmId.startsWith("http")) return osmId;
  return `https://www.openstreetmap.org/${osmId}`;
}

// ─── Builder options ──────────────────────────────────────────────────────────

export interface ScheduleOptions {
  /** Days of the week this Mass recurs on */
  days: (DayName | string)[];
  /** "HH:mm" local time */
  startTime: string;
  /** "HH:mm" local time */
  endTime?: string;
  /** IANA timezone, e.g. "Europe/Madrid". Strongly recommended. */
  timezone?: string;
  /**
   * ISO 8601 repeat frequency (default: "P1W" = weekly).
   * Use "P2W" for fortnightly, "P1D" for daily, etc.
   */
  repeatFrequency?: string;
  /** "YYYY-MM-DD" — first day this schedule is valid */
  from?: string;
  /** "YYYY-MM-DD" — last day this schedule is valid */
  until?: string;
  /** "YYYY-MM-DD" dates to skip (public holidays, closures, etc.) */
  except?: string | string[];
}

export interface LocationOptions {
  name?: string;
  /**
   * OpenStreetMap identifier.
   * Accepts short form ("node/123456789") or full URL.
   */
  osmId?: string;
  address?: {
    street?: string;
    city?: string;
    postalCode?: string;
    country?: string;
  };
}

export interface EventOptions {
  name: string;
  description?: string;
  /**
   * Wikidata service type. Use `WikidataId.*` constants for intellisense.
   * Omit to leave `additionalType` unset (valid — not all parishes use it).
   */
  serviceType?: string;
  /**
   * BCP 47 language code(s), e.g. "es", "la", ["es","en"].
   */
  language?: string | string[];
  location?: LocationOptions;
  /**
   * For recurring events — use buildSchedule() to construct this.
   * For one-off events — use startDate instead.
   */
  schedule?: ScheduleOptions;
  /** ISO 8601 datetime for one-off events, e.g. "2025-03-05T10:00:00+01:00" */
  startDate?: string;
  /** ISO 8601 datetime for one-off events */
  endDate?: string;
  performer?: { name: string; jobTitle?: string } | { name: string; jobTitle?: string }[];
  image?: string;
}

export interface CancellationOptions {
  name?: string;
  /** ISO 8601 datetime of the Mass being cancelled */
  date: string;
  location?: LocationOptions;
}

export interface RescheduleOptions {
  name?: string;
  /** Original (old) ISO 8601 datetime */
  originalDate: string;
  /** New ISO 8601 datetime */
  newDate: string;
  location?: LocationOptions;
}

// ─── Builder functions ────────────────────────────────────────────────────────

/**
 * Build a schema.org Place object.
 *
 * @example
 * buildLocation({ name: "Cathedral of Our Lady", osmId: "node/123456789" })
 */
export function buildLocation(opts: LocationOptions): RawPlace {
  const place: RawPlace = { "@type": "Place" };
  if (opts.name) place.name = opts.name;
  if (opts.osmId) place.sameAs = toOsmUrl(opts.osmId);
  if (opts.address) {
    place.address = {
      "@type": "PostalAddress",
      streetAddress: opts.address.street,
      addressLocality: opts.address.city,
      postalCode: opts.address.postalCode,
      addressCountry: opts.address.country,
    };
  }
  return place;
}

/**
 * Build a schema.org Schedule object for recurring Masses.
 *
 * @example
 * buildSchedule({
 *   days: ["Sunday"],
 *   startTime: "11:00",
 *   endTime: "12:00",
 *   timezone: "Europe/Madrid",
 *   from: "2025-10-01",
 *   until: "2026-06-30",
 * })
 */
export function buildSchedule(opts: ScheduleOptions): ScheduleOptions {
  return opts; // ScheduleOptions is the canonical shape; toRawSchedule() converts it
}

function toRawSchedule(opts: ScheduleOptions): RawSchedule {
  const days = opts.days.map(toDayUri);
  const schedule: RawSchedule = {
    "@type": "Schedule",
    byDay: days.length === 1 ? days[0] : days,
    startTime: opts.startTime,
    repeatFrequency: opts.repeatFrequency ?? "P1W",
  };
  if (opts.endTime) schedule.endTime = opts.endTime;
  if (opts.timezone) schedule.scheduleTimezone = opts.timezone;
  if (opts.from) schedule.startDate = opts.from;
  if (opts.until) schedule.endDate = opts.until;
  if (opts.except !== undefined) {
    schedule.exceptDate = Array.isArray(opts.except)
      ? opts.except
      : opts.except;
  }
  return schedule;
}

/**
 * Build a complete schema.org Event object ready for embedding in a
 * parish website as JSON-LD.
 *
 * @example
 * // Recurring weekly Mass
 * buildEvent({
 *   name: "Sunday Mass",
 *   serviceType: WikidataId.Mass,
 *   language: "es",
 *   location: { name: "Cathedral of Our Lady", osmId: "node/123456789" },
 *   schedule: {
 *     days: ["Sunday"],
 *     startTime: "11:00",
 *     endTime: "12:00",
 *     timezone: "Europe/Madrid",
 *     from: "2025-10-01",
 *     until: "2026-06-30",
 *   },
 * })
 *
 * @example
 * // One-off event (Holy Day)
 * buildEvent({
 *   name: "Ash Wednesday Mass",
 *   startDate: "2026-02-18T10:00:00+01:00",
 *   endDate: "2026-02-18T11:00:00+01:00",
 * })
 */
export function buildEvent(opts: EventOptions): RawEvent {
  const event: RawEvent = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: opts.name,
  };

  if (opts.serviceType) {
    event.additionalType = opts.serviceType;
  }
  if (opts.description) event.description = opts.description;
  if (opts.language) event.inLanguage = opts.language;
  if (opts.image) event.image = opts.image;
  if (opts.location) event.location = buildLocation(opts.location);

  if (opts.schedule) {
    event.eventSchedule = toRawSchedule(opts.schedule);
  } else {
    if (opts.startDate) event.startDate = opts.startDate;
    if (opts.endDate) event.endDate = opts.endDate;
  }

  if (opts.performer) {
    const performers = Array.isArray(opts.performer)
      ? opts.performer
      : [opts.performer];
    event.performer = performers.map(
      (p): RawPerformer => ({
        "@type": "Person",
        name: p.name,
        jobTitle: p.jobTitle,
      })
    );
  }

  return event;
}

/**
 * Build a cancellation Event for a one-off cancelled Mass.
 * Produces an `EventCancelled` entry that overrides the scheduled instance.
 *
 * @example
 * buildCancellation({
 *   date: "2025-12-28T11:00:00+01:00",
 *   location: { osmId: "node/123456789" },
 * })
 */
export function buildCancellation(opts: CancellationOptions): RawEvent {
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: opts.name ?? "Mass — Cancelled",
    startDate: opts.date,
    eventStatus: EventStatus.Cancelled,
    ...(opts.location ? { location: buildLocation(opts.location) } : {}),
  };
}

/**
 * Build a rescheduled Event, moving a Mass to a new time.
 * Produces an `EventRescheduled` entry with `previousStartDate`.
 *
 * @example
 * buildRescheduled({
 *   originalDate: "2025-03-16T11:00:00+01:00",
 *   newDate: "2025-03-16T12:00:00+01:00",
 *   location: { osmId: "node/123456789" },
 * })
 */
export function buildRescheduled(opts: RescheduleOptions): RawEvent {
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: opts.name ?? "Mass — Rescheduled",
    startDate: opts.newDate,
    previousStartDate: opts.originalDate,
    eventStatus: EventStatus.Rescheduled,
    ...(opts.location ? { location: buildLocation(opts.location) } : {}),
  };
}

// ─── Round-trip: ParsedEvent → RawEvent ──────────────────────────────────────

/**
 * Convert a ParsedEvent back to a RawEvent (JSON-LD shape).
 * Useful for round-tripping parsed data or programmatic event construction.
 */
export function toJsonLd(event: ParsedEvent): RawEvent {
  const raw: RawEvent = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.name,
  };

  if (event.serviceType) raw.additionalType = event.serviceType;
  if (event.description) raw.description = event.description;
  if (event.languages.length > 0) {
    raw.inLanguage =
      event.languages.length === 1 ? event.languages[0] : event.languages;
  }

  const statusMap: Record<string, string> = {
    scheduled: EventStatus.Scheduled,
    cancelled: EventStatus.Cancelled,
    postponed: EventStatus.Postponed,
    rescheduled: EventStatus.Rescheduled,
    movedOnline: EventStatus.MovedOnline,
  };
  if (event.status && event.status !== "scheduled") {
    raw.eventStatus = statusMap[event.status];
  }

  if (event.location) {
    raw.location = {
      "@type": "Place",
      name: event.location.name,
      sameAs: event.location.osmUrl,
      ...(event.location.address
        ? {
            address: {
              "@type": "PostalAddress",
              streetAddress: event.location.address.street,
              addressLocality: event.location.address.city,
              postalCode: event.location.address.postalCode,
              addressCountry: event.location.address.country,
            },
          }
        : {}),
    };
  }

  if (event.performers.length > 0) {
    raw.performer = event.performers.map((p) => ({
      "@type": "Person" as const,
      name: p.name,
      jobTitle: p.jobTitle,
    }));
  }

  if (event.schedule) {
    const s = event.schedule;
    const dayNames = [
      "https://schema.org/Sunday",
      "https://schema.org/Monday",
      "https://schema.org/Tuesday",
      "https://schema.org/Wednesday",
      "https://schema.org/Thursday",
      "https://schema.org/Friday",
      "https://schema.org/Saturday",
    ];
    const byDay = s.byDay.map((d) => dayNames[d]);
    const schedule: RawSchedule = {
      "@type": "Schedule",
      byDay: byDay.length === 1 ? byDay[0] : byDay,
      startTime: s.startTime,
      endTime: s.endTime,
      repeatFrequency: s.repeatFrequency,
    };
    if (s.timezone) schedule.scheduleTimezone = s.timezone;
    if (s.startDate) schedule.startDate = s.startDate.toISOString().slice(0, 10);
    if (s.endDate) schedule.endDate = s.endDate.toISOString().slice(0, 10);
    if (s.exceptDates.length > 0) {
      schedule.exceptDate =
        s.exceptDates.length === 1 ? s.exceptDates[0] : s.exceptDates;
    }
    raw.eventSchedule = schedule;
  } else {
    if (event.startDate) raw.startDate = event.startDate.toISOString();
    if (event.endDate) raw.endDate = event.endDate.toISOString();
    if (event.previousStartDate) {
      raw.previousStartDate = event.previousStartDate.toISOString();
    }
  }

  return raw;
}

// ─── Serialisers ──────────────────────────────────────────────────────────────

/**
 * Serialise one or more RawEvents to a JSON string.
 * Pass an array to embed multiple events in one block.
 */
export function toJsonLdString(
  events: RawEvent | RawEvent[],
  indent = 2
): string {
  return JSON.stringify(events, null, indent);
}

/**
 * Produce a ready-to-paste `<script type="application/ld+json">` tag
 * for embedding in a parish website's `<head>`.
 *
 * @example
 * const tag = toScriptTag([winterSchedule, summerSchedule]);
 * // → <script type="application/ld+json">[...]</script>
 */
export function toScriptTag(
  events: RawEvent | RawEvent[],
  indent = 2
): string {
  return `<script type="application/ld+json">\n${toJsonLdString(events, indent)}\n</script>`;
}

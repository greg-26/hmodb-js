/**
 * generate.ts — JSON-LD generation for the Mass Times Protocol.
 *
 * Two levels:
 *   1. Builder API   — friendly helpers that hide schema.org/Wikidata verbosity
 *   2. Serialisers   — RawEvent → JSON string / <script> tag
 *   3. Validation    — check events for protocol compliance before publishing
 */

import type {
  RawEvent,
  RawSchedule,
  RawPlace,
  RawPerformer,
  ParsedEvent,
  EventInstance,
  ServiceTypeInput,
} from "./types.js";
import { EventStatus, DayOfWeekURI, DayOfWeekURIByIndex } from "./types.js";

// ─── Day helpers ──────────────────────────────────────────────────────────────

/** Friendly day names accepted by buildSchedule */
export type DayName = keyof typeof DayOfWeekURI;

function toDayUri(day: DayName | string): string {
  return DayOfWeekURI[day as DayName] ?? day; // pass through if already a URI
}

function toOsmUrl(osmId: string): string {
  if (osmId.startsWith("http")) return osmId;
  return `https://www.openstreetmap.org/${osmId}`;
}

// ─── Builder option types ─────────────────────────────────────────────────────

export interface ScheduleOptions {
  /** Days of the week this event recurs on */
  days: (DayName | string)[];
  /** "HH:mm" local time */
  startTime: string;
  /** "HH:mm" local time */
  endTime?: string;
  /** IANA timezone, e.g. "Europe/Madrid". Strongly recommended. */
  timezone?: string;
  /**
   * ISO 8601 repeat frequency (default: "P1W" = weekly).
   * Use "P2W" for fortnightly, "P1D" for daily.
   */
  repeatFrequency?: string;
  /** "YYYY-MM-DD" — first day this schedule is valid */
  from?: string;
  /** "YYYY-MM-DD" — last day this schedule is valid */
  until?: string;
  /** "YYYY-MM-DD" date(s) to skip (holidays, closures, etc.) */
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
  serviceType?: ServiceTypeInput;
  /** BCP 47 language code(s), e.g. "es", "la", ["es","en"] */
  language?: string | string[];
  location?: LocationOptions;
  /**
   * For recurring events — use `buildSchedule()` to construct this,
   * or provide a raw `RawSchedule` directly.
   * If both `schedule` and `startDate` are provided, `schedule` takes priority.
   */
  schedule?: RawSchedule;
  /** ISO 8601 datetime for one-off events, e.g. "2025-03-05T10:00:00+01:00" */
  startDate?: string;
  /** ISO 8601 datetime for one-off events */
  endDate?: string;
  performer?:
    | { name: string; jobTitle?: string }
    | { name: string; jobTitle?: string }[];
  image?: string;
}

export interface CancellationOptions {
  name?: string;
  /** ISO 8601 datetime of the event being cancelled */
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

// ─── Validation types ─────────────────────────────────────────────────────────

export interface ValidationIssue {
  field: string;
  severity: "error" | "warning";
  message: string;
}

export interface ValidationResult {
  /** True if there are no errors (warnings do not affect validity) */
  valid: boolean;
  issues: ValidationIssue[];
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
 * Build a schema.org Schedule object for recurring events.
 * Returns a `RawSchedule` that can be passed directly to `buildEvent()`.
 *
 * @example
 * const schedule = buildSchedule({
 *   days: ["Sunday"],
 *   startTime: "11:00",
 *   endTime: "12:00",
 *   timezone: "Europe/Madrid",
 *   from: "2025-10-01",
 *   until: "2026-06-30",
 * });
 * buildEvent({ name: "Sunday Mass", schedule });
 */
export function buildSchedule(opts: ScheduleOptions): RawSchedule {
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
    schedule.exceptDate = opts.except; // preserves string | string[]
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
 *   schedule: buildSchedule({
 *     days: ["Sunday"],
 *     startTime: "11:00",
 *     endTime: "12:00",
 *     timezone: "Europe/Madrid",
 *     from: "2025-10-01",
 *     until: "2026-06-30",
 *   }),
 * })
 *
 * @example
 * // One-off Holy Day event
 * buildEvent({
 *   name: "Ash Wednesday Mass",
 *   serviceType: WikidataId.Mass,
 *   startDate: "2026-02-18T10:00:00+01:00",
 *   endDate:   "2026-02-18T11:00:00+01:00",
 * })
 */
export function buildEvent(opts: EventOptions): RawEvent {
  const event: RawEvent = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: opts.name,
  };

  if (opts.serviceType) event.additionalType = opts.serviceType;
  if (opts.description) event.description = opts.description;
  if (opts.language) event.inLanguage = opts.language;
  if (opts.image) event.image = opts.image;
  if (opts.location) event.location = buildLocation(opts.location);

  if (opts.schedule) {
    event.eventSchedule = opts.schedule;
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
 * Build a one-off cancellation Event.
 * Produces an `EventCancelled` entry that overrides the matching scheduled instance.
 *
 * @example
 * buildCancellation({ date: "2025-12-28T11:00:00+01:00", location: { osmId: "node/123" } })
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
 * Build a rescheduled Event, moving an event to a new time.
 * Produces an `EventRescheduled` entry with `previousStartDate`.
 *
 * @example
 * buildRescheduled({
 *   originalDate: "2025-03-16T11:00:00+01:00",
 *   newDate:      "2025-03-16T12:00:00+01:00",
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

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate a raw JSON-LD Event against Mass Times Protocol rules.
 *
 * Returns a `ValidationResult` with `valid` (no errors) and a list of issues
 * with severity `"error"` or `"warning"`. Errors indicate the event cannot
 * be reliably used by apps; warnings indicate data quality problems.
 *
 * @example
 * const result = validate(myEvent);
 * if (!result.valid) {
 *   result.issues.filter(i => i.severity === "error").forEach(i => console.error(i.message));
 * }
 */
export function validate(event: RawEvent): ValidationResult {
  const issues: ValidationIssue[] = [];

  const error = (field: string, message: string) =>
    issues.push({ field, severity: "error", message });
  const warn = (field: string, message: string) =>
    issues.push({ field, severity: "warning", message });

  const hasSchedule = !!event.eventSchedule;
  const hasStartDate = !!event.startDate;

  // ── When is it? ─────────────────────────────────────────────────────────────
  if (!hasSchedule && !hasStartDate) {
    error(
      "startDate / eventSchedule",
      "Event has neither a startDate nor an eventSchedule. Cannot determine when it occurs."
    );
  }

  if (hasStartDate) {
    const d = new Date(event.startDate!);
    if (isNaN(d.getTime())) {
      error("startDate", `Invalid date: "${event.startDate}". Must be ISO 8601.`);
    }
  }

  if (hasSchedule) {
    const s = event.eventSchedule!;

    const byDay = s.byDay
      ? Array.isArray(s.byDay) ? s.byDay : [s.byDay]
      : [];

    if (byDay.length === 0 && !s.repeatFrequency) {
      error(
        "eventSchedule.byDay",
        "Recurring schedule has no byDay and no repeatFrequency. Cannot determine recurrence pattern."
      );
    }

    if (!s.scheduleTimezone) {
      warn(
        "eventSchedule.scheduleTimezone",
        "No scheduleTimezone set. Times will be interpreted as UTC, which may be wrong."
      );
    }

    const now = new Date();

    if (!s.startDate || !s.endDate) {
      warn(
        "eventSchedule.startDate / endDate",
        "Schedule has no startDate/endDate bounds. Apps cannot detect stale data and may show outdated times."
      );
    } else {
      const end = new Date(s.endDate);
      if (!isNaN(end.getTime()) && end < now) {
        error(
          "eventSchedule.endDate",
          `Schedule endDate "${s.endDate}" is in the past. This schedule is stale and will be ignored by apps.`
        );
      }
    }
  }

  // ── Where is it? ─────────────────────────────────────────────────────────────
  if (!event.location) {
    warn("location", "No location set. Apps cannot show where the event takes place.");
  } else if (!event.location.sameAs) {
    warn(
      "location.sameAs",
      "Location has no sameAs (OpenStreetMap link). Apps cannot reliably identify or map this church."
    );
  } else if (!event.location.sameAs.includes("openstreetmap.org")) {
    warn(
      "location.sameAs",
      `location.sameAs should be an OpenStreetMap URL. Got: "${event.location.sameAs}".`
    );
  }

  // ── What type of event? ───────────────────────────────────────────────────────
  if (!event.additionalType) {
    warn(
      "additionalType",
      "No additionalType (Wikidata service type) set. Apps cannot distinguish Mass from Adoration, Confession, etc."
    );
  }

  return {
    valid: issues.every((i) => i.severity !== "error"),
    issues,
  };
}

// ─── Serialisers: RawEvent → JSON-LD ─────────────────────────────────────────

const STATUS_MAP: Record<string, string> = {
  scheduled: EventStatus.Scheduled,
  cancelled: EventStatus.Cancelled,
  postponed: EventStatus.Postponed,
  rescheduled: EventStatus.Rescheduled,
  movedOnline: EventStatus.MovedOnline,
};

/**
 * Convert a ParsedEvent back to a RawEvent (JSON-LD shape).
 * Useful for round-tripping parsed data back to the wire format.
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
  if (event.status && event.status !== "scheduled") {
    raw.eventStatus = STATUS_MAP[event.status];
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
    const byDay = s.byDay.map((d) => DayOfWeekURIByIndex[d]);
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

/**
 * Convert a resolved EventInstance back to a RawEvent.
 * Produces a one-off event (concrete startDate), since EventInstance
 * is already fully resolved from its schedule.
 *
 * Useful for re-serialising filtered/resolved events — e.g. to send a
 * subset of upcoming masses to an API or embed in another page.
 */
export function instanceToJsonLd(instance: EventInstance): RawEvent {
  const raw: RawEvent = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: instance.name,
    startDate: instance.startDate.toISOString(),
  };

  if (instance.endDate) raw.endDate = instance.endDate.toISOString();
  if (instance.previousStartDate) {
    raw.previousStartDate = instance.previousStartDate.toISOString();
  }
  if (instance.serviceType) raw.additionalType = instance.serviceType;
  if (instance.description) raw.description = instance.description;
  if (instance.status && instance.status !== "scheduled") {
    raw.eventStatus = STATUS_MAP[instance.status];
  }
  if (instance.languages.length > 0) {
    raw.inLanguage =
      instance.languages.length === 1
        ? instance.languages[0]
        : instance.languages;
  }
  if (instance.location) {
    raw.location = {
      "@type": "Place",
      name: instance.location.name,
      sameAs: instance.location.osmUrl,
      ...(instance.location.address
        ? {
            address: {
              "@type": "PostalAddress",
              streetAddress: instance.location.address.street,
              addressLocality: instance.location.address.city,
              postalCode: instance.location.address.postalCode,
              addressCountry: instance.location.address.country,
            },
          }
        : {}),
    };
  }
  if (instance.performers.length > 0) {
    raw.performer = instance.performers.map((p) => ({
      "@type": "Person" as const,
      name: p.name,
      jobTitle: p.jobTitle,
    }));
  }

  return raw;
}

// ─── Serialisers: → string ────────────────────────────────────────────────────

/**
 * Serialise one or more RawEvents to a JSON string.
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

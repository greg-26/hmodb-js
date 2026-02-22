import type {
  RawEvent,
  RawPlace,
  RawSchedule,
  RawPerformer,
  ParsedEvent,
  ParsedLocation,
  ParsedSchedule,
  ParsedPerformer,
  EventStatusFriendly,
} from "./types.js";
import { EventStatus, DayOfWeekIndex } from "./types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function parseOsmId(sameAs?: string): { osmId?: string; osmUrl?: string } {
  if (!sameAs) return {};
  const match = sameAs.match(/openstreetmap\.org\/(node|way|relation)\/(\d+)/);
  if (!match) return { osmUrl: sameAs };
  return { osmId: `${match[1]}/${match[2]}`, osmUrl: sameAs };
}

function parseLocation(place?: RawPlace): ParsedLocation | undefined {
  if (!place) return undefined;
  const { osmId, osmUrl } = parseOsmId(place.sameAs);
  return {
    name: place.name,
    osmId,
    osmUrl,
    address: place.address
      ? {
          street: place.address.streetAddress,
          city: place.address.addressLocality,
          postalCode: place.address.postalCode,
          country: place.address.addressCountry,
        }
      : undefined,
  };
}

function parsePerformers(raw?: RawPerformer | RawPerformer[]): ParsedPerformer[] {
  return toArray(raw).map((p) => ({ name: p.name, jobTitle: p.jobTitle }));
}

function parseLanguages(raw?: string | string[]): string[] {
  return toArray(raw);
}

function parseStatus(raw?: string): EventStatusFriendly {
  switch (raw) {
    case EventStatus.Cancelled:   return "cancelled";
    case EventStatus.Postponed:   return "postponed";
    case EventStatus.Rescheduled: return "rescheduled";
    case EventStatus.MovedOnline: return "movedOnline";
    default:                      return "scheduled";
  }
}

function parseSchedule(raw: RawSchedule): ParsedSchedule {
  // Use shared day index; also accept short names ("Sunday") as fallback
  const shortNameIndex: Record<string, number> = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
    Thursday: 4, Friday: 5, Saturday: 6,
  };

  const days = toArray(raw.byDay)
    .map((d) => DayOfWeekIndex[d] ?? shortNameIndex[d])
    .filter((d) => d !== undefined) as number[];

  return {
    byDay: days,
    startTime: raw.startTime?.slice(0, 5), // normalize "HH:mm:ss" → "HH:mm"
    endTime: raw.endTime?.slice(0, 5),
    repeatFrequency: raw.repeatFrequency ?? "P1W",
    startDate: raw.startDate ? new Date(raw.startDate) : undefined,
    endDate: raw.endDate ? new Date(raw.endDate) : undefined,
    exceptDates: toArray(raw.exceptDate),
    timezone: raw.scheduleTimezone,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a single raw schema.org Event object into a typed ParsedEvent.
 */
export function parseEvent(raw: RawEvent): ParsedEvent {
  return {
    name: raw.name ?? "Mass",
    description: raw.description,
    serviceType: raw.additionalType,
    status: parseStatus(raw.eventStatus),
    location: parseLocation(raw.location),
    languages: parseLanguages(raw.inLanguage),
    performers: parsePerformers(raw.performer),
    startDate: raw.startDate ? new Date(raw.startDate) : undefined,
    endDate: raw.endDate ? new Date(raw.endDate) : undefined,
    previousStartDate: raw.previousStartDate
      ? new Date(raw.previousStartDate)
      : undefined,
    schedule: raw.eventSchedule ? parseSchedule(raw.eventSchedule) : undefined,
  };
}

/**
 * Parse an array of raw JSON-LD objects from a parish website.
 * Non-Event objects are silently ignored.
 */
export function parseEvents(rawEvents: unknown[]): ParsedEvent[] {
  return rawEvents
    .filter(
      (e): e is RawEvent =>
        typeof e === "object" && e !== null && (e as RawEvent)["@type"] === "Event"
    )
    .map(parseEvent);
}

/**
 * Extract JSON-LD Event objects from a raw JSON-LD payload.
 * Handles both a single object and an array at the top level.
 */
export function extractEventsFromJsonLd(jsonLd: unknown): RawEvent[] {
  const items = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
  return items.filter(
    (e): e is RawEvent =>
      typeof e === "object" && e !== null && (e as RawEvent)["@type"] === "Event"
  );
}

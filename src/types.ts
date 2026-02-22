/**
 * Types for the Mass Times Protocol (hmodb).
 * Based on schema.org Event + Schedule with protocol-specific extensions.
 * @see https://masstimesprotocol.org/implementation/data-model
 */

// ─── Wikidata service type identifiers ───────────────────────────────────────

export const WikidataId = {
  Mass: "https://www.wikidata.org/wiki/Q132612",
  TraditionalLatinMass: "https://www.wikidata.org/wiki/Q3504571",
  EucharisticAdoration: "https://www.wikidata.org/wiki/Q1232710",
  Confession: "https://www.wikidata.org/wiki/Q81825",
  Vespers: "https://www.wikidata.org/wiki/Q841208",
  Rosary: "https://www.wikidata.org/wiki/Q192427",
  FuneralMass: "https://www.wikidata.org/wiki/Q273026",
} as const;

export type WikidataServiceId = (typeof WikidataId)[keyof typeof WikidataId];

/**
 * Accepts a known WikidataServiceId (with full intellisense) or any other
 * valid Wikidata URL. The `string & {}` trick preserves autocomplete while
 * still allowing extension to custom identifiers.
 */
export type ServiceTypeInput = WikidataServiceId | (string & {});

// ─── Event status ─────────────────────────────────────────────────────────────

export const EventStatus = {
  Scheduled: "https://schema.org/EventScheduled",
  Cancelled: "https://schema.org/EventCancelled",
  Postponed: "https://schema.org/EventPostponed",
  Rescheduled: "https://schema.org/EventRescheduled",
  MovedOnline: "https://schema.org/EventMovedOnline",
} as const;

export type EventStatusValue = (typeof EventStatus)[keyof typeof EventStatus];

/** Friendly status string used in parsed/resolved output */
export type EventStatusFriendly =
  | "scheduled"
  | "cancelled"
  | "postponed"
  | "rescheduled"
  | "movedOnline";

// ─── Shared day-of-week constants ─────────────────────────────────────────────

/** schema.org DayOfWeek URIs indexed by friendly name */
export const DayOfWeekURI = {
  Sunday: "https://schema.org/Sunday",
  Monday: "https://schema.org/Monday",
  Tuesday: "https://schema.org/Tuesday",
  Wednesday: "https://schema.org/Wednesday",
  Thursday: "https://schema.org/Thursday",
  Friday: "https://schema.org/Friday",
  Saturday: "https://schema.org/Saturday",
} as const;

/** schema.org DayOfWeek URIs indexed by JS day number (0 = Sunday) */
export const DayOfWeekURIByIndex: string[] = [
  DayOfWeekURI.Sunday,
  DayOfWeekURI.Monday,
  DayOfWeekURI.Tuesday,
  DayOfWeekURI.Wednesday,
  DayOfWeekURI.Thursday,
  DayOfWeekURI.Friday,
  DayOfWeekURI.Saturday,
];

/** Reverse map: schema.org URI → JS day number (0 = Sunday) */
export const DayOfWeekIndex: Record<string, number> = Object.fromEntries(
  Object.entries(DayOfWeekURI).map(([name, uri]) => [
    uri,
    ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(name),
  ])
);

// ─── Event filter ─────────────────────────────────────────────────────────────

export interface EventFilter {
  /**
   * Only return events matching these Wikidata service type(s).
   * Use `WikidataId.*` constants for convenience and intellisense.
   *
   * @example
   * serviceType: WikidataId.Mass
   * serviceType: [WikidataId.Mass, WikidataId.EucharisticAdoration]
   */
  serviceType?: ServiceTypeInput | ServiceTypeInput[];

  /**
   * Only return events matching these BCP 47 language code(s).
   *
   * @example
   * language: "la"           // Latin only
   * language: ["en", "es"]   // English or Spanish
   */
  language?: string | string[];

  /**
   * Whether to include events that have no `additionalType` set.
   * Defaults to `false` when a `serviceType` filter is active, `true` otherwise.
   */
  includeUntyped?: boolean;

  /**
   * Whether to include events that have no `inLanguage` set.
   * Defaults to `false` when a `language` filter is active, `true` otherwise.
   *
   * Set to `true` to catch parishes that publish in your language but haven't
   * adopted `inLanguage` yet.
   */
  includeLanguageUnknown?: boolean;
}

// ─── Raw JSON-LD types (as they appear on parish websites) ───────────────────

export interface RawPlace {
  "@type": "Place";
  name?: string;
  /** OpenStreetMap URL — e.g. https://www.openstreetmap.org/node/123456789 */
  sameAs?: string;
  address?: {
    "@type": "PostalAddress";
    streetAddress?: string;
    addressLocality?: string;
    postalCode?: string;
    addressCountry?: string;
  };
}

export interface RawSchedule {
  "@type": "Schedule";
  byDay?: string | string[]; // schema.org DayOfWeek URIs
  startTime?: string;        // "HH:mm" or "HH:mm:ss"
  endTime?: string;
  repeatFrequency?: string;  // ISO 8601 duration: "P1W", "P1D", "P2W", etc.
  startDate?: string;        // "YYYY-MM-DD"
  endDate?: string;          // "YYYY-MM-DD"
  exceptDate?: string | string[]; // "YYYY-MM-DD"
  scheduleTimezone?: string; // IANA timezone e.g. "Europe/Madrid"
}

export interface RawPerformer {
  "@type": "Person";
  name?: string;
  jobTitle?: string;
}

export interface RawEvent {
  "@context"?: string;
  "@type": "Event";
  name?: string;
  description?: string;
  additionalType?: string;   // Wikidata URL
  startDate?: string;        // "YYYY-MM-DDTHH:mm:ssZ" or "YYYY-MM-DD"
  endDate?: string;
  previousStartDate?: string; // for EventRescheduled
  eventStatus?: string;       // schema.org EventStatusType URL
  eventSchedule?: RawSchedule;
  location?: RawPlace;
  inLanguage?: string | string[]; // BCP 47 language tags
  performer?: RawPerformer | RawPerformer[];
  image?: string;
}

// ─── Parsed / resolved types ──────────────────────────────────────────────────

export interface ParsedLocation {
  name?: string;
  /** "node/123456789", "way/456", or "relation/789" */
  osmId?: string;
  /** Full OpenStreetMap URL */
  osmUrl?: string;
  address?: {
    street?: string;
    city?: string;
    postalCode?: string;
    country?: string;
  };
}

export interface ParsedPerformer {
  name?: string;
  jobTitle?: string;
}

/** A recurring schedule that needs to be expanded into concrete instances */
export interface ParsedSchedule {
  /** Days of the week (0 = Sunday, 1 = Monday, ... 6 = Saturday) */
  byDay: number[];
  /** "HH:mm" */
  startTime?: string;
  /** "HH:mm" */
  endTime?: string;
  /** ISO 8601 duration string */
  repeatFrequency: string;
  startDate?: Date;
  endDate?: Date;
  exceptDates: string[]; // "YYYY-MM-DD"
  timezone?: string;
}

/** A parsed Event that may be a one-off or a recurring schedule */
export interface ParsedEvent {
  name: string;
  description?: string;
  serviceType?: string;
  status: EventStatusFriendly;
  location?: ParsedLocation;
  languages: string[];
  performers: ParsedPerformer[];
  startDate?: Date;
  endDate?: Date;
  previousStartDate?: Date;
  schedule?: ParsedSchedule;
}

/**
 * A single resolved service instance with a concrete start time.
 * The output of `getUpcomingEvents()`.
 */
export interface EventInstance {
  startDate: Date;
  endDate?: Date;
  name: string;
  description?: string;
  /** Wikidata service type URL */
  serviceType?: string;
  status: EventStatusFriendly;
  location?: ParsedLocation;
  /** BCP 47 language codes */
  languages: string[];
  performers: ParsedPerformer[];
  /** For rescheduled events: the original start time */
  previousStartDate?: Date;
}

/**
 * @deprecated Use `EventInstance` instead.
 * Kept for backwards compatibility — will be removed in v1.0.
 */
export type MassInstance = EventInstance;

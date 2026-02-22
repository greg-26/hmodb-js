/**
 * Types for the Mass Times Protocol (hmodb).
 * Based on schema.org Event + Schedule with protocol-specific extensions.
 * @see https://masstimesprotocol.org/implementation/data-model
 */

// ─── Wikidata service type identifiers ──────────────────────────────────────

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

// ─── Event status ────────────────────────────────────────────────────────────

export const EventStatus = {
  Scheduled: "https://schema.org/EventScheduled",
  Cancelled: "https://schema.org/EventCancelled",
  Postponed: "https://schema.org/EventPostponed",
  Rescheduled: "https://schema.org/EventRescheduled",
  MovedOnline: "https://schema.org/EventMovedOnline",
} as const;

export type EventStatusValue = (typeof EventStatus)[keyof typeof EventStatus];

// ─── Raw JSON-LD types (as they appear on parish websites) ───────────────────

export interface RawPlace {
  "@type": "Place";
  name?: string;
  sameAs?: string; // OpenStreetMap URL e.g. https://www.openstreetmap.org/node/123456789
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
  startTime?: string; // "HH:mm" or "HH:mm:ss"
  endTime?: string;
  repeatFrequency?: string; // ISO 8601 duration: "P1W", "P1D", etc.
  startDate?: string; // "YYYY-MM-DD"
  endDate?: string; // "YYYY-MM-DD"
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
  additionalType?: string; // Wikidata URL
  startDate?: string; // "YYYY-MM-DDTHH:mm:ssZ" or "YYYY-MM-DD"
  endDate?: string;
  previousStartDate?: string; // for EventRescheduled
  eventStatus?: string; // schema.org EventStatusType URL
  eventSchedule?: RawSchedule;
  location?: RawPlace;
  inLanguage?: string | string[]; // BCP 47 language tags
  performer?: RawPerformer | RawPerformer[];
  image?: string;
}

// ─── Parsed / resolved types ─────────────────────────────────────────────────

export interface ParsedLocation {
  name?: string;
  /** OpenStreetMap node/way/relation ID extracted from the sameAs URL */
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

/** A single resolved Mass instance with a concrete start time */
export interface MassInstance {
  /** Resolved local start time */
  startDate: Date;
  /** Resolved local end time (if known) */
  endDate?: Date;
  name: string;
  description?: string;
  /** Wikidata service type URL */
  serviceType?: string;
  status: "scheduled" | "cancelled" | "postponed" | "rescheduled" | "movedOnline";
  location?: ParsedLocation;
  /** BCP 47 language codes */
  languages: string[];
  performers: ParsedPerformer[];
  /** For rescheduled events: the original start time */
  previousStartDate?: Date;
}

/** A parsed Event that may be a one-off or a recurring schedule */
export interface ParsedEvent {
  name: string;
  description?: string;
  serviceType?: string;
  status: MassInstance["status"];
  location?: ParsedLocation;
  languages: string[];
  performers: ParsedPerformer[];
  /** Set for one-off events */
  startDate?: Date;
  endDate?: Date;
  previousStartDate?: Date;
  /** Set for recurring schedule events */
  schedule?: ParsedSchedule;
}

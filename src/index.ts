/**
 * hmodb — Mass Times Protocol parser & generator
 *
 * Parse JSON-LD Mass schedule data from parish websites into typed objects,
 * or generate correct JSON-LD for parishes to publish.
 *
 * @see https://masstimesprotocol.org
 * @see https://github.com/asopenag/hmodb
 */

// ─── Parse ────────────────────────────────────────────────────────────────────
export { parseEvent, parseEvents, extractEventsFromJsonLd } from "./parse.js";

// ─── Resolve ──────────────────────────────────────────────────────────────────
export { expandSchedule, getUpcomingEvents, getUpcomingMasses } from "./schedule.js";
export type { ExpandOptions } from "./schedule.js";

// ─── Generate ─────────────────────────────────────────────────────────────────
export {
  buildEvent,
  buildSchedule,
  buildLocation,
  buildCancellation,
  buildRescheduled,
  toJsonLd,
  instanceToJsonLd,
  toJsonLdString,
  toScriptTag,
  validate,
} from "./generate.js";

export type {
  DayName,
  ScheduleOptions,
  LocationOptions,
  EventOptions,
  CancellationOptions,
  RescheduleOptions,
  ValidationIssue,
  ValidationResult,
} from "./generate.js";

// ─── Types ────────────────────────────────────────────────────────────────────
export {
  WikidataId,
  EventStatus,
  DayOfWeekURI,
  type ServiceTypeInput,
  type WikidataServiceId,
  type EventStatusValue,
  type EventStatusFriendly,
  type EventFilter,
  // Raw JSON-LD shapes
  type RawEvent,
  type RawPlace,
  type RawSchedule,
  type RawPerformer,
  // Parsed intermediate types
  type ParsedEvent,
  type ParsedLocation,
  type ParsedSchedule,
  type ParsedPerformer,
  // Resolved output
  type EventInstance,
  // Deprecated alias
  type MassInstance,
} from "./types.js";

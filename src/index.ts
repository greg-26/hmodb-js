/**
 * hmodb — Mass Times Protocol parser
 *
 * Parse JSON-LD Mass schedule data from parish websites into usable
 * typed objects, with full support for recurring schedules, seasonal
 * changes, cancellations, and rescheduling.
 *
 * @see https://masstimesprotocol.org
 */

export { parseEvent, parseEvents, extractEventsFromJsonLd } from "./parse.js";
export { expandSchedule, getUpcomingMasses } from "./schedule.js";
export type {
  // Raw JSON-LD shapes
  RawEvent,
  RawPlace,
  RawSchedule,
  RawPerformer,
  // Parsed intermediate types
  ParsedEvent,
  ParsedLocation,
  ParsedSchedule,
  ParsedPerformer,
  // Resolved output
  MassInstance,
} from "./types.js";
export {
  WikidataId,
  EventStatus,
  type WikidataServiceId,
  type EventStatusValue,
} from "./types.js";
export type { ExpandOptions } from "./schedule.js";

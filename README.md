# hmodb

JavaScript/TypeScript library for the [Mass Times Protocol](https://masstimesprotocol.org).

Parse JSON-LD Mass schedule data from parish websites into typed, usable objects — with full support for recurring schedules, seasonal changes, cancellations, and rescheduling.

## Install

```bash
npm install hmodb
# or
pnpm add hmodb
```

## Quick start

```typescript
import { parseEvents, getUpcomingMasses } from "hmodb";

// JSON-LD from a parish website (fetch + parse from the page's <script> tags)
const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "Event",
    "name": "Sunday Mass",
    "additionalType": "https://www.wikidata.org/wiki/Q132612",
    "inLanguage": "es",
    "eventSchedule": {
      "@type": "Schedule",
      "byDay": "https://schema.org/Sunday",
      "startTime": "11:00",
      "endTime": "12:00",
      "repeatFrequency": "P1W",
      "startDate": "2025-10-01",
      "endDate": "2026-06-30",
      "scheduleTimezone": "Europe/Madrid"
    },
    "location": {
      "@type": "Place",
      "name": "Cathedral of Our Lady",
      "sameAs": "https://www.openstreetmap.org/node/123456789"
    }
  }
];

const events = parseEvents(jsonLd);

const masses = getUpcomingMasses(events, {
  from: new Date(),
  to: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // next 7 days
});

for (const mass of masses) {
  console.log(`${mass.name} — ${mass.startDate.toLocaleString()}`);
  console.log(`  Location: ${mass.location?.name} (OSM: ${mass.location?.osmId})`);
  console.log(`  Language: ${mass.languages.join(", ") || "unspecified"}`);
  console.log(`  Status: ${mass.status}`);
}
```

## API

### `parseEvents(rawEvents: unknown[]): ParsedEvent[]`

Parse an array of raw JSON-LD objects. Non-Event items are silently ignored.

### `parseEvent(raw: RawEvent): ParsedEvent`

Parse a single JSON-LD Event object.

### `getUpcomingMasses(events: ParsedEvent[], opts?: ExpandOptions): MassInstance[]`

Resolve parsed events into concrete `MassInstance` objects within a time window.

- Recurring schedules are expanded into individual instances
- Stale schedules (endDate in the past) are skipped automatically
- `eventStatus: EventCancelled/EventRescheduled` one-off entries override matching scheduled instances
- Results are sorted by start time

```typescript
interface ExpandOptions {
  from?: Date;  // default: now
  to?: Date;    // default: 30 days from `from`
  limit?: number; // safety cap, default 500
}
```

### `expandSchedule(schedule: ParsedSchedule, opts?: ExpandOptions): Date[]`

Lower-level: expand a parsed Schedule into concrete Date instances.

### Constants

```typescript
import { WikidataId, EventStatus } from "hmodb";

WikidataId.Mass               // "https://www.wikidata.org/wiki/Q132612"
WikidataId.TraditionalLatinMass
WikidataId.EucharisticAdoration
WikidataId.Confession
WikidataId.Vespers
WikidataId.Rosary
WikidataId.FuneralMass

EventStatus.Scheduled         // "https://schema.org/EventScheduled"
EventStatus.Cancelled         // "https://schema.org/EventCancelled"
EventStatus.Postponed
EventStatus.Rescheduled
EventStatus.MovedOnline
```

## Data Model

See [masstimesprotocol.org/implementation/data-model](https://masstimesprotocol.org/implementation/data-model) for the full protocol spec.

Key fields supported:

| Field | Type | Description |
|-------|------|-------------|
| `additionalType` | Wikidata URL | Service type (Mass, TLM, Adoration, etc.) |
| `inLanguage` | BCP 47 string / string[] | Mass language (`"es"`, `"la"`, `["es","en"]`) |
| `eventStatus` | schema.org EventStatusType | Scheduled, Cancelled, Rescheduled, etc. |
| `eventSchedule` | schema.org Schedule | Recurring schedule with `byDay`, `exceptDate`, seasonal bounds |
| `location.sameAs` | OpenStreetMap URL | Church location (OSM node/way/relation) |

## License

MIT

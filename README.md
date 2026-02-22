# hmodb

[![CI](https://github.com/greg-26/hmodb-js/actions/workflows/ci.yml/badge.svg)](https://github.com/greg-26/hmodb-js/actions/workflows/ci.yml)

JavaScript/TypeScript library for the [Mass Times Protocol](https://masstimesprotocol.org) — the open standard for Catholic Mass schedules.

Parse JSON-LD from parish websites into typed objects, or generate correct JSON-LD for parishes to publish. Full support for recurring schedules, seasonal changes, cancellations, and rescheduling.

**Protocol spec:** [asopenag/hmodb](https://github.com/asopenag/hmodb) · **Docs:** [masstimesprotocol.org](https://masstimesprotocol.org)

---

## Install

```bash
npm install hmodb
# or
pnpm add hmodb
```

## Quick start — Parse (JSON-LD → events)

```typescript
import { parseEvents, getUpcomingEvents, WikidataId } from "hmodb";

// Raw JSON-LD from a parish website's <script type="application/ld+json"> tags
const events = parseEvents(jsonLdArray);

const masses = getUpcomingEvents(events, {
  serviceType: WikidataId.Mass,
  from: new Date(),
  to: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // next 7 days
});

for (const mass of masses) {
  console.log(`${mass.name} — ${mass.startDate.toLocaleString()}`);
  console.log(`  Location: ${mass.location?.name} (OSM: ${mass.location?.osmId})`);
  console.log(`  Language: ${mass.languages.join(", ") || "unspecified"}`);
  console.log(`  Status:   ${mass.status}`);
}
```

## Quick start — Generate (events → JSON-LD)

```typescript
import { buildEvent, buildSchedule, buildCancellation, toScriptTag, WikidataId } from "hmodb";

// Recurring weekly Mass
const mass = buildEvent({
  name: "Sunday Mass",
  serviceType: WikidataId.Mass,
  language: "es",
  location: { name: "Cathedral of Our Lady", osmId: "node/123456789" },
  schedule: buildSchedule({
    days: ["Sunday"],
    startTime: "11:00",
    endTime: "12:00",
    timezone: "Europe/Madrid",
    from: "2025-10-01",
    until: "2026-06-30",
  }),
});

// Paste into your <head>
console.log(toScriptTag(mass));

// Validate before publishing
import { validate } from "hmodb";
const result = validate(mass);
if (!result.valid) {
  result.issues.forEach(i => console.error(`[${i.severity}] ${i.field}: ${i.message}`));
}
```

---

## API Reference

### Parse

| Function | Description |
|----------|-------------|
| `parseEvents(raw[])` | Parse an array of raw JSON-LD objects. Non-Event items are ignored. |
| `parseEvent(raw)` | Parse a single JSON-LD Event object. |
| `extractEventsFromJsonLd(jsonLd)` | Extract Event objects from a raw JSON-LD payload (handles arrays and single objects). |

### Resolve

| Function | Description |
|----------|-------------|
| `getUpcomingEvents(events, opts?)` | Primary API. Resolve ParsedEvents to concrete `EventInstance[]` within a time window, with optional filtering. |
| `getUpcomingMasses(events, opts?)` | Convenience wrapper — Mass events only, includes events without `additionalType`. |
| `expandSchedule(schedule, opts?)` | Lower-level: expand a ParsedSchedule into concrete Date instances. |

#### `getUpcomingEvents` options

```typescript
interface ExpandOptions & EventFilter {
  from?: Date;                // default: now
  to?: Date;                  // default: 30 days from `from`
  limit?: number;             // safety cap, default 500

  serviceType?: WikidataServiceId | WikidataServiceId[];  // filter by service type
  language?: string | string[];                           // filter by BCP 47 language
  includeUntyped?: boolean;           // include events with no additionalType (default: false when filter active)
  includeLanguageUnknown?: boolean;   // include events with no inLanguage (default: false when filter active)
}
```

### Generate

| Function | Description |
|----------|-------------|
| `buildEvent(opts)` | Build a schema.org Event (one-off or recurring). |
| `buildSchedule(opts)` | Build a schema.org Schedule for recurring events. Returns `RawSchedule`. |
| `buildLocation(opts)` | Build a schema.org Place. Accepts short OSM ids (`"node/123"`). |
| `buildCancellation(opts)` | Build an `EventCancelled` one-off override. |
| `buildRescheduled(opts)` | Build an `EventRescheduled` entry with `previousStartDate`. |
| `validate(event)` | Validate a RawEvent against protocol rules. Returns `ValidationResult`. |
| `toJsonLd(event)` | Convert a `ParsedEvent` back to a `RawEvent`. |
| `instanceToJsonLd(instance)` | Convert a resolved `EventInstance` back to a `RawEvent`. |
| `toJsonLdString(events)` | Serialise to JSON string. |
| `toScriptTag(events)` | Produce a `<script type="application/ld+json">` tag. |

### Constants

```typescript
import { WikidataId, EventStatus, DayOfWeekURI } from "hmodb";

// Service types
WikidataId.Mass                // "https://www.wikidata.org/wiki/Q132612"
WikidataId.TraditionalLatinMass
WikidataId.EucharisticAdoration
WikidataId.Confession
WikidataId.Vespers
WikidataId.Rosary
WikidataId.FuneralMass

// Event status
EventStatus.Scheduled         // "https://schema.org/EventScheduled"
EventStatus.Cancelled
EventStatus.Postponed
EventStatus.Rescheduled
EventStatus.MovedOnline
```

---

## Protocol

This library implements the [Mass Times Protocol](https://masstimesprotocol.org) — an open standard for sharing Catholic Mass schedules using schema.org JSON-LD and OpenStreetMap locations.

**Protocol spec & docs:** [asopenag/hmodb](https://github.com/asopenag/hmodb)  
**Key fields supported:**

| Field | Type | Description |
|-------|------|-------------|
| `additionalType` | Wikidata URL | Service type (Mass, TLM, Adoration, etc.) |
| `inLanguage` | BCP 47 | Mass language (`"es"`, `"la"`, `["es","en"]`) |
| `eventStatus` | schema.org | Scheduled, Cancelled, Rescheduled… |
| `eventSchedule` | schema.org Schedule | Recurring schedule with `byDay`, `exceptDate`, seasonal bounds |
| `location.sameAs` | OpenStreetMap URL | Church location (OSM node/way/relation) |

---

## License

MIT

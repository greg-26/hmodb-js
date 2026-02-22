import { describe, it, expect } from "vitest";
import {
  buildEvent,
  buildSchedule,
  buildLocation,
  buildCancellation,
  buildRescheduled,
  toJsonLd,
  toJsonLdString,
  toScriptTag,
} from "./generate.js";
import { parseEvent } from "./parse.js";
import { WikidataId, EventStatus } from "./types.js";

describe("buildLocation", () => {
  it("produces a Place with sameAs from short osmId", () => {
    const place = buildLocation({ name: "Cathedral", osmId: "node/123456789" });
    expect(place["@type"]).toBe("Place");
    expect(place.name).toBe("Cathedral");
    expect(place.sameAs).toBe("https://www.openstreetmap.org/node/123456789");
  });

  it("passes through a full OSM URL unchanged", () => {
    const place = buildLocation({
      osmId: "https://www.openstreetmap.org/way/987",
    });
    expect(place.sameAs).toBe("https://www.openstreetmap.org/way/987");
  });

  it("includes address fields", () => {
    const place = buildLocation({
      address: { street: "Gran Vía 1", city: "Madrid", country: "ES" },
    });
    expect(place.address?.streetAddress).toBe("Gran Vía 1");
    expect(place.address?.addressCountry).toBe("ES");
  });
});

describe("buildEvent", () => {
  it("produces a minimal one-off event", () => {
    const event = buildEvent({
      name: "Ash Wednesday Mass",
      startDate: "2026-02-18T10:00:00+01:00",
    });
    expect(event["@type"]).toBe("Event");
    expect(event["@context"]).toBe("https://schema.org");
    expect(event.name).toBe("Ash Wednesday Mass");
    expect(event.startDate).toBe("2026-02-18T10:00:00+01:00");
    expect(event.additionalType).toBeUndefined(); // not forced
    expect(event.eventSchedule).toBeUndefined();
  });

  it("sets additionalType when serviceType is provided", () => {
    const event = buildEvent({
      name: "Sunday Mass",
      serviceType: WikidataId.Mass,
      startDate: "2026-03-01T11:00:00+01:00",
    });
    expect(event.additionalType).toBe(WikidataId.Mass);
  });

  it("builds a recurring event with a schedule", () => {
    const event = buildEvent({
      name: "Sunday Mass",
      serviceType: WikidataId.Mass,
      language: "es",
      location: { name: "Cathedral", osmId: "node/123" },
      schedule: {
        days: ["Sunday"],
        startTime: "11:00",
        endTime: "12:00",
        timezone: "Europe/Madrid",
        from: "2025-10-01",
        until: "2026-06-30",
      },
    });

    expect(event.eventSchedule).toBeDefined();
    expect(event.eventSchedule!["@type"]).toBe("Schedule");
    expect(event.eventSchedule!.byDay).toBe("https://schema.org/Sunday");
    expect(event.eventSchedule!.startTime).toBe("11:00");
    expect(event.eventSchedule!.endTime).toBe("12:00");
    expect(event.eventSchedule!.scheduleTimezone).toBe("Europe/Madrid");
    expect(event.eventSchedule!.startDate).toBe("2025-10-01");
    expect(event.eventSchedule!.endDate).toBe("2026-06-30");
    expect(event.inLanguage).toBe("es");
    expect(event.location?.name).toBe("Cathedral");
  });

  it("converts multiple days to an array of URIs", () => {
    const event = buildEvent({
      name: "Weekday Mass",
      schedule: {
        days: ["Monday", "Wednesday", "Friday"],
        startTime: "09:00",
      },
    });
    expect(event.eventSchedule!.byDay).toEqual([
      "https://schema.org/Monday",
      "https://schema.org/Wednesday",
      "https://schema.org/Friday",
    ]);
  });

  it("defaults repeatFrequency to P1W", () => {
    const event = buildEvent({
      name: "Mass",
      schedule: { days: ["Sunday"], startTime: "11:00" },
    });
    expect(event.eventSchedule!.repeatFrequency).toBe("P1W");
  });

  it("passes through a custom repeatFrequency", () => {
    const event = buildEvent({
      name: "Biweekly Mass",
      schedule: { days: ["Sunday"], startTime: "11:00", repeatFrequency: "P2W" },
    });
    expect(event.eventSchedule!.repeatFrequency).toBe("P2W");
  });

  it("includes exceptDate", () => {
    const event = buildEvent({
      name: "Weekday Mass",
      schedule: {
        days: ["Monday"],
        startTime: "09:00",
        except: ["2025-08-15", "2025-12-25"],
      },
    });
    expect(event.eventSchedule!.exceptDate).toEqual(["2025-08-15", "2025-12-25"]);
  });

  it("handles bilingual inLanguage", () => {
    const event = buildEvent({
      name: "Bilingual Mass",
      startDate: "2026-03-01T11:00:00Z",
      language: ["es", "en"],
    });
    expect(event.inLanguage).toEqual(["es", "en"]);
  });
});

describe("buildCancellation", () => {
  it("produces an EventCancelled entry", () => {
    const c = buildCancellation({
      date: "2025-12-28T11:00:00+01:00",
      location: { osmId: "node/123" },
    });
    expect(c.eventStatus).toBe(EventStatus.Cancelled);
    expect(c.startDate).toBe("2025-12-28T11:00:00+01:00");
    expect(c.name).toBe("Mass — Cancelled");
  });

  it("accepts a custom name", () => {
    const c = buildCancellation({ name: "Sunday Mass — Cancelled", date: "2025-12-28T11:00:00Z" });
    expect(c.name).toBe("Sunday Mass — Cancelled");
  });
});

describe("buildRescheduled", () => {
  it("produces an EventRescheduled entry with previousStartDate", () => {
    const r = buildRescheduled({
      originalDate: "2025-03-16T11:00:00+01:00",
      newDate: "2025-03-16T12:00:00+01:00",
    });
    expect(r.eventStatus).toBe(EventStatus.Rescheduled);
    expect(r.startDate).toBe("2025-03-16T12:00:00+01:00");
    expect(r.previousStartDate).toBe("2025-03-16T11:00:00+01:00");
  });
});

describe("toJsonLd (round-trip)", () => {
  it("round-trips a one-off event", () => {
    const raw = buildEvent({
      name: "Ash Wednesday Mass",
      serviceType: WikidataId.Mass,
      language: "es",
      startDate: "2026-02-18T10:00:00+01:00",
      location: { name: "Cathedral", osmId: "node/123456789" },
    });
    const parsed = parseEvent(raw);
    const back = toJsonLd(parsed);

    expect(back.name).toBe("Ash Wednesday Mass");
    expect(back.additionalType).toBe(WikidataId.Mass);
    expect(back.inLanguage).toBe("es");
    expect(back.location?.sameAs).toBe("https://www.openstreetmap.org/node/123456789");
  });

  it("round-trips a recurring event", () => {
    const raw = buildEvent({
      name: "Sunday Mass",
      serviceType: WikidataId.Mass,
      schedule: {
        days: ["Sunday"],
        startTime: "11:00",
        timezone: "Europe/Madrid",
        from: "2025-10-01",
        until: "2026-06-30",
        except: "2025-12-25",
      },
    });
    const parsed = parseEvent(raw);
    const back = toJsonLd(parsed);

    expect(back.eventSchedule!.byDay).toBe("https://schema.org/Sunday");
    expect(back.eventSchedule!.startTime).toBe("11:00");
    expect(back.eventSchedule!.scheduleTimezone).toBe("Europe/Madrid");
    expect(back.eventSchedule!.startDate).toBe("2025-10-01");
    expect(back.eventSchedule!.endDate).toBe("2026-06-30");
    expect(back.eventSchedule!.exceptDate).toBe("2025-12-25");
  });
});

describe("serialisers", () => {
  const event = buildEvent({ name: "Sunday Mass", startDate: "2026-03-01T11:00:00Z" });

  it("toJsonLdString produces valid JSON", () => {
    const str = toJsonLdString(event);
    expect(() => JSON.parse(str)).not.toThrow();
    expect(JSON.parse(str).name).toBe("Sunday Mass");
  });

  it("toScriptTag wraps output in a script tag", () => {
    const tag = toScriptTag(event);
    expect(tag).toMatch(/^<script type="application\/ld\+json">/);
    expect(tag).toMatch(/<\/script>$/);
  });

  it("toScriptTag handles an array of events", () => {
    const event2 = buildEvent({ name: "Adoration", startDate: "2026-03-01T18:00:00Z" });
    const tag = toScriptTag([event, event2]);
    const parsed = JSON.parse(tag.replace(/<[^>]+>/g, "").trim());
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
  });
});

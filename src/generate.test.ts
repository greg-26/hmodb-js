import { describe, it, expect } from "vitest";
import {
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
    const place = buildLocation({ osmId: "https://www.openstreetmap.org/way/987" });
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

describe("buildSchedule", () => {
  it("returns a RawSchedule (not just options)", () => {
    const s = buildSchedule({ days: ["Sunday"], startTime: "11:00" });
    expect(s["@type"]).toBe("Schedule");
  });

  it("converts day names to schema.org URIs", () => {
    const s = buildSchedule({ days: ["Sunday", "Wednesday"], startTime: "09:00" });
    expect(s.byDay).toEqual([
      "https://schema.org/Sunday",
      "https://schema.org/Wednesday",
    ]);
  });

  it("uses single string for single day (not an array)", () => {
    const s = buildSchedule({ days: ["Monday"], startTime: "07:30" });
    expect(s.byDay).toBe("https://schema.org/Monday");
  });

  it("defaults repeatFrequency to P1W", () => {
    const s = buildSchedule({ days: ["Sunday"], startTime: "11:00" });
    expect(s.repeatFrequency).toBe("P1W");
  });

  it("passes except through correctly (single string)", () => {
    const s = buildSchedule({
      days: ["Monday"],
      startTime: "09:00",
      except: "2025-08-15",
    });
    expect(s.exceptDate).toBe("2025-08-15");
  });

  it("passes except through correctly (array)", () => {
    const s = buildSchedule({
      days: ["Monday"],
      startTime: "09:00",
      except: ["2025-08-15", "2025-12-25"],
    });
    expect(s.exceptDate).toEqual(["2025-08-15", "2025-12-25"]);
  });
});

describe("buildEvent", () => {
  it("produces a minimal one-off event", () => {
    const event = buildEvent({ name: "Ash Wednesday Mass", startDate: "2026-02-18T10:00:00+01:00" });
    expect(event["@type"]).toBe("Event");
    expect(event["@context"]).toBe("https://schema.org");
    expect(event.name).toBe("Ash Wednesday Mass");
    expect(event.startDate).toBe("2026-02-18T10:00:00+01:00");
    expect(event.additionalType).toBeUndefined();
  });

  it("sets additionalType when serviceType is provided", () => {
    const event = buildEvent({
      name: "Sunday Mass",
      serviceType: WikidataId.Mass,
      startDate: "2026-03-01T11:00:00+01:00",
    });
    expect(event.additionalType).toBe(WikidataId.Mass);
  });

  it("accepts a RawSchedule from buildSchedule()", () => {
    const schedule = buildSchedule({
      days: ["Sunday"],
      startTime: "11:00",
      timezone: "Europe/Madrid",
      from: "2025-10-01",
      until: "2026-06-30",
    });
    const event = buildEvent({
      name: "Sunday Mass",
      schedule,
      location: { name: "Cathedral", osmId: "node/123" },
    });
    expect(event.eventSchedule).toBe(schedule); // same object reference
    expect(event.eventSchedule!.byDay).toBe("https://schema.org/Sunday");
    expect(event.location?.name).toBe("Cathedral");
  });

  it("converts multiple days correctly via buildSchedule", () => {
    const s = buildSchedule({ days: ["Monday", "Wednesday", "Friday"], startTime: "09:00" });
    expect(s.byDay).toEqual([
      "https://schema.org/Monday",
      "https://schema.org/Wednesday",
      "https://schema.org/Friday",
    ]);
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
    const c = buildCancellation({ date: "2025-12-28T11:00:00+01:00", location: { osmId: "node/123" } });
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

describe("validate", () => {
  it("passes a minimal valid one-off event", () => {
    const event = buildEvent({
      name: "Mass",
      startDate: "2026-03-01T11:00:00+01:00",
      location: { osmId: "node/123" },
    });
    const result = validate(event);
    expect(result.valid).toBe(true);
  });

  it("errors when neither startDate nor eventSchedule is set", () => {
    const event = buildEvent({ name: "Mystery Event" });
    const result = validate(event);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.severity === "error" && i.field.includes("startDate"))).toBe(true);
  });

  it("errors on invalid startDate", () => {
    const event: any = buildEvent({ name: "Mass", startDate: "not-a-date" });
    const result = validate(event);
    expect(result.valid).toBe(false);
  });

  it("errors when schedule endDate is in the past", () => {
    const event = buildEvent({
      name: "Old Mass",
      schedule: buildSchedule({
        days: ["Sunday"],
        startTime: "11:00",
        from: "2020-01-01",
        until: "2020-12-31",
      }),
    });
    const result = validate(event);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === "eventSchedule.endDate")).toBe(true);
  });

  it("warns when no location is set", () => {
    const event = buildEvent({ name: "Mass", startDate: "2026-03-01T11:00:00Z" });
    const result = validate(event);
    expect(result.valid).toBe(true); // warning only, not error
    expect(result.issues.some((i) => i.field === "location" && i.severity === "warning")).toBe(true);
  });

  it("warns when location has no sameAs (OSM link)", () => {
    const event = buildEvent({
      name: "Mass",
      startDate: "2026-03-01T11:00:00Z",
      location: { name: "Some Church" }, // no osmId
    });
    const result = validate(event);
    expect(result.issues.some((i) => i.field === "location.sameAs")).toBe(true);
  });

  it("warns when no additionalType set", () => {
    const event = buildEvent({ name: "Mass", startDate: "2026-03-01T11:00:00Z" });
    const result = validate(event);
    expect(result.issues.some((i) => i.field === "additionalType")).toBe(true);
  });

  it("warns when schedule has no timezone", () => {
    const event = buildEvent({
      name: "Mass",
      schedule: buildSchedule({
        days: ["Sunday"],
        startTime: "11:00",
        from: "2026-01-01",
        until: "2026-12-31",
        // no timezone
      }),
    });
    const result = validate(event);
    expect(result.issues.some((i) => i.field === "eventSchedule.scheduleTimezone")).toBe(true);
  });

  it("warns when schedule has no startDate/endDate bounds", () => {
    const event = buildEvent({
      name: "Mass",
      schedule: buildSchedule({
        days: ["Sunday"],
        startTime: "11:00",
        timezone: "Europe/Madrid",
        // no from/until
      }),
    });
    const result = validate(event);
    expect(
      result.issues.some((i) => i.field === "eventSchedule.startDate / endDate")
    ).toBe(true);
  });
});

describe("toJsonLd (ParsedEvent round-trip)", () => {
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
      schedule: buildSchedule({
        days: ["Sunday"],
        startTime: "11:00",
        timezone: "Europe/Madrid",
        from: "2025-10-01",
        until: "2026-06-30",
        except: "2025-12-25",
      }),
    });
    const parsed = parseEvent(raw);
    const back = toJsonLd(parsed);
    expect(back.eventSchedule!.byDay).toBe("https://schema.org/Sunday");
    expect(back.eventSchedule!.scheduleTimezone).toBe("Europe/Madrid");
    expect(back.eventSchedule!.exceptDate).toBe("2025-12-25");
  });
});

describe("instanceToJsonLd", () => {
  it("produces a one-off event from a resolved EventInstance", () => {
    const instance = {
      startDate: new Date("2026-03-15T11:00:00Z"),
      endDate: new Date("2026-03-15T12:00:00Z"),
      name: "Sunday Mass",
      serviceType: WikidataId.Mass,
      status: "scheduled" as const,
      languages: ["es"],
      performers: [],
      location: {
        name: "Cathedral",
        osmId: "node/123",
        osmUrl: "https://www.openstreetmap.org/node/123",
      },
    };
    const raw = instanceToJsonLd(instance);
    expect(raw["@type"]).toBe("Event");
    expect(raw.startDate).toBe(instance.startDate.toISOString());
    expect(raw.endDate).toBe(instance.endDate.toISOString());
    expect(raw.additionalType).toBe(WikidataId.Mass);
    expect(raw.inLanguage).toBe("es");
    expect(raw.location?.sameAs).toBe("https://www.openstreetmap.org/node/123");
    expect(raw.eventStatus).toBeUndefined(); // scheduled is implicit
  });

  it("includes eventStatus for non-scheduled instances", () => {
    const instance = {
      startDate: new Date("2026-03-15T11:00:00Z"),
      name: "Mass — Cancelled",
      status: "cancelled" as const,
      languages: [],
      performers: [],
    };
    const raw = instanceToJsonLd(instance);
    expect(raw.eventStatus).toBe(EventStatus.Cancelled);
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

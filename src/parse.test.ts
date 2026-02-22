import { describe, it, expect } from "vitest";
import { parseEvent, parseEvents } from "./parse.js";
import { getUpcomingEvents, getUpcomingMasses } from "./schedule.js";
import { WikidataId, EventStatus } from "./types.js";

describe("parseEvent", () => {
  it("parses a simple one-off Event", () => {
    const raw = {
      "@context": "https://schema.org",
      "@type": "Event" as const,
      name: "Ash Wednesday Mass",
      additionalType: WikidataId.Mass,
      startDate: "2025-03-05T10:00:00+01:00",
      endDate: "2025-03-05T11:00:00+01:00",
      inLanguage: "es",
      location: {
        "@type": "Place" as const,
        name: "Cathedral of Our Lady",
        sameAs: "https://www.openstreetmap.org/node/123456789",
      },
    };

    const event = parseEvent(raw);
    expect(event.name).toBe("Ash Wednesday Mass");
    expect(event.serviceType).toBe(WikidataId.Mass);
    expect(event.languages).toEqual(["es"]);
    expect(event.status).toBe("scheduled");
    expect(event.location?.osmId).toBe("node/123456789");
    expect(event.location?.name).toBe("Cathedral of Our Lady");
    expect(event.startDate).toBeDefined();
    expect(event.schedule).toBeUndefined();
  });

  it("parses a recurring weekly Sunday Mass", () => {
    const raw = {
      "@type": "Event" as const,
      name: "Sunday Mass",
      additionalType: WikidataId.Mass,
      eventSchedule: {
        "@type": "Schedule" as const,
        byDay: "https://schema.org/Sunday",
        startTime: "11:00",
        endTime: "12:00",
        repeatFrequency: "P1W",
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        scheduleTimezone: "Europe/Madrid",
      },
    };

    const event = parseEvent(raw);
    expect(event.schedule).toBeDefined();
    expect(event.schedule?.byDay).toEqual([0]); // Sunday = 0
    expect(event.schedule?.startTime).toBe("11:00");
    expect(event.schedule?.repeatFrequency).toBe("P1W");
  });

  it("parses multiple byDay values", () => {
    const raw = {
      "@type": "Event" as const,
      name: "Weekday Mass",
      eventSchedule: {
        "@type": "Schedule" as const,
        byDay: [
          "https://schema.org/Monday",
          "https://schema.org/Wednesday",
          "https://schema.org/Friday",
        ],
        startTime: "09:00",
        repeatFrequency: "P1W",
      },
    };

    const event = parseEvent(raw);
    expect(event.schedule?.byDay).toEqual([1, 3, 5]);
  });

  it("parses EventCancelled status", () => {
    const raw = {
      "@type": "Event" as const,
      name: "Sunday Mass — Cancelled",
      startDate: "2025-03-15T11:00:00+01:00",
      eventStatus: EventStatus.Cancelled,
    };

    const event = parseEvent(raw);
    expect(event.status).toBe("cancelled");
  });

  it("parses EventRescheduled with previousStartDate", () => {
    const raw = {
      "@type": "Event" as const,
      name: "Sunday Mass — Moved",
      startDate: "2025-03-15T12:00:00+01:00",
      previousStartDate: "2025-03-15T11:00:00+01:00",
      eventStatus: EventStatus.Rescheduled,
    };

    const event = parseEvent(raw);
    expect(event.status).toBe("rescheduled");
    expect(event.previousStartDate).toBeDefined();
  });

  it("parses bilingual inLanguage", () => {
    const raw = {
      "@type": "Event" as const,
      name: "Bilingual Mass",
      inLanguage: ["es", "en"],
    };

    const event = parseEvent(raw);
    expect(event.languages).toEqual(["es", "en"]);
  });

  it("defaults to empty languages when inLanguage is absent", () => {
    const raw = { "@type": "Event" as const, name: "Mass" };
    const event = parseEvent(raw);
    expect(event.languages).toEqual([]);
  });
});

describe("parseEvents", () => {
  it("filters out non-Event objects", () => {
    const items = [
      { "@type": "Event", name: "Mass" },
      { "@type": "Organization", name: "Parish" },
      { "@type": "Event", name: "Adoration" },
    ];
    const events = parseEvents(items);
    expect(events).toHaveLength(2);
  });
});

describe("getUpcomingMasses", () => {
  it("expands a weekly Sunday Mass over two weeks", () => {
    // Use a fixed Monday as `from` so we have predictable Sundays ahead
    const from = new Date("2025-03-10T00:00:00Z"); // Monday March 10
    const to = new Date("2025-03-24T23:59:59Z"); // Sunday March 23

    const raw = {
      "@type": "Event" as const,
      name: "Sunday Mass",
      eventSchedule: {
        "@type": "Schedule" as const,
        byDay: "https://schema.org/Sunday",
        startTime: "11:00",
        repeatFrequency: "P1W",
        startDate: "2025-01-01",
        endDate: "2025-12-31",
      },
    };

    const events = [parseEvent(raw)];
    const masses = getUpcomingMasses(events, { from, to });

    // Should have Sunday March 16 and Sunday March 23
    expect(masses).toHaveLength(2);
    expect(masses[0].name).toBe("Sunday Mass");
    expect(masses[0].startDate.getUTCDay()).toBe(0); // Sunday
  });

  it("respects exceptDate", () => {
    const from = new Date("2025-03-10T00:00:00Z");
    const to = new Date("2025-03-17T23:59:59Z");

    const raw = {
      "@type": "Event" as const,
      name: "Sunday Mass",
      eventSchedule: {
        "@type": "Schedule" as const,
        byDay: "https://schema.org/Sunday",
        startTime: "11:00",
        repeatFrequency: "P1W",
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        exceptDate: "2025-03-16", // The only Sunday in window
      },
    };

    const events = [parseEvent(raw)];
    const masses = getUpcomingMasses(events, { from, to });
    expect(masses).toHaveLength(0);
  });

  it("excludes stale schedules (endDate in the past)", () => {
    const from = new Date("2025-03-10T00:00:00Z");

    const raw = {
      "@type": "Event" as const,
      name: "Old Sunday Mass",
      eventSchedule: {
        "@type": "Schedule" as const,
        byDay: "https://schema.org/Sunday",
        startTime: "11:00",
        repeatFrequency: "P1W",
        startDate: "2023-01-01",
        endDate: "2023-12-31", // expired
      },
    };

    const events = [parseEvent(raw)];
    const masses = getUpcomingMasses(events, { from });
    expect(masses).toHaveLength(0);
  });
});

describe("getUpcomingEvents — filtering", () => {
  const from = new Date("2025-03-16T00:00:00Z"); // Sunday
  const to = new Date("2025-03-16T23:59:59Z");

  const makeEvent = (name: string, additionalType?: string, inLanguage?: string) =>
    parseEvent({
      "@type": "Event" as const,
      name,
      additionalType,
      inLanguage,
      startDate: "2025-03-16T11:00:00Z",
    });

  const massEvent = makeEvent("Sunday Mass", WikidataId.Mass);
  const adorationEvent = makeEvent("Adoration", WikidataId.EucharisticAdoration);
  const untypedEvent = makeEvent("Parish Event"); // no additionalType
  const latinMassEvent = makeEvent("TLM", WikidataId.TraditionalLatinMass, "la");
  const spanishMassEvent = makeEvent("Spanish Mass", WikidataId.Mass, "es");

  const all = [massEvent, adorationEvent, untypedEvent, latinMassEvent, spanishMassEvent];

  it("returns all events when no filter is set", () => {
    const results = getUpcomingEvents(all, { from, to });
    expect(results).toHaveLength(5);
  });

  it("filters by single serviceType", () => {
    const results = getUpcomingEvents(all, { from, to, serviceType: WikidataId.Mass });
    expect(results.map((r) => r.name)).toEqual(["Sunday Mass", "Spanish Mass"]);
  });

  it("filters by multiple serviceTypes", () => {
    const results = getUpcomingEvents(all, {
      from, to,
      serviceType: [WikidataId.Mass, WikidataId.EucharisticAdoration],
    });
    expect(results).toHaveLength(3);
  });

  it("excludes untyped events by default when serviceType filter is active", () => {
    const results = getUpcomingEvents(all, { from, to, serviceType: WikidataId.Mass });
    expect(results.map((r) => r.name)).not.toContain("Parish Event");
  });

  it("includes untyped events when includeUntyped: true", () => {
    const results = getUpcomingEvents(all, {
      from, to,
      serviceType: WikidataId.Mass,
      includeUntyped: true,
    });
    expect(results.map((r) => r.name)).toContain("Parish Event");
  });

  it("filters by language", () => {
    const results = getUpcomingEvents(all, { from, to, language: "la" });
    expect(results.map((r) => r.name)).toEqual(["TLM"]);
  });

  it("filters by language array (OR logic)", () => {
    const results = getUpcomingEvents(all, { from, to, language: ["la", "es"] });
    expect(results).toHaveLength(2);
  });

  it("getUpcomingMasses includes untyped events", () => {
    const results = getUpcomingMasses(all, { from, to });
    expect(results.map((r) => r.name)).toContain("Parish Event");
    expect(results.map((r) => r.name)).not.toContain("Adoration");
    expect(results.map((r) => r.name)).not.toContain("TLM");
  });

  it("excludes events with no language by default when language filter active", () => {
    const results = getUpcomingEvents(all, { from, to, language: "es" });
    expect(results.map((r) => r.name)).toEqual(["Spanish Mass"]);
  });

  it("includes events with no language when includeLanguageUnknown: true", () => {
    const results = getUpcomingEvents(all, {
      from, to,
      language: "es",
      includeLanguageUnknown: true,
    });
    // Should include Spanish Mass + all events without a language (Mass, Adoration, Parish Event)
    const names = results.map((r) => r.name);
    expect(names).toContain("Spanish Mass");
    expect(names).toContain("Sunday Mass");
    expect(names).toContain("Parish Event");
    expect(names).not.toContain("TLM"); // has language "la", doesn't match "es"
  });
});

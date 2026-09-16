import { describe, expect, it } from "vitest";
import { localDay, secondsBetween, toIso } from "./dates.ts";

describe("toIso", () => {
  it.each([
    ["2026-09-13 07:02:11 +0200", "2026-09-13T05:02:11.000Z"],
    ["2026-09-13 07:02:11 +02:00", "2026-09-13T05:02:11.000Z"],
    ["2026-01-05 23:30:00 -0500", "2026-01-06T04:30:00.000Z"],
    ["2026-09-13 07:02:11 Z", "2026-09-13T07:02:11.000Z"],
    ["2026-09-13 07:02:11", "2026-09-13T07:02:11.000Z"],
    ["  2026-09-13 07:02:11 +0200  ", "2026-09-13T05:02:11.000Z"],
  ])("format Apple %s => %s", (input, expected) => {
    expect(toIso(input)).toBe(expected);
  });

  it("accepte l'ISO 8601 tel quel et le normalise en UTC", () => {
    expect(toIso("2026-09-15T17:05:12Z")).toBe("2026-09-15T17:05:12.000Z");
    expect(toIso("2026-09-15T19:05:12+02:00")).toBe("2026-09-15T17:05:12.000Z");
    expect(toIso("2026-09-15T17:05:12.250Z")).toBe("2026-09-15T17:05:12.250Z");
  });

  it("rejette une date illisible avec un message explicite", () => {
    expect(() => toIso("hier soir")).toThrow(/Date illisible/);
  });
});

describe("localDay", () => {
  it("garde le jour tel qu'écrit par la source, sans conversion de fuseau", () => {
    expect(localDay("2026-09-13 00:30:00 +0200")).toBe("2026-09-13");
    expect(localDay(" 2026-09-13T23:59:00+02:00")).toBe("2026-09-13");
  });
});

describe("secondsBetween", () => {
  it("mesure la durée et ne devient jamais négative", () => {
    expect(secondsBetween("2026-09-13T05:00:00Z", "2026-09-13T05:52:29Z")).toBe(3149);
    expect(secondsBetween("2026-09-13T06:00:00Z", "2026-09-13T05:00:00Z")).toBe(0);
  });
});

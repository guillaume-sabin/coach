import { describe, expect, it } from "vitest";
import { bpm, formatDate, formatTime, km, meters, round } from "./format";

describe("km", () => {
  it.each([
    [15_000, "15.0 km"],
    [10_000, "10.0 km"],
    [9_999, "10.00 km"],
    [5_200, "5.20 km"],
    [123, "0.12 km"],
  ])("%s m => %s", (m, expected) => {
    expect(km(m)).toBe(expected);
  });

  it("affiche un tiret sans valeur", () => {
    expect(km(null)).toBe("–");
  });
});

describe("meters / bpm / round", () => {
  it("arrondit et unifie les unités", () => {
    expect(meters(123.4)).toBe("123 m");
    expect(meters(null)).toBe("–");
    expect(bpm(146.6)).toBe("147 bpm");
    expect(bpm(null)).toBe("–");
    expect(round(65.234)).toBe("65");
    expect(round(65.234, 1)).toBe("65.2");
    expect(round(null)).toBe("–");
  });
});

describe("dates en français", () => {
  it("formatDate produit un libellé court français", () => {
    // Midi UTC : le jour ne change pas quel que soit le fuseau de la machine de test.
    expect(formatDate("2026-09-14T12:00:00Z")).toMatch(/^lun\.? 14 sept\.? 2026$/);
  });

  it("formatTime produit HH:MM", () => {
    expect(formatTime("2026-09-14T12:05:00Z")).toMatch(/^\d{2}:\d{2}$/);
  });
});

import { describe, expect, it } from "vitest";
import { num, parseQtyUnit, toKcal, toMeters, toMinutes, toSeconds } from "./units.ts";

describe("toMeters", () => {
  it.each([
    [10.42, "km", 10_420],
    [1, "mi", 1_609.344],
    [100, "ft", 30.48],
    [12_300, "cm", 123],
    [100, "yd", 91.44],
    [500, "m", 500],
    [500, undefined, 500],
    [500, "KM", 500_000],
  ])("%s %s => %s m", (qty, unit, expected) => {
    expect(toMeters(qty, unit)).toBeCloseTo(expected, 6);
  });

  it("retourne null pour une quantité absente ou non finie", () => {
    expect(toMeters(null)).toBeNull();
    expect(toMeters(undefined, "km")).toBeNull();
    expect(toMeters(NaN, "km")).toBeNull();
    expect(toMeters(Infinity, "km")).toBeNull();
  });
});

describe("toKcal", () => {
  it("convertit les kJ et laisse les kcal", () => {
    expect(toKcal(4.184, "kJ")).toBeCloseTo(1, 9);
    expect(toKcal(640, "kcal")).toBe(640);
    expect(toKcal(640, "Cal")).toBe(640);
    expect(toKcal(640)).toBe(640);
    expect(toKcal(null)).toBeNull();
  });
});

describe("toSeconds / toMinutes", () => {
  it("convertit minutes et heures", () => {
    expect(toSeconds(52.48, "min")).toBeCloseTo(3148.8, 6);
    expect(toSeconds(1.5, "hr")).toBe(5400);
    expect(toSeconds(2, "h")).toBe(7200);
    expect(toSeconds(90, "s")).toBe(90);
    expect(toSeconds(90)).toBe(90);
  });

  it("toMinutes exprime par défaut la quantité en minutes, sinon convertit", () => {
    expect(toMinutes(45)).toBe(45);
    expect(toMinutes(7.2, "hr")).toBeCloseTo(432, 9);
    expect(toMinutes(600, "s")).toBe(10);
    expect(toMinutes(null)).toBeNull();
  });
});

describe("num", () => {
  it("accepte nombres et chaînes numériques, rejette le reste", () => {
    expect(num(12)).toBe(12);
    expect(num("12.5")).toBe(12.5);
    expect(num(" 7 ")).toBe(7);
    expect(num("abc")).toBeNull();
    expect(num(null)).toBeNull();
    expect(num(undefined)).toBeNull();
    expect(num("")).toBeNull();
  });
});

describe("parseQtyUnit", () => {
  it("lit les métadonnées Apple du type « 48213 cm »", () => {
    expect(parseQtyUnit("48213 cm")).toEqual({ qty: 48213, unit: "cm" });
    expect(parseQtyUnit("12.5km")).toEqual({ qty: 12.5, unit: "km" });
    expect(parseQtyUnit("-3 m")).toEqual({ qty: -3, unit: "m" });
    expect(parseQtyUnit("42")).toEqual({ qty: 42, unit: "" });
    expect(parseQtyUnit("85 %")).toEqual({ qty: 85, unit: "%" });
  });

  it("retourne null si la chaîne est absente ou invalide", () => {
    expect(parseQtyUnit(undefined)).toBeNull();
    expect(parseQtyUnit("")).toBeNull();
    expect(parseQtyUnit("beaucoup")).toBeNull();
  });
});

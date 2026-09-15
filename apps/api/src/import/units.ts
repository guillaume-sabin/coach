export function toMeters(qty: number | null | undefined, unit?: string | null): number | null {
  if (qty == null || !isFinite(qty)) return null;
  switch ((unit ?? "m").toLowerCase()) {
    case "km":
      return qty * 1000;
    case "mi":
      return qty * 1609.344;
    case "ft":
      return qty * 0.3048;
    case "cm":
      return qty / 100;
    case "yd":
      return qty * 0.9144;
    default:
      return qty;
  }
}

export function toKcal(qty: number | null | undefined, unit?: string | null): number | null {
  if (qty == null || !isFinite(qty)) return null;
  switch ((unit ?? "kcal").toLowerCase()) {
    case "kj":
      return qty / 4.184;
    case "cal":
    case "kcal":
    default:
      return qty;
  }
}

export function toSeconds(qty: number | null | undefined, unit?: string | null): number | null {
  if (qty == null || !isFinite(qty)) return null;
  switch ((unit ?? "s").toLowerCase()) {
    case "min":
      return qty * 60;
    case "hr":
    case "h":
      return qty * 3600;
    default:
      return qty;
  }
}

export function toMinutes(qty: number | null | undefined, unit?: string | null): number | null {
  const s = toSeconds(qty, unit ?? "min");
  return s == null ? null : s / 60;
}

export function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isFinite(n) ? n : null;
}

/** "48213 cm" -> { qty: 48213, unit: "cm" } */
export function parseQtyUnit(s: string | undefined): { qty: number; unit: string } | null {
  if (!s) return null;
  const m = s.trim().match(/^(-?[\d.]+)\s*([a-zA-Z/%]+)?$/);
  if (!m) return null;
  return { qty: parseFloat(m[1]), unit: m[2] ?? "" };
}

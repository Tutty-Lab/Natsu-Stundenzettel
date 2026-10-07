// ============================================================================
// „Kiểu xếp ca" für Vollzeit: fertige Arbeitswochen, aus denen der Chef im
// Formular per Dropdown wählt. Kiểu 1 und 2 sind die Vorgabe des Natsu-Chefs
// (40 h); 3–6 sind Vorschläge für kürzere Wochenverträge (39 h, 38,5 h).
// Alle Schichten 0,5-h-Raster, höchstens 8 h (siehe isValidPattern).
// ============================================================================

import type { Employee, WeekPattern } from "../types";
import { distributeLengths } from "./weekPattern";

export type VollzeitKieu = {
  id: number;
  label: string;
  pattern: WeekPattern;
};

export const VOLLZEIT_KIEU: VollzeitKieu[] = [
  { id: 1, label: "Kiểu 1", pattern: { days: 5, minHours: 8, maxHours: 8, weeklyHours: 40 } },
  { id: 2, label: "Kiểu 2", pattern: { days: 6, minHours: 6.5, maxHours: 7, weeklyHours: 40 } },
  { id: 3, label: "Kiểu 3", pattern: { days: 5, minHours: 7.5, maxHours: 8, weeklyHours: 39 } },
  { id: 4, label: "Kiểu 4", pattern: { days: 6, minHours: 6.5, maxHours: 6.5, weeklyHours: 39 } },
  { id: 5, label: "Kiểu 5", pattern: { days: 5, minHours: 7.5, maxHours: 8, weeklyHours: 38.5 } },
  { id: 6, label: "Kiểu 6", pattern: { days: 6, minHours: 6, maxHours: 6.5, weeklyHours: 38.5 } },
];

const fmtH = (h: number) => String(h).replace(".", ",");

/** „6 ngày: 4 ca 6,5h + 2 ca 7h = 40h" – aus der echten Verteilung berechnet. */
export function kieuText(p: WeekPattern): string {
  const weekly = p.weeklyHours ?? 0;
  const lengths = distributeLengths(p.days, Math.round(weekly * 60), Math.round(p.minHours * 60), Math.round(p.maxHours * 60));
  if (!lengths) return `${p.days} ngày, ca ${fmtH(p.minHours)}–${fmtH(p.maxHours)}h`;
  const groups = new Map<number, number>();
  for (const l of lengths) groups.set(l / 60, (groups.get(l / 60) ?? 0) + 1);
  const parts = [...groups].sort((a, b) => b[0] - a[0]).map(([h, n]) => `${n} ca ${fmtH(h)}h`);
  return `${p.days} ngày: ${parts.join(" + ")} = ${fmtH(weekly)}h`;
}

/** Welcher Kiểu passt genau zu diesem Muster (Ruhetage egal)? */
export function kieuOf(p: WeekPattern | undefined): VollzeitKieu | undefined {
  if (!p) return undefined;
  return VOLLZEIT_KIEU.find(
    (k) =>
      k.pattern.days === p.days &&
      k.pattern.minHours === p.minHours &&
      k.pattern.maxHours === p.maxHours &&
      k.pattern.weeklyHours === p.weeklyHours,
  );
}

/** Vorschlag für Altdaten: „tối đa 5 ngày/tuần" => Kiểu 1, sonst Kiểu 2. */
export function suggestedKieu(e: Employee): VollzeitKieu {
  return VOLLZEIT_KIEU[e.maxDaysPerWeek !== undefined && e.maxDaysPerWeek <= 5 ? 0 : 1];
}

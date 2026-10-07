// ============================================================================
// Độ phủ (Besetzung): wie viele Leute stehen in jedem 30-Minuten-Takt im Laden.
//
// Zwei Ebenen:
//  - MINDESTENS (harte Regel, je Filiale in Cài đặt einstellbar): immer `base`
//    Leute, in den Stoßzeiten (z. B. trưa 12–14, tối 18–21) mehr.
//  - NÊN CÓ (dynamisch): Die Anwesenheit aller Dienste eines Tages wird so
//    verteilt, dass die Kurve der Mindestbesetzung gleichmäßig angehoben wird.
//    Ein Tag mit vielen Stunden bekommt also automatisch mehr Leute in den
//    Stoßzeiten – nichts davon ist fest eingetragen.
//
// Die Dienste werden nur innerhalb ihres Tages verschoben (gleiche Länge,
// gleicher Tag) – Monats-Soll, Ruhetage, 6-Tage-Regel bleiben unberührt.
// ============================================================================

import type { Employee, Shift, ShiftType } from "../types";

export const SLOT_MINUTES = 30;

export type StaffingPeak = {
  label: string;
  startMinutes: number;
  endMinutes: number;
  /** Mindestens so viele Leute in diesem Zeitraum. */
  min: number;
};

export type StaffingConfig = {
  /** Mindestens so viele Leute zu JEDER Öffnungszeit. */
  base: number;
  peaks: StaffingPeak[];
};

/** Vorgabe der Chefs (Okt 2026). Nur Startwerte – in Cài đặt änderbar. */
export function defaultStaffing(storeId: string): StaffingConfig {
  const dinnerMin = storeId === "nava" ? 3 : 4;
  return {
    base: 2,
    peaks: [
      { label: "Trưa", startMinutes: 12 * 60, endMinutes: 14 * 60, min: 3 },
      { label: "Tối", startMinutes: 18 * 60, endMinutes: 21 * 60, min: dinnerMin },
    ],
  };
}

/** Gespeicherte Konfiguration prüfen; Unbrauchbares durch die Vorgabe ersetzen. */
export function normalizeStaffing(raw: Partial<StaffingConfig> | undefined, storeId: string): StaffingConfig {
  const fallback = defaultStaffing(storeId);
  if (!raw || typeof raw !== "object") return fallback;
  const base = Number.isFinite(raw.base) ? Math.max(0, Math.round(raw.base!)) : fallback.base;
  const peaks = Array.isArray(raw.peaks)
    ? raw.peaks
        .filter(
          (p) =>
            p &&
            Number.isFinite(p.startMinutes) &&
            Number.isFinite(p.endMinutes) &&
            p.endMinutes > p.startMinutes &&
            Number.isFinite(p.min),
        )
        .map((p) => ({
          label: String(p.label ?? ""),
          startMinutes: p.startMinutes,
          endMinutes: p.endMinutes,
          min: Math.max(0, Math.round(p.min)),
        }))
    : fallback.peaks;
  return { base, peaks };
}

/** Mindestbesetzung für den Takt ab t. */
export function floorAt(cfg: StaffingConfig, t: number): number {
  let need = cfg.base;
  for (const p of cfg.peaks) {
    if (t >= p.startMinutes && t + SLOT_MINUTES <= p.endMinutes) need = Math.max(need, p.min);
  }
  return need;
}

export function isPeakSlot(cfg: StaffingConfig, t: number): boolean {
  return cfg.peaks.some((p) => t >= p.startMinutes && t + SLOT_MINUTES <= p.endMinutes);
}

type Window = { startMinutes: number; endMinutes: number };

export function slotsOf(window: Window): number[] {
  const slots: number[] = [];
  for (let t = window.startMinutes; t + SLOT_MINUTES <= window.endMinutes; t += SLOT_MINUTES) slots.push(t);
  return slots;
}

/** Wer ist den ganzen Takt ab t anwesend? */
export function presentAt(shifts: Shift[], t: number): number {
  let n = 0;
  for (const s of shifts) if (s.startMinutes <= t && s.endMinutes >= t + SLOT_MINUTES) n += 1;
  return n;
}

export type DaySlot = { t: number; have: number; floor: number; target: number };

/**
 * Besetzung eines Tages: je Takt vorhanden, Mindestbesetzung und das dynamische
 * „nên có" (Mindestkurve × Faktor, sodass alle Anwesenheitsstunden des Tages
 * aufgebraucht werden; nie unter der Mindestbesetzung).
 */
export function dayCoverage(shifts: Shift[], window: Window, cfg: StaffingConfig): { slots: DaySlot[]; scale: number } {
  const ts = slotsOf(window);
  const floors = ts.map((t) => floorAt(cfg, t));
  const floorSum = floors.reduce((a, b) => a + b, 0);
  const capacity = shifts.reduce((sum, s) => sum + (s.endMinutes - s.startMinutes) / SLOT_MINUTES, 0);
  const scale = floorSum > 0 ? Math.max(1, capacity / floorSum) : 1;
  return {
    scale,
    slots: ts.map((t, i) => ({ t, have: presentAt(shifts, t), floor: floors[i], target: floors[i] * scale })),
  };
}

/** Typ für Anzeige/Farbe: am Öffnen verankert = Früh, am Schließen = Spät, sonst dazwischen. */
export function shiftTypeIn(window: Window, start: number, end: number): ShiftType {
  if (start <= window.startMinutes) return "EARLY";
  if (end >= window.endMinutes) return "LATE";
  return "MID";
}

const FLOOR_WEIGHT = 1000;
/** Weiche Regel: Minijob/Teilzeit bevorzugt in den Stoßzeiten. */
const PEAK_BONUS_PER_SLOT = 0.25;

/**
 * Verschiebt die Dienste EINES Tages innerhalb der Öffnungszeit (Länge bleibt),
 * bis die Mindestbesetzung überall erreicht ist und die Besetzung möglichst
 * der „nên có"-Kurve folgt. Lokale Suche: jeweils die beste Einzelverschiebung,
 * bis nichts mehr besser wird. Gibt neue Shift-Objekte zurück (gleiche Reihenfolge).
 */
export function retimeDay(
  dayShifts: Shift[],
  window: Window,
  cfg: StaffingConfig,
  prefersPeak: (shift: Shift) => boolean = () => false,
): Shift[] {
  if (dayShifts.length === 0) return dayShifts;
  const ts = slotsOf(window);
  if (ts.length === 0) return dayShifts;
  const { slots } = dayCoverage(dayShifts, window, cfg);
  const floor = slots.map((s) => s.floor);
  const target = slots.map((s) => s.target);
  const peak = ts.map((t) => isPeakSlot(cfg, t));
  const open = window.startMinutes;

  // Anwesenheit als Takt-Index-Bereiche [from, to).
  const len = dayShifts.map((s) => Math.round((s.endMinutes - s.startMinutes) / SLOT_MINUTES));
  const pos = dayShifts.map((s) => Math.round((s.startMinutes - open) / SLOT_MINUTES));
  const wantsPeak = dayShifts.map(prefersPeak);
  const cov = new Array<number>(ts.length).fill(0);
  const add = (i: number, start: number, delta: number) => {
    for (let k = Math.max(0, start); k < Math.min(ts.length, start + len[i]); k++) cov[k] += delta;
  };
  dayShifts.forEach((_, i) => add(i, pos[i], 1));

  // Unter Mindestbesetzung: sehr teuer. Sonst quadratische Abweichung von der
  // „nên có"-Kurve – so wandern Leute aus überbesetzten Takten (z. B.
  // Nachmittag) in die Stoßzeiten, statt nur Lücken zu stopfen.
  const slotCost = (k: number, c: number) =>
    FLOOR_WEIGHT * Math.max(0, floor[k] - c) + (c - target[k]) ** 2;
  const peakBonus = (i: number, start: number) => {
    if (!wantsPeak[i]) return 0;
    let n = 0;
    for (let k = Math.max(0, start); k < Math.min(ts.length, start + len[i]); k++) if (peak[k]) n += 1;
    return n * PEAK_BONUS_PER_SLOT;
  };

  for (let iter = 0; iter < 200; iter++) {
    let best = { gain: 1e-9, i: -1, start: 0 };
    for (let i = 0; i < dayShifts.length; i++) {
      const maxStart = ts.length - len[i];
      if (maxStart < 0) continue;
      // Kosten ohne diese Schicht, dann jede Startposition probieren.
      add(i, pos[i], -1);
      const base = cov.map((c, k) => slotCost(k, c));
      const baseSum = base.reduce((a, b) => a + b, 0);
      const costAt = (start: number) => {
        let sum = baseSum;
        for (let k = start; k < start + len[i]; k++) sum += slotCost(k, cov[k] + 1) - base[k];
        return sum - peakBonus(i, start);
      };
      const current = costAt(pos[i]);
      for (let start = 0; start <= maxStart; start++) {
        if (start === pos[i]) continue;
        const gain = current - costAt(start);
        if (gain > best.gain) best = { gain, i, start };
      }
      add(i, pos[i], 1);
    }
    if (best.i < 0) break;
    add(best.i, pos[best.i], -1);
    pos[best.i] = best.start;
    add(best.i, pos[best.i], 1);
  }

  return dayShifts.map((s, i) => {
    const startMinutes = open + pos[i] * SLOT_MINUTES;
    const endMinutes = startMinutes + len[i] * SLOT_MINUTES;
    if (startMinutes === s.startMinutes) return s;
    return { ...s, startMinutes, endMinutes, shiftType: shiftTypeIn(window, startMinutes, endMinutes) };
  });
}

/** Fehlende Leute (unter der Mindestbesetzung) an einem Tag, als Takt-Summe. */
export function floorDeficit(shifts: Shift[], window: Window, cfg: StaffingConfig): number {
  let missing = 0;
  for (const t of slotsOf(window)) missing += Math.max(0, floorAt(cfg, t) - presentAt(shifts, t));
  return missing;
}

export type CoverageGap = {
  date: string;
  startMinutes: number;
  endMinutes: number;
  /** Wenigste Anwesende im Zeitraum. */
  have: number;
  /** Höchste Mindestbesetzung im Zeitraum. */
  need: number;
};

/** Alle Zeiträume unter der Mindestbesetzung (zusammenhängende Takte zusammengefasst). */
export function coverageGaps(
  shifts: Shift[],
  dates: string[],
  dayOf: (isoDate: string) => { closed: boolean; window: Window },
  cfg: StaffingConfig,
): CoverageGap[] {
  const byDate = new Map<string, Shift[]>();
  for (const s of shifts) {
    const list = byDate.get(s.date);
    if (list) list.push(s);
    else byDate.set(s.date, [s]);
  }
  const gaps: CoverageGap[] = [];
  for (const date of dates) {
    const day = dayOf(date);
    if (day.closed) continue;
    const own = byDate.get(date) ?? [];
    let open: CoverageGap | null = null;
    for (const t of slotsOf(day.window)) {
      const need = floorAt(cfg, t);
      const have = presentAt(own, t);
      if (have < need) {
        if (open && open.endMinutes === t) {
          open.endMinutes = t + SLOT_MINUTES;
          open.have = Math.min(open.have, have);
          open.need = Math.max(open.need, need);
        } else {
          open = { date, startMinutes: t, endMinutes: t + SLOT_MINUTES, have, need };
          gaps.push(open);
        }
      } else {
        open = null;
      }
    }
  }
  return gaps;
}

/** Minijob/Teilzeit: weiche Regel „bevorzugt Wochenende und Stoßzeiten". */
export function isMinijob(employee: Employee | undefined): boolean {
  return employee?.employmentType === "TEILZEIT";
}

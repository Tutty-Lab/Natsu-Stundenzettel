// ============================================================================
// „Mẫu tuần" – feste Arbeitswoche je Person.
//
// Wunsch des Betriebs (Natsu, Vollzeit): Vertrag 40 h die Woche, verteilt auf
// SECHS Tage – vier Tage 6,5 h und zwei Tage 7 h. Der bisherige Planer kannte
// nur ganze Stunden (4–8 h) und keine feste Tageszahl je Woche.
//
// Ein Muster besteht aus
//   - days:        Arbeitstage in einer vollen Woche (1..6),
//   - minHours/maxHours: kürzeste/längste Schicht, Schritt 0,5 h,
//   - weeklyHours: (optional) Wochenvertrag. Gesetzt => das Monats-Soll folgt
//                  den Wochen des Monats statt der festen Monatszahl,
//   - restDays:    (optional) feste Ruhetage; fehlt => automatisch, reihum
//                  auf die schwächsten Wochentage verteilt.
//
// FESTE Ruhetage sind der Kern: die Person arbeitet jede Woche an denselben
// Wochentagen. Damit
//   - gibt es nie mehr als sechs Tage am Stück (jede Woche hat ihren Ruhetag),
//   - passt eine am Monatsrand geteilte Woche von selbst zusammen: beide
//     Monate planen genau die Arbeitstage, die in ihrem Teil liegen.
//
// Alles hier ist rein rechnerisch und wird von Planer UND Prüfung benutzt –
// damit beide dasselbe Soll sehen.
// ============================================================================

import type { Employee, WeekPattern } from "../types";
import { DAY_WEIGHTS, parseIsoDate, weekdayKeyOf, type WeekdayKey } from "./demand";

export const PATTERN_STEP_MINUTES = 30;

const WOCHE: WeekdayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/** Montag der Woche als Schlüssel (gleiches Format wie im Planer). */
export function patternWeekKey(isoDate: string): string {
  const date = parseIsoDate(isoDate);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/** Ist das Muster vollständig und in sich stimmig? */
export function isValidPattern(p: WeekPattern | undefined): p is WeekPattern {
  if (!p) return false;
  if (!Number.isInteger(p.days) || p.days < 1 || p.days > 6) return false;
  if (!(p.minHours > 0) || !(p.maxHours >= p.minHours) || p.maxHours > 8) return false;
  if ((p.minHours * 60) % PATTERN_STEP_MINUTES !== 0) return false;
  if ((p.maxHours * 60) % PATTERN_STEP_MINUTES !== 0) return false;
  if (p.weeklyHours !== undefined && !(p.weeklyHours > 0)) return false;
  if (p.restDays && p.restDays.length !== 7 - p.days) return false;
  return true;
}

export function hasPattern(employee: Employee): boolean {
  return employee.employmentType !== "AZUBI" && isValidPattern(employee.weekPattern);
}

/**
 * Ruhetage aller Personen mit Muster. Eigene Angabe gewinnt; sonst reihum aus
 * den schwächeren Wochentagen (Gewicht bis zum Median, schwächste zuerst),
 * damit nicht alle am selben Tag fehlen.
 */
export function restDaysByEmployee(employees: Employee[]): Map<string, WeekdayKey[]> {
  const gewichte = WOCHE.map((k) => DAY_WEIGHTS[k]).sort((a, b) => a - b);
  const median = gewichte[Math.floor(gewichte.length / 2)];
  const reihe = WOCHE.filter((k) => DAY_WEIGHTS[k] <= median).sort(
    (a, b) => DAY_WEIGHTS[a] - DAY_WEIGHTS[b] || WOCHE.indexOf(a) - WOCHE.indexOf(b),
  );
  const out = new Map<string, WeekdayKey[]>();
  let zeiger = 0;
  for (const e of employees) {
    if (!hasPattern(e)) continue;
    const p = e.weekPattern!;
    if (p.restDays && p.restDays.length === 7 - p.days) {
      out.set(e.id, [...p.restDays]);
      continue;
    }
    const tage: WeekdayKey[] = [];
    for (let k = 0; k < 7 - p.days; k++) {
      // Mehr Ruhetage als schwache Wochentage? Dann aus der ganzen Woche.
      const quelle = reihe.length > k ? reihe : WOCHE;
      let tag = quelle[(zeiger + k) % quelle.length];
      for (let s = 0; tage.includes(tag) && s < 7; s++) tag = WOCHE[(WOCHE.indexOf(tag) + 1) % 7];
      tage.push(tag);
    }
    zeiger += Math.max(1, 7 - p.days);
    out.set(e.id, tage);
  }
  return out;
}

const auf30 = (minutes: number) => Math.round(minutes / PATTERN_STEP_MINUTES) * PATTERN_STEP_MINUTES;

/**
 * Teilt `total` Minuten auf `n` Schichten zwischen min und max (Schritt 30′)
 * auf, so gleichmäßig wie möglich. Längere Schichten zuerst in der Liste.
 * Beispiel: 6 Schichten, 40 h, 6,5–7 h  =>  [7, 7, 6.5, 6.5, 6.5, 6.5].
 * null, wenn es nicht aufgeht.
 */
export function distributeLengths(n: number, total: number, min: number, max: number): number[] | null {
  if (n <= 0) return total === 0 ? [] : null;
  if (total % PATTERN_STEP_MINUTES !== 0) return null;
  if (total < n * min || total > n * max) return null;
  const out = Array.from({ length: n }, () => min);
  let rest = total - n * min;
  // Rundlauf: jede Schicht um 30′ verlängern, bis der Rest verteilt ist.
  for (let i = 0; rest > 0; i = (i + 1) % n) {
    if (out[i] + PATTERN_STEP_MINUTES <= max) {
      out[i] += PATTERN_STEP_MINUTES;
      rest -= PATTERN_STEP_MINUTES;
    }
  }
  return out.sort((a, b) => b - a);
}

export type PatternPortion = {
  weekKey: string;
  /** Arbeitstage dieser Woche im Monat (kein Ruhetag, offen, erlaubt). */
  workdays: string[];
  /** Geplante Minuten in diesem Monatsteil der Woche. */
  minutes: number;
  /** Längen der Schichten (Minuten), absteigend; gleich viele wie workdays. */
  lengths: number[];
};

/**
 * Plan je Woche für den Monat.
 *
 * Gearbeitet wird an allen Tagen der Woche, die im Monat liegen, kein
 * Ruhetag sind und an denen die Person arbeiten darf (höchstens `days`).
 * Soll: mit weeklyHours je Teil weeklyHours × Tage / days; ohne weeklyHours
 * wird das feste Monats-Soll anteilig nach Tagen verteilt.
 */
export function planPattern(
  employee: Employee,
  dates: string[],
  isEligible: (isoDate: string) => boolean,
  restDays: WeekdayKey[],
): PatternPortion[] {
  const p = employee.weekPattern!;
  const min = Math.round(p.minHours * 60);
  const max = Math.round(p.maxHours * 60);
  const ruhe = new Set(restDays);

  const wochen = new Map<string, string[]>();
  for (const d of dates) {
    const key = patternWeekKey(d);
    if (!wochen.has(key)) wochen.set(key, []);
    if (ruhe.has(weekdayKeyOf(parseIsoDate(d)))) continue;
    if (!isEligible(d)) continue;
    wochen.get(key)!.push(d);
  }

  const portions: PatternPortion[] = [...wochen].map(([weekKey, tage]) => ({
    weekKey,
    workdays: tage.slice(0, p.days),
    minutes: 0,
    lengths: [],
  }));

  if (p.weeklyHours !== undefined) {
    for (const portion of portions) {
      portion.minutes = auf30((p.weeklyHours * 60 * portion.workdays.length) / p.days);
    }
  } else {
    // Festes Monats-Soll anteilig nach Tagen; der Rundungsrest geht an den
    // Teil mit den meisten Tagen, damit die Summe exakt bleibt.
    const alleTage = portions.reduce((a, x) => a + x.workdays.length, 0);
    let vergeben = 0;
    for (const portion of portions) {
      portion.minutes = alleTage > 0 ? auf30((employee.targetMinutes * portion.workdays.length) / alleTage) : 0;
      vergeben += portion.minutes;
    }
    const rest = employee.targetMinutes - vergeben;
    if (rest !== 0 && portions.length > 0) {
      const groesster = [...portions].sort((a, b) => b.workdays.length - a.workdays.length)[0];
      groesster.minutes += rest;
    }
  }

  // Längen je Teil. Passt die Summe nicht in Tage × [min, max], wird an die
  // Grenze gelegt – die Prüfung meldet dann die Abweichung.
  for (const portion of portions) {
    const n = portion.workdays.length;
    const clamp = auf30(Math.min(Math.max(portion.minutes, n * min), n * max));
    portion.lengths = distributeLengths(n, clamp, min, max) ?? Array.from({ length: n }, () => max);
  }
  return portions;
}

/** Monats-Soll in Minuten, das Planer und Prüfung für diese Person ansetzen. */
export function effectiveTargetMinutes(
  employee: Employee,
  dates: string[],
  isEligible: (isoDate: string) => boolean,
  restDays: WeekdayKey[],
): number {
  if (!hasPattern(employee) || employee.weekPattern!.weeklyHours === undefined) {
    return employee.targetMinutes;
  }
  return planPattern(employee, dates, isEligible, restDays).reduce((a, x) => a + x.minutes, 0);
}

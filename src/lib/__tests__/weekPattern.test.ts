// ============================================================================
// „Mẫu tuần": feste Arbeitswoche je Person.
//
// Wunsch des Betriebs (Natsu, Vollzeit): 40 h die Woche auf sechs Tage –
// vier Tage 6,5 h und zwei Tage 7 h.
// ============================================================================

import { describe, expect, it } from "vitest";
import { effectiveTargets, generateSchedule } from "../scheduler";
import { validateSchedule } from "../validation";
import { maxConsecutiveRun } from "../consecutive";
import { DEFAULT_WORK_HOURS } from "../workHours";
import { parseIsoDate, weekdayKeyOf } from "../demand";
import {
  distributeLengths,
  isValidPattern,
  patternWeekKey,
  restDaysByEmployee,
} from "../weekPattern";
import type { Employee, WeekPattern } from "../../types";

const MUSTER: WeekPattern = { days: 6, minHours: 6.5, maxHours: 7, weeklyHours: 40 };

const vz = (id: string, pattern: WeekPattern | undefined = MUSTER): Employee => ({
  id,
  name: id,
  employmentType: "VOLLZEIT",
  targetMinutes: 176 * 60,
  weekPattern: pattern,
});

const tz = (id: string, hours: number): Employee => ({
  id,
  name: id,
  employmentType: "TEILZEIT",
  targetMinutes: hours * 60,
});

/** Eine Belegschaft wie bei Natsu: vier Vollzeit mit Muster, einige Teilzeit. */
const TEAM: Employee[] = [
  vz("VZ1"), vz("VZ2"), vz("VZ3"), vz("VZ4"),
  tz("TZ1", 40), tz("TZ2", 40), tz("TZ3", 60), tz("TZ4", 80),
];

function plan(year: number, month: number, employees = TEAM) {
  const input = { year, month, workHours: DEFAULT_WORK_HOURS, employees };
  const shifts = generateSchedule(input);
  const soll = effectiveTargets(input);
  return { shifts, soll };
}

describe("distributeLengths", () => {
  it("40 h auf sechs Tage mit 6,5–7 h ergibt genau 4 × 6,5 h + 2 × 7 h", () => {
    expect(distributeLengths(6, 40 * 60, 390, 420)).toEqual([420, 420, 390, 390, 390, 390]);
  });

  it("verteilt so gleichmäßig wie möglich und hält die Grenzen", () => {
    const l = distributeLengths(5, 33.5 * 60, 390, 420)!;
    expect(l.reduce((a, b) => a + b, 0)).toBe(33.5 * 60);
    expect(Math.max(...l) - Math.min(...l)).toBeLessThanOrEqual(30);
  });

  it("sagt nein, wenn es nicht aufgeht", () => {
    expect(distributeLengths(6, 50 * 60, 390, 420)).toBeNull(); // 6 × 7 h = 42 h
    expect(distributeLengths(6, 30 * 60, 390, 420)).toBeNull(); // 6 × 6,5 h = 39 h
    expect(distributeLengths(2, 13 * 60 + 15, 390, 420)).toBeNull(); // kein 30′-Raster
  });
});

describe("isValidPattern", () => {
  it("prüft Tage, Längen, Raster und Ruhetage", () => {
    expect(isValidPattern(MUSTER)).toBe(true);
    expect(isValidPattern({ ...MUSTER, days: 7 })).toBe(false); // ohne Ruhetag
    expect(isValidPattern({ ...MUSTER, minHours: 6.25 })).toBe(false); // kein 30′-Schritt
    expect(isValidPattern({ ...MUSTER, maxHours: 6 })).toBe(false); // max < min
    expect(isValidPattern({ ...MUSTER, maxHours: 9 })).toBe(false); // über 8 h
    expect(isValidPattern({ ...MUSTER, restDays: ["monday", "tuesday"] })).toBe(false); // 6 Tage => 1 Ruhetag
    expect(isValidPattern({ ...MUSTER, restDays: ["monday"] })).toBe(true);
  });
});

describe("Ruhetage", () => {
  it("verteilt automatische Ruhetage reihum auf die schwächeren Wochentage", () => {
    const ruhe = restDaysByEmployee(TEAM);
    const tage = ["VZ1", "VZ2", "VZ3", "VZ4"].map((id) => ruhe.get(id)![0]);
    expect(new Set(tage).size).toBe(4); // vier verschiedene Tage
    for (const t of tage) expect(["friday", "saturday", "sunday"]).not.toContain(t);
  });

  it("nimmt einen selbst gewählten Ruhetag", () => {
    const ruhe = restDaysByEmployee([vz("A", { ...MUSTER, restDays: ["saturday"] })]);
    expect(ruhe.get("A")).toEqual(["saturday"]);
  });
});

describe("Planer mit Mẫu tuần (Natsu: 40 h, 6 Tage, 6,5–7 h)", () => {
  for (const [year, month] of [[2026, 10], [2026, 11], [2026, 12], [2027, 2]] as const) {
    describe(`${month}/${year}`, () => {
      const { shifts, soll } = plan(year, month);
      const ruhe = restDaysByEmployee(TEAM);

      it("jede volle Woche: genau sechs Tage, 4 × 6,5 h + 2 × 7 h = 40 h", () => {
        for (const id of ["VZ1", "VZ2", "VZ3", "VZ4"]) {
          const proWoche = new Map<string, number[]>();
          for (const s of shifts.filter((x) => x.employeeId === id)) {
            const k = patternWeekKey(s.date);
            proWoche.set(k, [...(proWoche.get(k) ?? []), s.paidMinutes]);
          }
          for (const [woche, laengen] of proWoche) {
            for (const l of laengen) expect([390, 420], `${id} ${woche}`).toContain(l);
            if (laengen.length === 6) {
              expect(laengen.reduce((a, b) => a + b, 0), `${id} ${woche}`).toBe(40 * 60);
              expect(laengen.filter((l) => l === 420).length, `${id} ${woche}`).toBe(2);
            }
          }
        }
      });

      it("arbeitet nie an ihrem Ruhetag und nie mehr als sechs Tage am Stück", () => {
        for (const id of ["VZ1", "VZ2", "VZ3", "VZ4"]) {
          const tage = shifts.filter((x) => x.employeeId === id).map((x) => x.date);
          for (const d of tage) expect(ruhe.get(id), `${id} ${d}`).not.toContain(weekdayKeyOf(parseIsoDate(d)));
          expect(maxConsecutiveRun(tage), id).toBeLessThanOrEqual(6);
        }
      });

      it("alle erreichen ihr Soll; Muster-Personen das Wochen-Soll des Monats", () => {
        const employees = TEAM.map((e) => ({ ...e, targetMinutes: soll.get(e.id)! }));
        const v = validateSchedule(employees, shifts);
        expect(v.errors).toEqual([]);
        // Wochenvertrag: das Monats-Soll liegt bei rund 40 × 52/12 h, nie bei
        // den eingetragenen 176 h.
        for (const id of ["VZ1", "VZ2", "VZ3", "VZ4"]) {
          expect(soll.get(id)! / 60).toBeGreaterThan(150);
          expect(soll.get(id)! / 60).toBeLessThan(190);
        }
      });
    });
  }

  it("eine am Monatsrand geteilte Woche ergibt über beide Monate genau 6 Tage / 40 h", () => {
    const okt = plan(2026, 10).shifts;
    const nov = plan(2026, 11).shifts;
    const woche = patternWeekKey("2026-10-31"); // Mo 26.10. – So 01.11.
    for (const id of ["VZ1", "VZ2", "VZ3", "VZ4"]) {
      const teil = [...okt, ...nov].filter((x) => x.employeeId === id && patternWeekKey(x.date) === woche);
      expect(teil.length, id).toBe(6);
      expect(teil.reduce((a, x) => a + x.paidMinutes, 0), id).toBe(40 * 60);
    }
  });

  it("ohne Wochenvertrag bleibt das eingetragene Monats-Soll und wird exakt erreicht", () => {
    const ohneVertrag = { ...MUSTER, weeklyHours: undefined, minHours: 6, maxHours: 8 };
    const team = [vz("A", ohneVertrag), tz("B", 40)];
    const { shifts, soll } = plan(2026, 10, team);
    expect(soll.get("A")).toBe(176 * 60);
    const summe = shifts.filter((x) => x.employeeId === "A").reduce((a, x) => a + x.paidMinutes, 0);
    expect(summe).toBe(176 * 60);
  });

  it("Personen ohne Muster planen weiter wie bisher (ganze Stunden 4–8 h)", () => {
    const { shifts } = plan(2026, 10);
    for (const s of shifts.filter((x) => x.employeeId.startsWith("TZ"))) {
      expect(s.paidMinutes % 60, s.date).toBe(0);
      expect(s.paidMinutes).toBeGreaterThanOrEqual(4 * 60);
      expect(s.paidMinutes).toBeLessThanOrEqual(8 * 60);
    }
  });
});

describe("Vollzeit Kiểu 1 (5 Tage × 8 h) neben Kiểu 2 (6 Tage, 6,5–7 h)", () => {
  const KIEU1: WeekPattern = { days: 5, minHours: 8, maxHours: 8, weeklyHours: 40 };
  const team: Employee[] = [
    vz("K1A", KIEU1), vz("K1B", KIEU1), vz("K1C", KIEU1),
    vz("K2A"), vz("K2B"),
    tz("TZ1", 40), tz("TZ2", 40), tz("TZ3", 60),
  ];

  for (const [year, month] of [[2026, 10], [2026, 11], [2027, 2]] as const) {
    it(`${month}/${year}: Kiểu 1 arbeitet nur 8-h-Schichten, volle Wochen 5 Tage = 40 h; alle erreichen ihr Soll`, () => {
      const { shifts, soll } = plan(year, month, team);
      for (const id of ["K1A", "K1B", "K1C"]) {
        const proWoche = new Map<string, number[]>();
        for (const s of shifts.filter((x) => x.employeeId === id)) {
          expect(s.paidMinutes, `${id} ${s.date}`).toBe(8 * 60);
          const k = patternWeekKey(s.date);
          proWoche.set(k, [...(proWoche.get(k) ?? []), s.paidMinutes]);
        }
        for (const [woche, laengen] of proWoche) expect(laengen.length, `${id} ${woche}`).toBeLessThanOrEqual(5);
      }
      const employees = team.map((e) => ({ ...e, targetMinutes: soll.get(e.id)! }));
      expect(validateSchedule(employees, shifts).errors).toEqual([]);
    });
  }
});

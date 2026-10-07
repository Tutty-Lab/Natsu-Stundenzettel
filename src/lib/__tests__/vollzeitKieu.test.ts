// „Kiểu xếp ca" für Vollzeit: jede Vorlage ist gültig, ihr Text stimmt und der
// Planer schafft sie – auch mehrere Kiểu gemischt in einem Team.
import { describe, expect, it } from "vitest";
import { effectiveTargets, generateSchedule } from "../scheduler";
import { validateSchedule } from "../validation";
import { DEFAULT_WORK_HOURS } from "../workHours";
import { isValidPattern, patternWeekKey } from "../weekPattern";
import { VOLLZEIT_KIEU, kieuOf, kieuText, suggestedKieu } from "../vollzeitKieu";
import type { Employee } from "../../types";

describe("VOLLZEIT_KIEU", () => {
  it("alle Vorlagen sind gültige Muster und eindeutig", () => {
    for (const k of VOLLZEIT_KIEU) {
      expect(isValidPattern(k.pattern), k.label).toBe(true);
      expect(kieuOf({ ...k.pattern, restDays: undefined })?.id).toBe(k.id);
    }
  });

  it("Text nennt die echte Verteilung", () => {
    expect(VOLLZEIT_KIEU.map((k) => kieuText(k.pattern))).toEqual([
      "5 ngày: 5 ca 8h = 40h",
      "6 ngày: 2 ca 7h + 4 ca 6,5h = 40h",
      "5 ngày: 3 ca 8h + 2 ca 7,5h = 39h",
      "6 ngày: 6 ca 6,5h = 39h",
      "5 ngày: 2 ca 8h + 3 ca 7,5h = 38,5h",
      "6 ngày: 5 ca 6,5h + 1 ca 6h = 38,5h",
    ]);
  });

  it("Altdaten: tối đa 5 ngày => Kiểu 1, sonst Kiểu 2", () => {
    const base: Employee = { id: "x", name: "x", employmentType: "VOLLZEIT", targetMinutes: 176 * 60 };
    expect(suggestedKieu({ ...base, maxDaysPerWeek: 5 }).id).toBe(1);
    expect(suggestedKieu(base).id).toBe(2);
  });
});

describe("Planer mit allen Kiểu gemischt", () => {
  const team: Employee[] = [
    ...VOLLZEIT_KIEU.flatMap((k) =>
      ["a", "b"].map((s) => ({
        id: `K${k.id}${s}`,
        name: `K${k.id}${s}`,
        employmentType: "VOLLZEIT" as const,
        targetMinutes: 176 * 60,
        weekPattern: { ...k.pattern },
      })),
    ),
    ...[40, 40, 60, 80].map((h, i) => ({
      id: `TZ${i}`,
      name: `TZ${i}`,
      employmentType: "TEILZEIT" as const,
      targetMinutes: h * 60,
    })),
  ];

  for (const [year, month] of [[2026, 10], [2026, 11], [2027, 2]] as const) {
    it(`${month}/${year}: alle erreichen ihr Soll, Schichtlängen und Tage je Woche passen zum Kiểu`, () => {
      const input = { year, month, workHours: DEFAULT_WORK_HOURS, employees: team };
      const shifts = generateSchedule(input);
      const soll = effectiveTargets(input);
      const employees = team.map((e) => ({ ...e, targetMinutes: soll.get(e.id)! }));
      expect(validateSchedule(employees, shifts).errors).toEqual([]);

      for (const e of team.filter((x) => x.weekPattern)) {
        const p = e.weekPattern!;
        const proWoche = new Map<string, number>();
        for (const s of shifts.filter((x) => x.employeeId === e.id)) {
          expect(s.paidMinutes, `${e.id} ${s.date}`).toBeGreaterThanOrEqual(p.minHours * 60);
          expect(s.paidMinutes, `${e.id} ${s.date}`).toBeLessThanOrEqual(p.maxHours * 60);
          const k = patternWeekKey(s.date);
          proWoche.set(k, (proWoche.get(k) ?? 0) + 1);
        }
        for (const [woche, n] of proWoche) expect(n, `${e.id} ${woche}`).toBeLessThanOrEqual(p.days);
      }
    });
  }
});

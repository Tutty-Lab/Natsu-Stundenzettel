// Độ phủ: Mindestbesetzung (harte Regel) + dynamisches „nên có" + Minijob-Vorrang.
import { describe, expect, it } from "vitest";
import { effectiveTargets, generateSchedule } from "../scheduler";
import { validateSchedule } from "../validation";
import { DEFAULT_WORK_HOURS, resolveDay } from "../workHours";
import { datesOfMonth, parseIsoDate, weekdayKeyOf } from "../demand";
import { nrwHolidays } from "../holidays";
import {
  coverageGaps,
  dayCoverage,
  defaultStaffing,
  floorAt,
  normalizeStaffing,
  retimeDay,
} from "../coverage";
import type { Employee, Shift } from "../../types";

const shift = (id: string, start: number, end: number, employeeId = id): Shift => ({
  id, employeeId, date: "2026-10-05", startMinutes: start, endMinutes: end,
  pauseMinutes: 0, paidMinutes: end - start, shiftType: "LATE", generated: true,
});

describe("Staffing-Konfiguration", () => {
  it("Vorgabe je Filiale: immer 2, trưa 12–14 ≥ 3, tối 18–21 ≥ 4 (NATSU) bzw. ≥ 3 (nava)", () => {
    const natsu = defaultStaffing("natsu");
    expect(floorAt(natsu, 10 * 60 + 30)).toBe(2);
    expect(floorAt(natsu, 12 * 60)).toBe(3);
    expect(floorAt(natsu, 13 * 60 + 30)).toBe(3);
    expect(floorAt(natsu, 14 * 60)).toBe(2);
    expect(floorAt(natsu, 18 * 60)).toBe(4);
    expect(floorAt(natsu, 20 * 60 + 30)).toBe(4);
    expect(floorAt(natsu, 21 * 60)).toBe(2);
    expect(floorAt(defaultStaffing("nava"), 19 * 60)).toBe(3);
  });

  it("repariert kaputte gespeicherte Werte", () => {
    const cfg = normalizeStaffing({ base: -3, peaks: [{ label: "x", startMinutes: 600, endMinutes: 500, min: 3 }] }, "natsu");
    expect(cfg.base).toBe(0);
    expect(cfg.peaks).toEqual([]);
    expect(normalizeStaffing(undefined, "nava")).toEqual(defaultStaffing("nava"));
  });
});

describe("retimeDay", () => {
  const window = { startMinutes: 11 * 60 + 30, endMinutes: 22 * 60 };
  const cfg = defaultStaffing("natsu");

  it("schließt die Sonntags-Mittagslücke, ohne Längen oder Anzahl zu ändern", () => {
    // Wie der alte Plan: ein Frühdienst, alle anderen abends.
    const before = [
      shift("a", 690, 690 + 510),
      ...["b", "c", "d", "e", "f"].map((id) => shift(id, 1320 - 480, 1320)),
      shift("g", 1320 - 240, 1320),
      shift("h", 1320 - 240, 1320),
    ];
    expect(coverageGaps(before, ["2026-10-05"], () => ({ closed: false, window }), cfg).length).toBeGreaterThan(0);
    const after = retimeDay(before, window, cfg);
    expect(after.map((s) => s.endMinutes - s.startMinutes)).toEqual(before.map((s) => s.endMinutes - s.startMinutes));
    for (const s of after) {
      expect(s.startMinutes).toBeGreaterThanOrEqual(window.startMinutes);
      expect(s.endMinutes).toBeLessThanOrEqual(window.endMinutes);
    }
    expect(coverageGaps(after, ["2026-10-05"], () => ({ closed: false, window }), cfg)).toEqual([]);
  });

  it("nên có wächst mit den Stunden des Tages – nichts ist fest eingetragen", () => {
    const few = Array.from({ length: 6 }, (_, i) => shift(`s${i}`, 690, 690 + 360));
    const many = Array.from({ length: 14 }, (_, i) => shift(`m${i}`, 690, 690 + 480));
    const peakTarget = (shifts: Shift[]) =>
      dayCoverage(shifts, window, cfg).slots.find((x) => x.t === 19 * 60)!.target;
    expect(peakTarget(many)).toBeGreaterThan(peakTarget(few));
    expect(peakTarget(few)).toBeGreaterThanOrEqual(4);
  });
});

/** Team wie NATSU im Okt 2026: 8 Vollzeit, 16 Minijob à 40 h, 3 Azubi in der Schulzeit. */
function natsuTeam(): Employee[] {
  return [
    ...Array.from({ length: 8 }, (_, i): Employee => ({
      id: `VZ${i}`, name: `VZ${i}`, employmentType: "VOLLZEIT", targetMinutes: 176 * 60,
      ...(i < 5 ? { weekPattern: { days: 5, minHours: 8, maxHours: 8, weeklyHours: 40 } } : {}),
      ...(i >= 5 ? { weekPattern: { days: 6, minHours: 6.5, maxHours: 7, weeklyHours: 40 } } : {}),
    })),
    ...Array.from({ length: 16 }, (_, i): Employee => ({
      id: `MJ${i}`, name: `MJ${i}`, employmentType: "TEILZEIT", targetMinutes: 40 * 60,
    })),
    ...Array.from({ length: 3 }, (_, i): Employee => ({
      id: `AZ${i}`, name: `AZ${i}`, employmentType: "AZUBI", targetMinutes: 96 * 60,
      azubi: { inSchoolTerm: true, schoolDays: ["monday", "tuesday"], weeklyHoursInTerm: 24 },
      availableWeekdays: ["monday", "tuesday", "thursday", "saturday", "sunday"],
    })),
  ];
}

describe("Planer mit Mindestbesetzung", () => {
  for (const [storeId, year, month] of [["natsu", 2026, 10], ["natsu", 2026, 12], ["nava", 2026, 10]] as const) {
    it(`${storeId} ${month}/${year}: keine Lücke unter der Mindestbesetzung, alle Soll exakt`, () => {
      const employees = natsuTeam();
      const staffing = defaultStaffing(storeId);
      const input = { year, month, workHours: DEFAULT_WORK_HOURS, employees, staffing, seed: "cov" };
      const shifts = generateSchedule(input);
      const soll = effectiveTargets(input);
      const v = validateSchedule(employees.map((e) => ({ ...e, targetMinutes: soll.get(e.id)! })), shifts);
      expect(v.errors).toEqual([]);
      const holidays = nrwHolidays(year);
      const gaps = coverageGaps(shifts, datesOfMonth(year, month), (d) => resolveDay(DEFAULT_WORK_HOURS, d, holidays), staffing);
      expect(gaps).toEqual([]);
    });
  }

  it("Minijob arbeitet öfter am Wochenende, als es dem Anteil der Wochenendtage entspricht", () => {
    // Ohne Azubi: die Azubis (nur T5/T7/CN) würden die Wochenenden sonst vorher füllen.
    const employees = natsuTeam().filter((e) => e.employmentType !== "AZUBI");
    const shifts = generateSchedule({
      year: 2026, month: 10, workHours: DEFAULT_WORK_HOURS, employees, staffing: defaultStaffing("natsu"), seed: "mj",
    });
    const holidays = nrwHolidays(2026);
    const weekendLike = (d: string) => {
      const k = weekdayKeyOf(parseIsoDate(d));
      return holidays.has(d) || k === "saturday" || k === "sunday";
    };
    const mj = shifts.filter((s) => s.employeeId.startsWith("MJ"));
    const share = mj.filter((s) => weekendLike(s.date)).length / mj.length;
    const dayShare = datesOfMonth(2026, 10).filter(weekendLike).length / 31;
    expect(share).toBeGreaterThan(dayShare);
  });
});

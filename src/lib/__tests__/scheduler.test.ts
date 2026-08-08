import { describe, expect, it } from "vitest";
import { generateSchedule } from "../scheduler";
import { validateSchedule } from "../validation";
import { maxConsecutiveRun } from "../consecutive";
import { SAMPLE_EMPLOYEES } from "../sampleData";
import { DEFAULT_WORK_HOURS } from "../workHours";
import type { Employee } from "../../types";

describe("Scheduler – August 2026 Beispieldaten", () => {
  const shifts = generateSchedule({
    year: 2026,
    month: 8,
    workHours: DEFAULT_WORK_HOURS,
    employees: SAMPLE_EMPLOYEES,
  });

  it("verteilt insgesamt genau 1022 bezahlte Stunden", () => {
    const totalMinutes = shifts.reduce((s, x) => s + x.paidMinutes, 0);
    expect(totalMinutes).toBe(1022 * 60);
  });

  it("trifft jedes einzelne Mitarbeiter-Soll exakt", () => {
    const expected: Record<string, number> = {
      VZ1: 176, VZ2: 180, VZ3: 179, VZ4: 178,
      TZ1: 40, TZ2: 55, TZ3: 55, TZ4: 79, TZ5: 80,
    };
    for (const emp of SAMPLE_EMPLOYEES) {
      const assigned = shifts
        .filter((s) => s.employeeId === emp.id)
        .reduce((sum, s) => sum + s.paidMinutes, 0);
      expect(assigned).toBe(expected[emp.id] * 60);
    }
  });

  it("hält alle harten Regeln ein (Validierung grün)", () => {
    const result = validateSchedule(SAMPLE_EMPLOYEES, shifts);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("höchstens ein Dienst pro Mitarbeiter und Tag", () => {
    const seen = new Set<string>();
    for (const s of shifts) {
      const key = `${s.employeeId}#${s.date}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("nie mehr als 6 aufeinanderfolgende Arbeitstage", () => {
    for (const emp of SAMPLE_EMPLOYEES) {
      const dates = shifts.filter((s) => s.employeeId === emp.id).map((s) => s.date);
      expect(maxConsecutiveRun(dates)).toBeLessThanOrEqual(6);
    }
  });

  it("jede Schicht: paid <= 8 h und korrekte Pause", () => {
    for (const s of shifts) {
      expect(s.paidMinutes).toBeLessThanOrEqual(8 * 60);
      expect(s.pauseMinutes).toBe(s.paidMinutes > 360 ? 30 : 0);
      expect(s.endMinutes - s.startMinutes - s.pauseMinutes).toBe(s.paidMinutes);
    }
  });

  it("ist deterministisch (gleiche Eingabe => gleiche Ausgabe)", () => {
    const again = generateSchedule({
      year: 2026,
      month: 8,
      workHours: DEFAULT_WORK_HOURS,
      employees: SAMPLE_EMPLOYEES,
    });
    expect(again.map((s) => `${s.date}|${s.employeeId}|${s.paidMinutes}|${s.shiftType}`)).toEqual(
      shifts.map((s) => `${s.date}|${s.employeeId}|${s.paidMinutes}|${s.shiftType}`),
    );
  });

  it("spreads Teilzeit across more short shifts", () => {
    const expectedCounts: Record<string, number> = {
      TZ1: 10,
      TZ2: 13,
      TZ3: 13,
      TZ4: 18,
      TZ5: 18,
    };

    for (const [employeeId, count] of Object.entries(expectedCounts)) {
      const employeeShifts = shifts.filter((shift) => shift.employeeId === employeeId);
      expect(employeeShifts).toHaveLength(count);
    }

    const fortyHours = shifts.filter((shift) => shift.employeeId === "TZ1");
    expect(fortyHours.every((shift) => shift.paidMinutes === 4 * 60)).toBe(true);
  });

  it("uses transition shifts to cover 15:30–17:00", () => {
    const partTimeIds = new Set(
      SAMPLE_EMPLOYEES.filter((employee) => employee.employmentType === "TEILZEIT").map(
        (employee) => employee.id,
      ),
    );
    const transitionStart = 15 * 60 + 30;
    const transitionEnd = 17 * 60;
    const transitionShifts = shifts.filter(
      (shift) =>
        partTimeIds.has(shift.employeeId) &&
        shift.startMinutes <= transitionStart &&
        shift.endMinutes >= transitionEnd,
    );

    for (const employeeId of partTimeIds) {
      expect(
        transitionShifts.filter((shift) => shift.employeeId === employeeId).length,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it("spreads transition shifts over separate dates while dates remain available", () => {
    const transitionShifts = shifts.filter((shift) => shift.shiftType === "MID");
    expect(new Set(transitionShifts.map((shift) => shift.date)).size).toBe(
      transitionShifts.length,
    );
  });

  it("keeps two transition visits for every Teilzeit employee across seeds", () => {
    const partTimeIds = SAMPLE_EMPLOYEES.filter(
      (employee) => employee.employmentType === "TEILZEIT",
    ).map((employee) => employee.id);

    for (let index = 0; index < 12; index += 1) {
      const seeded = generateSchedule({
        year: 2026,
        month: 8,
        workHours: DEFAULT_WORK_HOURS,
        employees: SAMPLE_EMPLOYEES,
        seed: `transition-${index}`,
      });
      for (const employeeId of partTimeIds) {
        expect(
          seeded.filter(
            (shift) =>
              shift.employeeId === employeeId &&
              shift.startMinutes <= 15 * 60 + 30 &&
              shift.endMinutes >= 17 * 60,
          ).length,
        ).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("varies Teilzeit shift lengths between deterministic seeds", () => {
    const first = generateSchedule({
      year: 2026,
      month: 8,
      workHours: DEFAULT_WORK_HOURS,
      employees: SAMPLE_EMPLOYEES,
      seed: "short-shifts-a",
    });
    const second = generateSchedule({
      year: 2026,
      month: 8,
      workHours: DEFAULT_WORK_HOURS,
      employees: SAMPLE_EMPLOYEES,
      seed: "short-shifts-b",
    });
    const pattern = (items: typeof first) =>
      items
        .filter((shift) => shift.employeeId.startsWith("TZ"))
        .map((shift) => `${shift.employeeId}:${shift.paidMinutes}`)
        .join("|");

    expect(pattern(first)).not.toBe(pattern(second));
  });

  it("plant mehr Stunden am Samstag als am Montag", () => {
    const byDate = new Map<string, number>();
    for (const s of shifts) {
      byDate.set(s.date, (byDate.get(s.date) ?? 0) + s.paidMinutes);
    }
    // 2026-08-01 ist Samstag, 2026-08-03 ist Montag.
    const sat = byDate.get("2026-08-01") ?? 0;
    const mon = byDate.get("2026-08-03") ?? 0;
    expect(sat).toBeGreaterThan(mon);
  });
});

describe("Scheduler – weitere Monate robust", () => {
  it("erzeugt gültige Pläne für Februar (28 Tage)", () => {
    const shifts = generateSchedule({
      year: 2026,
      month: 2,
      workHours: DEFAULT_WORK_HOURS,
      employees: SAMPLE_EMPLOYEES,
    });
    const result = validateSchedule(SAMPLE_EMPLOYEES, shifts);
    expect(result.valid).toBe(true);
  });
});

describe("Scheduler – current Natsu workforce shape", () => {
  it("plans 6 Vollzeit, 12 Teilzeit and 3 Azubi without changing any target", () => {
    const employees: Employee[] = [
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `VZ-${index}`,
        name: `Vollzeit ${index}`,
        employmentType: "VOLLZEIT" as const,
        targetMinutes: 176 * 60,
      })),
      ...Array.from({ length: 12 }, (_, index) => ({
        id: `TZ-${index}`,
        name: `Teilzeit ${index}`,
        employmentType: "TEILZEIT" as const,
        targetMinutes: 40 * 60,
      })),
      ...Array.from({ length: 3 }, (_, index): Employee => ({
        id: `AZ-${index}`,
        name: `Azubi ${index}`,
        employmentType: "AZUBI" as const,
        targetMinutes: 154 * 60,
        azubi: {
          inSchoolTerm: false,
          schoolDays: ["monday", "tuesday"],
          weeklyHoursOutOfTerm: 38.5,
        },
      })),
    ];

    const shifts = generateSchedule({
      year: 2026,
      month: 8,
      workHours: DEFAULT_WORK_HOURS,
      employees,
      seed: "natsu-current-workforce",
    });

    expect(validateSchedule(employees, shifts).errors).toEqual([]);
    expect(shifts.reduce((sum, shift) => sum + shift.paidMinutes, 0)).toBe(1998 * 60);

    for (const employee of employees.filter(
      (item) => item.employmentType === "TEILZEIT",
    )) {
      const own = shifts.filter((shift) => shift.employeeId === employee.id);
      expect(own).toHaveLength(10);
      expect(own.every((shift) => shift.paidMinutes === 4 * 60)).toBe(true);
      expect(own.filter((shift) => shift.shiftType === "MID").length).toBeGreaterThanOrEqual(2);
    }

    const transitionShifts = shifts.filter((shift) => shift.shiftType === "MID");
    expect(new Set(transitionShifts.map((shift) => shift.date)).size).toBe(
      transitionShifts.length,
    );
  });
});

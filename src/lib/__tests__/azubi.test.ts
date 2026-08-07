import { describe, expect, it } from "vitest";
import { AZUBI_WORKDAYS_IN_TERM, type Employee, type Shift } from "../../types";
import {
  azubiMonthlyMinutes,
  defaultAzubiConfig,
  withAutomaticAzubiTarget,
} from "../azubi";
import { parseIsoDate, weekdayKeyOf } from "../demand";
import { generateSchedule } from "../scheduler";
import { DEFAULT_WORK_HOURS } from "../workHours";
import { validateSchedule } from "../validation";

function weekKey(isoDate: string): string {
  const date = parseIsoDate(isoDate);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function manualShift(id: string, date: string, paidHours: number): Shift {
  const paidMinutes = paidHours * 60;
  const pauseMinutes = paidMinutes > 6 * 60 ? 30 : 0;
  const startMinutes = 10 * 60 + 30;
  return {
    id,
    employeeId: "AZ-MANUAL",
    date,
    startMinutes,
    endMinutes: startMinutes + paidMinutes + pauseMinutes,
    pauseMinutes,
    paidMinutes,
    shiftType: "CUSTOM",
    generated: false,
  };
}

describe("Azubi monthly target", () => {
  it("uses the weekly hours configured by the owner", () => {
    const inTerm = {
      ...defaultAzubiConfig(),
      weeklyHoursInTerm: 20,
      weeklyHoursOutOfTerm: 35,
    };
    const outsideTerm = { ...inTerm, inSchoolTerm: false };

    expect(azubiMonthlyMinutes(inTerm)).toBe(20 * 4 * 60);
    expect(azubiMonthlyMinutes(outsideTerm)).toBe(35 * 4 * 60);
  });
});

describe("Azubi schedule during school term", () => {
  it("keeps two school days free and follows the configured 20h per week", () => {
    const employee: Employee = withAutomaticAzubiTarget({
      id: "AZ-TERM",
      name: "Azubi term",
      employmentType: "AZUBI",
      targetMinutes: 0,
      azubi: {
        inSchoolTerm: true,
        schoolDays: ["monday", "tuesday"],
        weeklyHoursInTerm: 20,
        weeklyHoursOutOfTerm: 35,
      },
    });

    const shifts = generateSchedule({
      year: 2026,
      month: 9,
      workHours: DEFAULT_WORK_HOURS,
      employees: [employee],
      seed: "azubi-term",
    });

    expect(shifts.reduce((sum, shift) => sum + shift.paidMinutes, 0)).toBe(80 * 60);

    const minutesByWeek = new Map<string, number>();
    const daysByWeek = new Map<string, Set<string>>();
    for (const shift of shifts) {
      expect(["monday", "tuesday"]).not.toContain(
        weekdayKeyOf(parseIsoDate(shift.date)),
      );
      const key = weekKey(shift.date);
      minutesByWeek.set(key, (minutesByWeek.get(key) ?? 0) + shift.paidMinutes);
      const days = daysByWeek.get(key) ?? new Set<string>();
      days.add(shift.date);
      daysByWeek.set(key, days);
    }

    for (const minutes of minutesByWeek.values()) {
      expect(minutes).toBeLessThanOrEqual(20 * 60);
    }
    for (const days of daysByWeek.values()) {
      expect(days.size).toBeLessThanOrEqual(AZUBI_WORKDAYS_IN_TERM);
    }
    for (const fullWeek of ["2026-9-7", "2026-9-14", "2026-9-21"]) {
      expect(daysByWeek.get(fullWeek)?.size).toBe(AZUBI_WORKDAYS_IN_TERM);
      expect(minutesByWeek.get(fullWeek)).toBe(20 * 60);
    }
  });
});

describe("Azubi schedule outside school term", () => {
  it("assigns exactly 140h without exceeding the configured 35h per week", () => {
    const employee: Employee = withAutomaticAzubiTarget({
      id: "AZ-OUTSIDE",
      name: "Azubi outside term",
      employmentType: "AZUBI",
      targetMinutes: 0,
      azubi: {
        inSchoolTerm: false,
        schoolDays: ["monday", "tuesday"],
        weeklyHoursInTerm: 20,
        weeklyHoursOutOfTerm: 35,
      },
    });

    const shifts = generateSchedule({
      year: 2026,
      month: 7,
      workHours: DEFAULT_WORK_HOURS,
      employees: [employee],
      seed: "azubi-outside",
    });

    expect(shifts.reduce((sum, shift) => sum + shift.paidMinutes, 0)).toBe(140 * 60);
    const minutesByWeek = new Map<string, number>();
    for (const shift of shifts) {
      const key = weekKey(shift.date);
      minutesByWeek.set(key, (minutesByWeek.get(key) ?? 0) + shift.paidMinutes);
    }
    for (const minutes of minutesByWeek.values()) {
      expect(minutes).toBeLessThanOrEqual(35 * 60);
    }
  });
});

describe("Azubi rule validation", () => {
  it("rejects a configured weekly target above the legal term limit", () => {
    const employee = withAutomaticAzubiTarget({
      id: "AZ-OVER-LIMIT",
      name: "Azubi over limit",
      employmentType: "AZUBI",
      targetMinutes: 0,
      azubi: {
        inSchoolTerm: true,
        schoolDays: ["monday", "tuesday"],
        weeklyHoursInTerm: 25,
        weeklyHoursOutOfTerm: 35,
      },
    });

    expect(() =>
      generateSchedule({
        year: 2026,
        month: 9,
        workHours: DEFAULT_WORK_HOURS,
        employees: [employee],
      }),
    ).toThrow(/24h/);
  });

  it("requires exactly two school days before generating", () => {
    const employee = withAutomaticAzubiTarget({
      id: "AZ-SCHOOL-DAYS",
      name: "Azubi school days",
      employmentType: "AZUBI",
      targetMinutes: 0,
      azubi: { inSchoolTerm: true, schoolDays: ["monday"] },
    });

    expect(() =>
      generateSchedule({
        year: 2026,
        month: 9,
        workHours: DEFAULT_WORK_HOURS,
        employees: [employee],
      }),
    ).toThrow(/2/);
  });

  it("reports manual work on school days and more than three workdays", () => {
    const employee: Employee = {
      id: "AZ-MANUAL",
      name: "Azubi manual",
      employmentType: "AZUBI",
      targetMinutes: 20 * 60,
      azubi: {
        inSchoolTerm: true,
        schoolDays: ["monday", "tuesday"],
      },
    };
    const shifts = [
      manualShift("school", "2026-09-07", 4),
      manualShift("work-1", "2026-09-09", 4),
      manualShift("work-2", "2026-09-10", 4),
      manualShift("work-3", "2026-09-11", 4),
      manualShift("work-4", "2026-09-12", 4),
    ];

    const result = validateSchedule([employee], shifts);
    expect(result.errors.some((error) => error.message.includes("ngày đi học"))).toBe(true);
    expect(result.errors.some((error) => error.message.includes("tối đa 3 ngày"))).toBe(true);
  });
});

describe("Azubi yearly robustness", () => {
  it("creates valid schedules for all months in both term modes", () => {
    for (let month = 1; month <= 12; month += 1) {
      for (const inSchoolTerm of [true, false]) {
        const employee = withAutomaticAzubiTarget({
          id: `AZ-${month}-${inSchoolTerm}`,
          name: "Azubi yearly",
          employmentType: "AZUBI",
          targetMinutes: 0,
          azubi: {
            inSchoolTerm,
            schoolDays: ["monday", "tuesday"],
          },
        });
        const shifts = generateSchedule({
          year: 2026,
          month,
          workHours: DEFAULT_WORK_HOURS,
          employees: [employee],
          seed: `azubi-${month}-${inSchoolTerm}`,
        });

        expect(validateSchedule([employee], shifts).errors).toEqual([]);
      }
    }
  });
});

// ============================================================================
// Validierung des Dienstplans gegen alle geforderten Regeln.
// ============================================================================

import { AZUBI_WORKDAYS_IN_TERM, type Employee, type Shift } from "../types";
import { calculatePause } from "./time";
import { maxConsecutiveRun } from "./consecutive";
import { azubiConfigOf, azubiWeeklyHours } from "./azubi";
import { parseIsoDate, weekdayKeyOf } from "./demand";

export type ValidationError = {
  employeeId?: string;
  date?: string;
  message: string;
};

export type EmployeeSummary = {
  employee: Employee;
  assignedMinutes: number;
  targetMinutes: number;
  diffMinutes: number; // assigned - target
  maxConsecutiveDays: number;
  shiftCount: number;
};

export type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
  summaries: EmployeeSummary[];
};

const MAX_PAID_MINUTES = 8 * 60;
const MAX_CONSECUTIVE_DAYS = 6;

function weekKeyOf(isoDate: string): string {
  const date = parseIsoDate(isoDate);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export function validateSchedule(
  employees: Employee[],
  shifts: Shift[],
): ValidationResult {
  const errors: ValidationError[] = [];
  const shiftsByEmployee = new Map<string, Shift[]>();
  for (const emp of employees) shiftsByEmployee.set(emp.id, []);
  for (const shift of shifts) {
    if (!shiftsByEmployee.has(shift.employeeId)) {
      shiftsByEmployee.set(shift.employeeId, []);
    }
    shiftsByEmployee.get(shift.employeeId)!.push(shift);
  }

  // Regeln je einzelner Schicht.
  for (const shift of shifts) {
    const presence = shift.endMinutes - shift.startMinutes;
    const expectedPaid = presence - shift.pauseMinutes;
    const expectedPause = calculatePause(shift.paidMinutes);

    if (shift.endMinutes <= shift.startMinutes) {
      errors.push({
        employeeId: shift.employeeId,
        date: shift.date,
        message: `Giờ ra không sau giờ vào (${shift.date}).`,
      });
    }
    if (shift.paidMinutes > MAX_PAID_MINUTES) {
      errors.push({
        employeeId: shift.employeeId,
        date: shift.date,
        message: `Quá 8 giờ công ngày ${shift.date}.`,
      });
    }
    if (shift.paidMinutes !== expectedPaid) {
      errors.push({
        employeeId: shift.employeeId,
        date: shift.date,
        message: `Giờ công không khớp giờ vào/ra/nghỉ ngày ${shift.date}.`,
      });
    }
    if (shift.pauseMinutes !== expectedPause) {
      errors.push({
        employeeId: shift.employeeId,
        date: shift.date,
        message: `Sai giờ nghỉ ngày ${shift.date}: ${shift.pauseMinutes} thay vì ${expectedPause} phút.`,
      });
    }
  }

  const summaries: EmployeeSummary[] = [];

  for (const emp of employees) {
    const empShifts = shiftsByEmployee.get(emp.id) ?? [];

    // Höchstens ein Dienst pro Tag.
    const seenDates = new Set<string>();
    for (const shift of empShifts) {
      if (seenDates.has(shift.date)) {
        errors.push({
          employeeId: emp.id,
          date: shift.date,
          message: `Có nhiều hơn một ca ngày ${shift.date}.`,
        });
      }
      seenDates.add(shift.date);
    }

    const assignedMinutes = empShifts.reduce((sum, s) => sum + s.paidMinutes, 0);
    const maxRun = maxConsecutiveRun(empShifts.map((s) => s.date));

    if (assignedMinutes !== emp.targetMinutes) {
      errors.push({
        employeeId: emp.id,
        message: `${emp.name}: chưa đạt giờ định mức: ${assignedMinutes / 60} h thay vì ${emp.targetMinutes / 60} h.`,
      });
    }
    if (maxRun > MAX_CONSECUTIVE_DAYS) {
      errors.push({
        employeeId: emp.id,
        message: `${emp.name}: làm quá 6 ngày liên tiếp (${maxRun}).`,
      });
    }

    if (emp.employmentType === "AZUBI") {
      const config = azubiConfigOf(emp.azubi);
      if (config.inSchoolTerm && config.schoolDays.length !== 2) {
        errors.push({
          employeeId: emp.id,
          message: `${emp.name}: trong kỳ học phải chọn đúng 2 ngày đi học.`,
        });
      }

      const byWeek = new Map<string, { minutes: number; dates: Set<string> }>();
      for (const shift of empShifts) {
        if (
          config.inSchoolTerm &&
          config.schoolDays.includes(weekdayKeyOf(parseIsoDate(shift.date)))
        ) {
          errors.push({
            employeeId: emp.id,
            date: shift.date,
            message: `${emp.name}: có ca vào ngày đi học ${shift.date}.`,
          });
        }

        const key = weekKeyOf(shift.date);
        const week = byWeek.get(key) ?? { minutes: 0, dates: new Set<string>() };
        week.minutes += shift.paidMinutes;
        week.dates.add(shift.date);
        byWeek.set(key, week);
      }

      const weeklyCap = Math.round(azubiWeeklyHours(config) * 60);
      for (const [week, values] of byWeek) {
        if (values.minutes > weeklyCap) {
          errors.push({
            employeeId: emp.id,
            message: `${emp.name}: tuần ${week} vượt mức ${weeklyCap / 60}h.`,
          });
        }
        if (config.inSchoolTerm && values.dates.size > AZUBI_WORKDAYS_IN_TERM) {
          errors.push({
            employeeId: emp.id,
            message: `${emp.name}: tuần ${week} vượt tối đa ${AZUBI_WORKDAYS_IN_TERM} ngày làm.`,
          });
        }
      }
    }

    summaries.push({
      employee: emp,
      assignedMinutes,
      targetMinutes: emp.targetMinutes,
      diffMinutes: assignedMinutes - emp.targetMinutes,
      maxConsecutiveDays: maxRun,
      shiftCount: empShifts.length,
    });
  }

  return { valid: errors.length === 0, errors, summaries };
}

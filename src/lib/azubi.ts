import {
  AZUBI_HOURS_IN_TERM,
  AZUBI_HOURS_OUT_OF_TERM,
  type AzubiConfig,
  type Employee,
} from "../types";
import { parseIsoDate, weekdayKeyOf } from "./demand";

export const AZUBI_MONTHLY_WEEKS = 4;

export const DEFAULT_AZUBI_CONFIG: AzubiConfig = {
  inSchoolTerm: true,
  schoolDays: ["monday", "tuesday"],
  weeklyHoursInTerm: AZUBI_HOURS_IN_TERM,
  weeklyHoursOutOfTerm: AZUBI_HOURS_OUT_OF_TERM,
};

export type NormalizedAzubiConfig = Required<AzubiConfig>;

function normalizedWeeklyHours(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.round(value * 2) / 2);
}

export function defaultAzubiConfig(): NormalizedAzubiConfig {
  return {
    inSchoolTerm: DEFAULT_AZUBI_CONFIG.inSchoolTerm,
    schoolDays: [...DEFAULT_AZUBI_CONFIG.schoolDays],
    weeklyHoursInTerm: AZUBI_HOURS_IN_TERM,
    weeklyHoursOutOfTerm: AZUBI_HOURS_OUT_OF_TERM,
  };
}

export function azubiConfigOf(config: AzubiConfig | undefined): NormalizedAzubiConfig {
  if (!config) return defaultAzubiConfig();
  return {
    inSchoolTerm: Boolean(config.inSchoolTerm),
    schoolDays: [...new Set(config.schoolDays ?? [])],
    weeklyHoursInTerm: normalizedWeeklyHours(
      config.weeklyHoursInTerm,
      AZUBI_HOURS_IN_TERM,
    ),
    weeklyHoursOutOfTerm: normalizedWeeklyHours(
      config.weeklyHoursOutOfTerm,
      AZUBI_HOURS_OUT_OF_TERM,
    ),
  };
}

export function azubiWeeklyHours(config: AzubiConfig | undefined): number {
  const normalized = azubiConfigOf(config);
  return normalized.inSchoolTerm
    ? normalized.weeklyHoursInTerm
    : normalized.weeklyHoursOutOfTerm;
}

export function azubiWeeklyLimit(config: AzubiConfig | undefined): number {
  return azubiConfigOf(config).inSchoolTerm
    ? AZUBI_HOURS_IN_TERM
    : AZUBI_HOURS_OUT_OF_TERM;
}

export function azubiWeeklyCap(config: AzubiConfig | undefined): number {
  return Math.min(azubiWeeklyHours(config), azubiWeeklyLimit(config));
}

export function azubiMonthlyMinutes(config: AzubiConfig | undefined): number {
  return Math.round(azubiWeeklyHours(config) * AZUBI_MONTHLY_WEEKS * 60);
}

export function isAzubiSchoolDate(
  config: AzubiConfig | undefined,
  isoDate: string,
): boolean {
  const normalized = azubiConfigOf(config);
  return (
    normalized.inSchoolTerm &&
    normalized.schoolDays.includes(weekdayKeyOf(parseIsoDate(isoDate)))
  );
}

export function withAutomaticAzubiTarget(employee: Employee): Employee {
  if (employee.employmentType !== "AZUBI") return employee;

  const azubi = azubiConfigOf(employee.azubi);
  return {
    ...employee,
    azubi,
    targetMinutes: azubiMonthlyMinutes(azubi),
  };
}

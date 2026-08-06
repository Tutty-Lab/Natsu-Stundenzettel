import {
  AZUBI_HOURS_IN_TERM,
  AZUBI_HOURS_OUT_OF_TERM,
  type AzubiConfig,
  type Employee,
} from "../types";

export const AZUBI_MONTHLY_WEEKS = 4;

export const DEFAULT_AZUBI_CONFIG: AzubiConfig = {
  inSchoolTerm: true,
  schoolDays: ["monday", "tuesday"],
};

export function defaultAzubiConfig(): AzubiConfig {
  return {
    inSchoolTerm: DEFAULT_AZUBI_CONFIG.inSchoolTerm,
    schoolDays: [...DEFAULT_AZUBI_CONFIG.schoolDays],
  };
}

export function azubiConfigOf(config: AzubiConfig | undefined): AzubiConfig {
  if (!config) return defaultAzubiConfig();
  return {
    inSchoolTerm: Boolean(config.inSchoolTerm),
    schoolDays: [...new Set(config.schoolDays ?? [])],
  };
}

export function azubiWeeklyHours(config: AzubiConfig | undefined): number {
  return azubiConfigOf(config).inSchoolTerm
    ? AZUBI_HOURS_IN_TERM
    : AZUBI_HOURS_OUT_OF_TERM;
}

export function azubiMonthlyMinutes(config: AzubiConfig | undefined): number {
  return Math.round(azubiWeeklyHours(config) * AZUBI_MONTHLY_WEEKS * 60);
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

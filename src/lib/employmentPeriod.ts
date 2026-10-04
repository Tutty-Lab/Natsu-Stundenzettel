// ============================================================================
// Ngày vào làm / Ngày thôi làm (Ein- und Austritt).
//
// Außerhalb dieses Zeitraums wird niemand eingeplant. Arbeitet jemand nur einen
// Teil des Monats, wird das Monats-Soll anteilig nach Kalendertagen gekürzt.
// Das eingetragene Soll selbst bleibt unverändert – im nächsten vollen Monat
// gilt es wieder ganz. (Übernommen aus Thienlong, dort bewährt.)
//
// Bei „Mẫu tuần" mit Wochenvertrag braucht es keine Kürzung: dort zählen
// ohnehin nur die Arbeitstage, an denen die Person beschäftigt ist.
// ============================================================================

import type { Employee } from "../types";

/** true, wenn die Person an diesem Tag (yyyy-MM-dd) beschäftigt ist. */
export function isEmployeeActiveOn(employee: Employee, isoDate: string): boolean {
  if (employee.startDate && isoDate < employee.startDate) return false;
  if (employee.endDate && isoDate > employee.endDate) return false;
  return true;
}

/** Beschäftigte Kalendertage in einer Liste von Tagen. */
export function activeDays(employee: Employee, dates: string[]): number {
  if (!employee.startDate && !employee.endDate) return dates.length;
  return dates.filter((d) => isEmployeeActiveOn(employee, d)).length;
}

/**
 * Kürzt ein Monats-Soll anteilig nach beschäftigten Kalendertagen, gerundet
 * auf `step` Minuten (ganze Stunden für den normalen Planer, 30′ für Muster).
 */
export function prorateMinutes(minutes: number, employee: Employee, dates: string[], step = 60): number {
  const active = activeDays(employee, dates);
  if (active >= dates.length) return minutes;
  return Math.round((minutes * active) / dates.length / step) * step;
}

/** Kurztext für Listen, z. B. „vào 16/10/2026 · thôi làm 30/11/2026". */
export function employmentPeriodLabel(employee: Employee): string {
  const fmt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const parts: string[] = [];
  if (employee.startDate) parts.push(`vào ${fmt(employee.startDate)}`);
  if (employee.endDate) parts.push(`thôi làm ${fmt(employee.endDate)}`);
  return parts.join(" · ");
}

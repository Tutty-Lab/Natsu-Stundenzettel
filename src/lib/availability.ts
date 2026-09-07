// ============================================================================
// Feste Arbeitstage einer Person (availableWeekdays). Neben den Azubi-Schultagen
// die einzige Wochentag-Einschränkung; steht hier an EINER Stelle.
// ============================================================================

import type { Employee } from "../types";
import { parseIsoDate, weekdayKeyOf } from "./demand";

/**
 * Arbeitet diese Person an diesem Wochentag überhaupt? Leere/fehlende Liste =
 * keine Einschränkung.
 */
export function worksOnWeekday(employee: Employee, isoDate: string): boolean {
  const tage = employee.availableWeekdays;
  if (!tage || tage.length === 0) return true;
  return tage.includes(weekdayKeyOf(parseIsoDate(isoDate)));
}

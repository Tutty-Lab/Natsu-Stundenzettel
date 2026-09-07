// ============================================================================
// Deterministischer, greedy Scheduler (kein Solver, kein KI-Modell).
//
// Vorgehen:
//  1. Alle Tage des Monats + Nachfrage-Gewichte -> rohes Tages-Soll (Minuten).
//  2. Sollstunden jedes Mitarbeiters in Schicht-Token zerlegen.
//  3. Token rundenweise (rotierend) verteilen; große Vollzeit-Schichten zuerst.
//  4. Für jedes Token die beste Kalender-Datum wählen (Score + harte Regeln).
//  5. Früh/Spät anhand der gewünschten Spätschicht-Quote wählen.
//  6. Reparaturlauf: Schichten zwischen Tagen verschieben, um die Tages-
//     nachfrage besser zu treffen (Sollstunden bleiben exakt erhalten).
//
// Harte Regeln, die IMMER eingehalten werden:
//  - genau ein Dienst pro Mitarbeiter und Tag
//  - höchstens 6 aufeinanderfolgende Arbeitstage
//  - Token-Dauer wird nie verändert  => monatliches Soll bleibt exakt
// ============================================================================

import { AZUBI_WORKDAYS_IN_TERM, type Employee, type Shift } from "../types";
import {
  azubiConfigOf,
  azubiWeeklyCap,
  azubiWeeklyHours,
  azubiWeeklyLimit,
} from "./azubi";
import {
  DAY_WEIGHTS,
  LATE_SHIFT_RATIOS,
  datesOfMonth,
  parseIsoDate,
  weekdayKeyOf,
  type WeekdayKey,
} from "./demand";
import { getShiftTemplate, type TemplateType } from "./shifts";
import { preferredPartTimeShiftCount } from "./splitTargetHours";
import { consecutiveRunLengthWith, seededRandom } from "./consecutive";
import { worksOnWeekday } from "./availability";
import { presenceFromPaid } from "./time";
import {
  effectiveWeekdayKey,
  resolveDay,
  type ResolvedDay,
  type OverrideMap,
  type WorkHoursConfig,
} from "./workHours";
import { nrwHolidays } from "./holidays";

export type GenerateInput = {
  year: number;
  month: number; // 1-basiert
  /** Arbeitszeit-Fenster je Wochentag + Feiertag. */
  workHours: WorkHoursConfig;
  /** Ausnahmen für einzelne Daten (geschlossen / abweichende Zeiten). */
  overrides?: OverrideMap;
  employees: Employee[];
  /** Feiertage als ISO-Set; Standard: NRW-Feiertage des Jahres. */
  holidays?: Set<string>;
  /** Optionaler Seed; sonst aus Eingabedaten abgeleitet. */
  seed?: string;
};

type DateState = {
  totalPaid: number;
  latePaid: number;
  count: number;
};

type SchedulerState = {
  dates: string[];
  rawTarget: Map<string, number>; // ISO -> rohes Tages-Soll in Minuten
  dateState: Map<string, DateState>;
  worked: Map<string, Set<string>>; // employeeId -> Set<ISO>
  weekendCount: Map<string, number>; // employeeId -> Anzahl Fr/Sa-Schichten
  weekMinutes: Map<string, Map<string, number>>;
  shiftCounts: Map<string, number>;
  targetShiftCounts: Map<string, number>;
  remaining: Map<string, number>; // employeeId -> noch zu verplanende Minuten
  shifts: Shift[];
  /** Für Nachfrage/Spätquote maßgeblicher Wochentag (Feiertag = Sonntag). */
  effKeyOf: (isoDate: string) => WeekdayKey;
  /** Aufgelöster Tag (geschlossen? + Arbeitszeit-Fenster) für ein Datum. */
  dayOf: (isoDate: string) => ResolvedDay;
  rng: () => number;
};

/** Länge des Zeitfensters in Minuten (0 wenn geschlossen). */
function windowLength(day: ResolvedDay): number {
  return day.closed ? 0 : day.window.endMinutes - day.window.startMinutes;
}

let shiftIdCounter = 0;
function nextShiftId(): string {
  shiftIdCounter += 1;
  return `gen-${shiftIdCounter}`;
}

function isWeekend(isoDate: string): boolean {
  const key = weekdayKeyOf(parseIsoDate(isoDate));
  return key === "friday" || key === "saturday";
}

function weekKeyOf(isoDate: string): string {
  const date = parseIsoDate(isoDate);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function weeklyCapMinutes(employee: Employee): number | null {
  if (employee.employmentType !== "AZUBI") return null;
  return Math.round(azubiWeeklyCap(employee.azubi) * 60);
}

function weeklyWorkdayCap(employee: Employee): number | null {
  const azubiCap =
    employee.employmentType === "AZUBI" && azubiConfigOf(employee.azubi).inSchoolTerm
      ? AZUBI_WORKDAYS_IN_TERM
      : null;
  // Vom Nutzer gesetzte Wochentage-Obergrenze; das kleinere Limit gewinnt.
  const userCap = employee.maxDaysPerWeek ?? null;
  if (azubiCap === null) return userCap;
  if (userCap === null) return azubiCap;
  return Math.min(azubiCap, userCap);
}

function workedDaysInWeek(worked: Set<string>, weekKey: string): number {
  let count = 0;
  for (const date of worked) {
    if (weekKeyOf(date) === weekKey) count += 1;
  }
  return count;
}

function isSchoolDay(employee: Employee, isoDate: string): boolean {
  if (employee.employmentType !== "AZUBI") return false;
  const config = azubiConfigOf(employee.azubi);
  return (
    config.inSchoolTerm &&
    config.schoolDays.includes(weekdayKeyOf(parseIsoDate(isoDate)))
  );
}

/** Maximum number of valid workdays in a month under the six-day rule. */
function maxWorkdaysInMonth(
  dates: string[],
  dayOf: (isoDate: string) => ResolvedDay,
): number {
  let run = 0;
  let count = 0;
  for (const isoDate of dates) {
    if (dayOf(isoDate).closed) {
      run = 0;
      continue;
    }
    if (run >= 6) {
      run = 0;
      continue;
    }
    run += 1;
    count += 1;
  }
  return count;
}

const SHIFT_HOURS_DESC = [8, 7, 6, 5, 4] as const;
const SHIFT_HOURS_ASC = [4, 5, 6, 7, 8] as const;

/** Größte Schichtlänge (Stunden), deren Anwesenheit noch ins Fenster passt (0 = keine). */
export function maxShiftHoursForWindow(windowMinutes: number): number {
  for (const hours of SHIFT_HOURS_DESC) {
    if (presenceFromPaid(hours * 60) <= windowMinutes) return hours;
  }
  return 0;
}

/**
 * Wählt die Länge (Stunden) der nächsten Schicht eines Mitarbeiters so, dass
 * - sie 4..8 h ist und ins Tagesfenster passt (<= maxHours),
 * - der verbleibende Rest exakt aufteilbar bleibt (0 oder >= 4 h),
 * - Vollzeit möglichst lange, Teilzeit eher kürzere Schichten bekommt.
 * Gibt 0 zurück, wenn an diesem Tag keine gültige Länge möglich ist.
 *
 * Dadurch arbeiten auch Vollzeit-Kräfte an einem „halben Tag" – nur mit einer
 * kürzeren Schicht – und das Monats-Soll bleibt trotzdem exakt.
 */
export function chooseShiftHours(
  remainingMinutes: number,
  maxHours: number,
  employmentType: Employee["employmentType"],
  rng?: () => number,
  shiftsLeft?: number,
): number {
  const remainingHours = remainingMinutes / 60;
  const cap = Math.min(8, maxHours, remainingHours);
  if (cap < 4) return 0;

  // Teilzeit with a target count is solved as an exact bounded composition.
  // This keeps 40h at ten 4h visits while still allowing seeded variation for
  // larger monthly targets.
  if (
    employmentType === "TEILZEIT" &&
    rng &&
    shiftsLeft !== undefined &&
    shiftsLeft > 0 &&
    Number.isInteger(remainingHours)
  ) {
    const candidates = SHIFT_HOURS_ASC.filter(
      (hours) =>
        hours <= cap &&
        remainingHours - hours >= 4 * (shiftsLeft - 1) &&
        remainingHours - hours <= 8 * (shiftsLeft - 1),
    );
    if (candidates.length > 0) {
      // Favor the short end, but keep enough entropy that two seeds do not
      // produce identical 5h-only plans.
      const shortCandidates = candidates.filter((hours) => hours <= candidates[0] + 2);
      return shortCandidates[Math.floor(rng() * shortCandidates.length)];
    }
  }

  // Präferenz-Reihenfolge: Vollzeit lange Schichten, Teilzeit mittlere/kurze.
  const preference =
    employmentType === "VOLLZEIT"
      ? [8, 7, 6, 5, 4]
      : employmentType === "AZUBI"
        ? [8, 7.5, 7, 6.5, 6, 5.5, 5, 4.5, 4]
        : [5, 6, 4, 7, 8];

  for (const hours of preference) {
    if (hours > cap) continue;
    const rest = remainingHours - hours;
    // Rest muss exakt in 4..8-h-Schichten aufteilbar bleiben (0 oder >= 4).
    if (Math.abs(rest) < 1e-9 || rest >= 4) return hours;
  }
  return 0;
}

/** Stabile Basisordnung: Vollzeit zuerst, dann nach Id. */
function orderedEmployees(employees: Employee[]): Employee[] {
  const rank: Record<Employee["employmentType"], number> = {
    VOLLZEIT: 0,
    AZUBI: 1,
    TEILZEIT: 2,
  };
  return [...employees].sort((a, b) => {
    if (a.employmentType !== b.employmentType) {
      return rank[a.employmentType] - rank[b.employmentType];
    }
    return a.id.localeCompare(b.id);
  });
}

function chooseTemplateType(
  state: SchedulerState,
  isoDate: string,
  employee: Employee,
  paidMinutes: number,
): TemplateType {
  const day = state.dayOf(isoDate);
  const presence = presenceFromPaid(paidMinutes);
  const transitionStart = 15 * 60 + 30;
  const canBridgeTransition =
    employee.employmentType === "TEILZEIT" &&
    paidMinutes <= 6 * 60 &&
    day.window.startMinutes <= transitionStart &&
    transitionStart + presence <= day.window.endMinutes;
  const currentMidCount = state.shifts.filter(
    (shift) => shift.employeeId === employee.id && shift.shiftType === "MID",
  ).length;
  const dateHasMid = state.shifts.some(
    (shift) => shift.date === isoDate && shift.shiftType === "MID",
  );

  // Every part-time employee receives at least two transition visits. Further
  // short visits may also land here based on the deterministic seed.
  if (
    canBridgeTransition &&
    !dateHasMid &&
    (currentMidCount < 2 || state.rng() < 0.2)
  ) {
    return "MID";
  }

  const ds = state.dateState.get(isoDate)!;
  const effKey = state.effKeyOf(isoDate);
  const desired = LATE_SHIFT_RATIOS[effKey];
  const currentLateRatio = ds.totalPaid > 0 ? ds.latePaid / ds.totalPaid : 0;

  // Teilzeit tendenziell in Spätschichten; Sonntag/Feiertag stark abends.
  let threshold = desired;
  if (employee.employmentType === "TEILZEIT") threshold += 0.15;
  if (effKey === "sunday") threshold = Math.max(threshold, 0.95);

  return currentLateRatio < threshold ? "LATE" : "EARLY";
}

function makeShift(
  state: SchedulerState,
  employee: Employee,
  isoDate: string,
  paidMinutes: number,
  forcedType?: TemplateType,
): Shift {
  const type = forcedType ?? chooseTemplateType(state, isoDate, employee, paidMinutes);
  const win = state.dayOf(isoDate).window;
  const tpl = getShiftTemplate(paidMinutes / 60, type, win.startMinutes, win.endMinutes);
  return {
    id: nextShiftId(),
    employeeId: employee.id,
    date: isoDate,
    startMinutes: tpl.startMinutes,
    endMinutes: tpl.endMinutes,
    pauseMinutes: tpl.pauseMinutes,
    paidMinutes: tpl.paidMinutes,
    shiftType: tpl.type,
    generated: true,
  };
}

function applyShift(state: SchedulerState, shift: Shift): void {
  const ds = state.dateState.get(shift.date)!;
  ds.totalPaid += shift.paidMinutes;
  if (shift.shiftType === "LATE") ds.latePaid += shift.paidMinutes;
  else if (shift.shiftType === "MID") ds.latePaid += shift.paidMinutes / 2;
  ds.count += 1;
  state.worked.get(shift.employeeId)!.add(shift.date);
  state.shiftCounts.set(
    shift.employeeId,
    (state.shiftCounts.get(shift.employeeId) ?? 0) + 1,
  );
  const weekMinutes = state.weekMinutes.get(shift.employeeId)!;
  const weekKey = weekKeyOf(shift.date);
  weekMinutes.set(weekKey, (weekMinutes.get(weekKey) ?? 0) + shift.paidMinutes);
  if (isWeekend(shift.date)) {
    state.weekendCount.set(
      shift.employeeId,
      (state.weekendCount.get(shift.employeeId) ?? 0) + 1,
    );
  }
  state.shifts.push(shift);
}

/**
 * Platziert genau eine Schicht für einen Mitarbeiter: bestes Datum wählen,
 * Schichtlänge an das Tagesfenster anpassen. Gibt true zurück, wenn platziert.
 */
function placeOneShift(state: SchedulerState, employee: Employee): boolean {
  const remaining = state.remaining.get(employee.id)!;
  if (remaining <= 0) return false;

  const worked = state.worked.get(employee.id)!;
  const weekendCount = state.weekendCount.get(employee.id) ?? 0;
  const targetShiftCount = state.targetShiftCounts.get(employee.id);
  const completedShiftCount = state.shiftCounts.get(employee.id) ?? 0;
  const shiftsLeft =
    targetShiftCount === undefined ? undefined : targetShiftCount - completedShiftCount;
  const currentMidCount = state.shifts.filter(
    (shift) => shift.employeeId === employee.id && shift.shiftType === "MID",
  ).length;
  const needsTransitionVisit = employee.employmentType === "TEILZEIT" && currentMidCount < 2;

  let bestDate: string | null = null;
  let bestHours = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestTransitionDate: string | null = null;
  let bestTransitionHours = 0;
  let bestTransitionScore = Number.NEGATIVE_INFINITY;

  for (const isoDate of state.dates) {
    if (worked.has(isoDate)) continue; // max. ein Dienst pro Tag
    if (isSchoolDay(employee, isoDate)) continue;
    if (!worksOnWeekday(employee, isoDate)) continue; // fester freier Wochentag
    const day = state.dayOf(isoDate);
    if (day.closed) continue; // Betriebsruhe -> kein Dienst

    const weekKey = weekKeyOf(isoDate);
    const workdayCap = weeklyWorkdayCap(employee);
    if (workdayCap !== null && workedDaysInWeek(worked, weekKey) >= workdayCap) {
      continue;
    }

    const weekCap = weeklyCapMinutes(employee);
    const usedThisWeek = state.weekMinutes.get(employee.id)!.get(weekKey) ?? 0;
    const availableMinutes =
      weekCap === null ? remaining : Math.min(remaining, weekCap - usedThisWeek);
    if (availableMinutes <= 0) continue;

    // Längste Schicht, die ins Fenster passt UND den Rest exakt aufteilbar lässt.
    const maxHours = Math.min(
      maxShiftHoursForWindow(windowLength(day)),
      availableMinutes / 60,
    );
    const hours = chooseShiftHours(
      remaining,
      maxHours,
      employee.employmentType,
      employee.employmentType === "TEILZEIT" ? state.rng : undefined,
      shiftsLeft,
    );
    if (hours === 0) continue; // hier passt keine gültige Schicht

    const runLength = consecutiveRunLengthWith(worked, isoDate);
    if (runLength > 6) continue; // harte Regel

    const ds = state.dateState.get(isoDate)!;
    const deficitHours = (state.rawTarget.get(isoDate)! - ds.totalPaid) / 60;
    const dayWeight = DAY_WEIGHTS[state.effKeyOf(isoDate)];

    const consecutivePenalty = runLength >= 5 ? (runLength - 4) * 8 : 0;
    const weekendPenalty = isWeekend(isoDate) ? weekendCount * 1.5 : 0;

    const jitter = state.rng() * 0.01; // deterministisch (seeded), nur Tie-Break

    const score =
      deficitHours * 10 +
      dayWeight * 3 -
      consecutivePenalty -
      weekendPenalty +
      jitter;

    const transitionStart = 15 * 60 + 30;
    const canBridgeTransition =
      employee.employmentType === "TEILZEIT" &&
      hours <= 6 &&
      day.window.startMinutes <= transitionStart &&
      transitionStart + presenceFromPaid(hours * 60) <= day.window.endMinutes;
    const hasMidOnDate = state.shifts.some(
      (shift) => shift.date === isoDate && shift.shiftType === "MID",
    );
    if (needsTransitionVisit && canBridgeTransition && !hasMidOnDate && score > bestTransitionScore) {
      bestTransitionScore = score;
      bestTransitionDate = isoDate;
      bestTransitionHours = hours;
    }

    if (score > bestScore) {
      bestScore = score;
      bestDate = isoDate;
      bestHours = hours;
    }
  }

  // A schedule must never use a seventh consecutive day as a fallback.
  const targetDate = bestTransitionDate ?? bestDate;
  const targetHours = bestTransitionDate ? bestTransitionHours : bestHours;
  if (targetDate === null || targetHours === 0) return false;

  const shift = makeShift(state, employee, targetDate, targetHours * 60);
  applyShift(state, shift);
  state.remaining.set(employee.id, remaining - shift.paidMinutes);
  return true;
}

/** Kosten eines Tages = |zugewiesene - rohe Soll-Minuten|. */
function dateCost(state: SchedulerState, isoDate: string): number {
  return Math.abs(
    state.dateState.get(isoDate)!.totalPaid - state.rawTarget.get(isoDate)!,
  );
}

function removeShift(state: SchedulerState, shift: Shift): void {
  const ds = state.dateState.get(shift.date)!;
  ds.totalPaid -= shift.paidMinutes;
  if (shift.shiftType === "LATE") ds.latePaid -= shift.paidMinutes;
  else if (shift.shiftType === "MID") ds.latePaid -= shift.paidMinutes / 2;
  ds.count -= 1;
  state.worked.get(shift.employeeId)!.delete(shift.date);
  state.shiftCounts.set(
    shift.employeeId,
    Math.max(0, (state.shiftCounts.get(shift.employeeId) ?? 0) - 1),
  );
  const weekMinutes = state.weekMinutes.get(shift.employeeId)!;
  const weekKey = weekKeyOf(shift.date);
  weekMinutes.set(weekKey, (weekMinutes.get(weekKey) ?? 0) - shift.paidMinutes);
  if (isWeekend(shift.date)) {
    state.weekendCount.set(
      shift.employeeId,
      (state.weekendCount.get(shift.employeeId) ?? 0) - 1,
    );
  }
  const idx = state.shifts.indexOf(shift);
  if (idx >= 0) state.shifts.splice(idx, 1);
}

/**
 * Reparaturlauf: verschiebt einzelne Schichten auf andere Tage, wenn dadurch
 * die Tagesnachfrage besser getroffen wird. Ändert nie die Dauer eines Tokens
 * und verletzt nie die harten Regeln => Sollstunden bleiben exakt erhalten.
 */
function repairDemand(state: SchedulerState, employeesById: Map<string, Employee>): void {
  const MAX_PASSES = 6;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let improved = false;
    // Kopie, da wir state.shifts während der Iteration verändern.
    for (const shift of [...state.shifts]) {
      const employee = employeesById.get(shift.employeeId)!;
      const from = shift.date;
      const worked = state.worked.get(employee.id)!;

      let bestTarget: string | null = null;
      let bestDelta = -1e-6; // nur echte Verbesserungen

      const oldCostFrom = dateCost(state, from);

      const presence = presenceFromPaid(shift.paidMinutes);
      for (const to of state.dates) {
        if (to === from || worked.has(to)) continue;
        if (
          shift.shiftType === "MID" &&
          state.shifts.some(
            (candidate) =>
              candidate !== shift && candidate.date === to && candidate.shiftType === "MID",
          )
        ) {
          continue;
        }
        const day = state.dayOf(to);
        if (day.closed || windowLength(day) < presence) continue; // geschlossen / passt nicht
        if (isSchoolDay(employee, to)) continue;
        if (!worksOnWeekday(employee, to)) continue; // fester freier Wochentag
        // 6-Tage-Regel prüfen, als ob "from" bereits entfernt wäre.
        const trial = new Set(worked);
        trial.delete(from);
        const workdayCap = weeklyWorkdayCap(employee);
        if (
          workdayCap !== null &&
          workedDaysInWeek(trial, weekKeyOf(to)) >= workdayCap
        ) {
          continue;
        }
        const weekCap = weeklyCapMinutes(employee);
        if (weekCap !== null) {
          const weekMinutes = state.weekMinutes.get(employee.id)!;
          const fromWeek = weekKeyOf(from);
          const toWeek = weekKeyOf(to);
          const usedAfterMove =
            (weekMinutes.get(toWeek) ?? 0) +
            shift.paidMinutes -
            (fromWeek === toWeek ? shift.paidMinutes : 0);
          if (usedAfterMove > weekCap) continue;
        }
        if (consecutiveRunLengthWith(trial, to) > 6) continue;

        const oldCostTo = dateCost(state, to);
        const newCostFrom = Math.abs(
          state.dateState.get(from)!.totalPaid - shift.paidMinutes - state.rawTarget.get(from)!,
        );
        const newCostTo = Math.abs(
          state.dateState.get(to)!.totalPaid + shift.paidMinutes - state.rawTarget.get(to)!,
        );
        const delta = newCostFrom + newCostTo - (oldCostFrom + oldCostTo);
        if (delta < bestDelta) {
          bestDelta = delta;
          bestTarget = to;
        }
      }

      if (bestTarget) {
        removeShift(state, shift);
        applyShift(
          state,
          makeShift(
            state,
            employee,
            bestTarget,
            shift.paidMinutes,
            shift.shiftType === "MID" ? "MID" : undefined,
          ),
        );
        improved = true;
      }
    }
    if (!improved) break;
  }
}

/**
 * Hauptfunktion: erzeugt die Schichten für den Monat.
 * Gibt eine neue Liste generierter Shifts zurück (verändert keine Eingaben).
 */
export function generateSchedule(input: GenerateInput): Shift[] {
  shiftIdCounter = 0;
  const { year, month, workHours, employees } = input;
  const holidays = input.holidays ?? nrwHolidays(year);
  const overrides = input.overrides ?? {};

  const invalidSchoolDays = employees.filter((employee) => {
    if (employee.employmentType !== "AZUBI") return false;
    const config = azubiConfigOf(employee.azubi);
    return config.inSchoolTerm && config.schoolDays.length !== 2;
  });
  if (invalidSchoolDays.length > 0) {
    throw new Error(
      `Azubi trong kỳ học phải chọn đúng 2 ngày đi học: ${invalidSchoolDays
        .map((employee) => employee.name)
        .join(", ")}.`,
    );
  }

  const invalidWeeklyHours = employees.filter(
    (employee) =>
      employee.employmentType === "AZUBI" &&
      azubiWeeklyHours(employee.azubi) > azubiWeeklyLimit(employee.azubi),
  );
  if (invalidWeeklyHours.length > 0) {
    throw new Error(
      `Giờ Azubi vượt giới hạn: ${invalidWeeklyHours
        .map(
          (employee) =>
            `${employee.name} (${azubiWeeklyHours(employee.azubi)}h, tối đa ${azubiWeeklyLimit(employee.azubi)}h/tuần)`,
        )
        .join(", ")}.`,
    );
  }

  const effKeyOf = (isoDate: string): WeekdayKey => effectiveWeekdayKey(isoDate, holidays);
  const dayOf = (isoDate: string): ResolvedDay => resolveDay(workHours, isoDate, holidays, overrides);
  // Nachfrage-Gewicht: geschlossene Tage tragen 0 (bekommen keine Stunden).
  const weightOf = (isoDate: string): number =>
    dayOf(isoDate).closed ? 0 : DAY_WEIGHTS[effKeyOf(isoDate)];

  const dates = datesOfMonth(year, month);
  const totalTargetMin = employees.reduce((sum, e) => sum + e.targetMinutes, 0);
  const totalWeight = dates.reduce((sum, d) => sum + weightOf(d), 0);

  const rawTarget = new Map<string, number>();
  for (const d of dates) {
    rawTarget.set(d, totalWeight > 0 ? (totalTargetMin * weightOf(d)) / totalWeight : 0);
  }

  const dateState = new Map<string, DateState>();
  const worked = new Map<string, Set<string>>();
  const weekendCount = new Map<string, number>();
  const weekMinutes = new Map<string, Map<string, number>>();
  const shiftCounts = new Map<string, number>();
  const targetShiftCounts = new Map<string, number>();
  const remaining = new Map<string, number>();
  for (const d of dates) dateState.set(d, { totalPaid: 0, latePaid: 0, count: 0 });
  for (const e of employees) {
    worked.set(e.id, new Set());
    weekendCount.set(e.id, 0);
    weekMinutes.set(e.id, new Map());
    shiftCounts.set(e.id, 0);
    if (e.employmentType === "TEILZEIT" && e.targetMinutes % 60 === 0) {
      const targetHours = e.targetMinutes / 60;
      if (targetHours >= 4) {
        const minimumCount = Math.ceil(targetHours / 8);
        const preferredCount = preferredPartTimeShiftCount(targetHours);
        targetShiftCounts.set(
          e.id,
          Math.min(
            maxWorkdaysInMonth(dates, dayOf),
            Math.max(minimumCount, preferredCount),
          ),
        );
      }
    }
    remaining.set(e.id, e.targetMinutes);
  }

  const seed =
    input.seed ??
    `${year}-${month}-${employees.map((e) => `${e.id}:${e.targetMinutes}`).join("|")}`;

  const state: SchedulerState = {
    dates,
    rawTarget,
    dateState,
    worked,
    weekendCount,
    weekMinutes,
    shiftCounts,
    targetShiftCounts,
    remaining,
    shifts: [],
    effKeyOf,
    dayOf,
    rng: seededRandom(seed),
  };

  const employeesById = new Map(employees.map((e) => [e.id, e] as const));

  // Rundenweise, rotierend platzieren: pro Runde eine Schicht je Mitarbeiter,
  // bis jedes Monats-Soll exakt erreicht ist. Die Schichtlänge passt sich dem
  // jeweiligen Tagesfenster an (z.B. kürzere Schicht an einem halben Tag).
  const ordered = orderedEmployees(employees);
  const n = ordered.length;
  for (let round = 0; ; round++) {
    if (ordered.every((e) => state.remaining.get(e.id)! <= 0)) break;
    let progress = false;
    for (let i = 0; i < n; i++) {
      const emp = ordered[(i + round) % n];
      if (state.remaining.get(emp.id)! <= 0) continue;
      if (placeOneShift(state, emp)) progress = true;
    }
    if (!progress) break; // keine Platzierung mehr möglich
  }

  const unmet = employees.filter((e) => state.remaining.get(e.id)! > 0);
  if (unmet.length > 0) {
    throw new Error(
      `Không đủ ngày mở cửa / giờ làm để đạt định mức cho: ` +
        `${unmet.map((e) => `${e.name} (thiếu ${state.remaining.get(e.id)! / 60}h)`).join(", ")}. ` +
        `Hãy tăng khung giờ làm hoặc giảm số ngày đóng cửa.`,
    );
  }

  repairDemand(state, employeesById);

  // Stabil sortieren: nach Datum, dann Startzeit, dann Mitarbeiter.
  state.shifts.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.startMinutes - b.startMinutes ||
      a.employeeId.localeCompare(b.employeeId),
  );
  return state.shifts;
}

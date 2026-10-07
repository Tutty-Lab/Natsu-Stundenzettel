// ============================================================================
// Zentrales State-Management (ohne externe Bibliothek). Kapselt Schedule,
// LocalStorage-Persistenz und alle Aktionen (Generieren, Bearbeiten, Reset).
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Employee, Schedule, Shift } from "../types";
import { effectiveTargets, generateSchedule } from "../lib/scheduler";
import { validateSchedule, type ValidationResult } from "../lib/validation";
import { clearState, loadState, saveState, type PersistedState } from "../lib/storage";
import { MIN_PASSWORD_LENGTH, hashPassword, passwordMatches } from "../lib/auth";
import { isRemoteConfigured, loadRemote, saveRemote, type RemoteStatus } from "../lib/remote";
import { createManualShift, updateShiftTimes } from "../lib/shiftOps";
import {
  DEFAULT_WORK_HOURS,
  normalizeWorkHours,
  type DateOverride,
  type OverrideMap,
} from "../lib/workHours";
import { storeById, type StoreConfig } from "../lib/stores";
import { listSavedMonths, mergeArchives, switchMonth } from "../lib/monthArchive";
import { coverageGaps, normalizeStaffing } from "../lib/coverage";
import { datesOfMonth } from "../lib/demand";
import { nrwHolidays } from "../lib/holidays";
import { minutesToTime } from "../lib/time";
import { resolveDay } from "../lib/workHours";
import { defaultAzubiConfig, withAutomaticAzubiTarget } from "../lib/azubi";

function emptySchedule(store: StoreConfig): Schedule {
  const now = new Date();
  return {
    companyName: store.name,
    address: store.address,
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    workHours: structuredClone(DEFAULT_WORK_HOURS),
    dateOverrides: [],
    employees: [],
    shifts: [],
    staffing: normalizeStaffing(undefined, store.id),
  };
}

/** Ausnahmen-Array -> nach Datum indizierte Map (für den Scheduler). */
function overridesToMap(list: DateOverride[]): OverrideMap {
  const map: OverrideMap = {};
  for (const ov of list) map[ov.date] = ov;
  return map;
}

/** Migriert einen (evtl. alten) gespeicherten Stand auf das aktuelle Schema. */
function normalizeSchedule(raw: Schedule | undefined, store: StoreConfig): Schedule {
  const base = emptySchedule(store);
  if (!raw) return base;
  const employees = (raw.employees ?? []).map(withAutomaticAzubiTarget);
  return {
    // Firmenname & Adresse sind fest (không cho sửa) – immer erzwingen.
    companyName: store.name,
    address: store.address,
    year: raw.year ?? base.year,
    month: raw.month ?? base.month,
    workHours: normalizeWorkHours(raw.workHours),
    dateOverrides: Array.isArray(raw.dateOverrides) ? raw.dateOverrides : [],
    employees,
    shifts: raw.shifts ?? [],
    archive: raw.archive && typeof raw.archive === "object" ? raw.archive : {},
    staffing: normalizeStaffing(raw.staffing, store.id),
  };
}

function newEmployeeId(): string {
  return `emp-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/**
 * State EINER Filiale. Die App hält beide Filialen gleichzeitig (NATSU und
 * nava), damit „Tạo lịch" beide auf einmal erzeugt und der Umschalter ohne
 * Neuladen wechselt. storeId ändert sich für eine Instanz nie.
 */
export function useSchedule(storeId: string) {
  const storeConfig = storeById(storeId);

  const [schedule, setSchedule] = useState<Schedule>(() => {
    const persisted = loadState(storeId);
    return normalizeSchedule(persisted?.schedule, storeById(storeId));
  });
  const [passwordHash, setPasswordHash] = useState<string | undefined>(
    () => loadState(storeId)?.passwordHash,
  );
  const [originalShifts, setOriginalShifts] = useState<Shift[]>(() => {
    const persisted = loadState(storeId);
    return persisted?.originalShifts ?? [];
  });
  const [genError, setGenError] = useState<string | null>(null);
  const [remoteStatus, setRemoteStatus] = useState<RemoteStatus>(
    isRemoteConfigured ? "idle" : "off",
  );

  // Nach „Xoá dữ liệu" darf das Zusammenführen die alten Monate nicht zurückholen.
  const skipArchiveMerge = useRef(false);

  // Save immediately to localStorage so the app remains usable offline.
  // Vorher gespeicherte Monate aus dem LocalStorage übernehmen (anderer Tab),
  // damit ein veralteter Tab nie einen gespeicherten Monat löscht.
  useEffect(() => {
    const merged = mergeArchives(schedule, loadState(storeId)?.schedule);
    if (merged !== schedule) {
      setSchedule(merged); // speichert im nächsten Durchlauf
      return;
    }
    saveState(storeId, { schedule, originalShifts, passwordHash });
  }, [storeId, schedule, originalShifts]);

  const latest = useRef<PersistedState>({ schedule, originalShifts, passwordHash });
  useEffect(() => {
    latest.current = { schedule, originalShifts, passwordHash };
  }, [schedule, originalShifts, passwordHash]);

  // Hydrate from Supabase before remote writes are allowed. If no cloud row
  // exists yet, upload the current local state as the initial store dataset.
  const hydrated = useRef(!isRemoteConfigured);
  useEffect(() => {
    if (!isRemoteConfigured) return;

    hydrated.current = false;
    let cancelled = false;

    void (async () => {
      try {
        const remote = await loadRemote(storeId);
        if (cancelled) return;

        if (remote?.schedule) {
          setSchedule(normalizeSchedule(remote.schedule, storeById(storeId)));
          setOriginalShifts(remote.originalShifts ?? []);
          setPasswordHash(remote.passwordHash);
        } else {
          await saveRemote(storeId, latest.current);
        }

        if (!cancelled) setRemoteStatus("idle");
        // NUR nach erfolgreichem Lesen darf hochgeladen werden.
        if (!cancelled) hydrated.current = true;
      } catch {
        // Lesen fehlgeschlagen: hydrated bleibt false, es wird NICHTS
        // hochgeladen. Sonst überschreibt der leere lokale Stand die Daten in
        // der Datenbank – genau so ist eine Filiale schon einmal leer geräumt
        // worden: Netzfehler beim Start, danach ein Klick, und weg war alles.
        if (!cancelled) setRemoteStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [storeId]);

  // Debounce cloud writes so editing an input does not send one request per keypress.
  useEffect(() => {
    if (!isRemoteConfigured || !hydrated.current) return;

    const timer = window.setTimeout(() => {
      setRemoteStatus("saving");
      (async () => {
        // Gespeicherte Monate anderer Geräte behalten (Archiv zusammenführen).
        const skip = skipArchiveMerge.current;
        skipArchiveMerge.current = false;
        const remote = skip ? null : await loadRemote(storeId).catch(() => null);
        const merged = mergeArchives(schedule, remote?.schedule);
        await saveRemote(storeId, { schedule: merged, originalShifts, passwordHash });
        if (merged !== schedule) setSchedule((cur) => mergeArchives(cur, remote?.schedule));
      })()
        .then(() => setRemoteStatus("idle"))
        .catch(() => setRemoteStatus("error"));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [storeId, schedule, originalShifts]);

  // Geprüft wird gegen das Soll, das auch der Planer ansetzt: bei „Mẫu tuần"
  // mit Wochenvertrag folgt es den Wochen des Monats (siehe effectiveTargets).
  const validation: ValidationResult = useMemo(() => {
    const soll = effectiveTargets({
      year: schedule.year,
      month: schedule.month,
      workHours: schedule.workHours,
      overrides: overridesToMap(schedule.dateOverrides),
      employees: schedule.employees,
    });
    const employees = schedule.employees.map((e) => ({ ...e, targetMinutes: soll.get(e.id) ?? e.targetMinutes }));
    const result = validateSchedule(employees, schedule.shifts);
    if (schedule.shifts.length === 0) return result;
    // Harte Regel Độ phủ: zu jeder Öffnungszeit genug Leute im Laden.
    const holidays = nrwHolidays(schedule.year);
    const overrides = overridesToMap(schedule.dateOverrides);
    const gaps = coverageGaps(
      schedule.shifts,
      datesOfMonth(schedule.year, schedule.month),
      (d) => resolveDay(schedule.workHours, d, holidays, overrides),
      normalizeStaffing(schedule.staffing, storeId),
    );
    if (gaps.length === 0) return result;
    const errors = [
      ...result.errors,
      ...gaps.map((g) => ({
        date: g.date,
        message: `Thiếu người ngày ${g.date.slice(8, 10)}.${g.date.slice(5, 7)} ${minutesToTime(g.startMinutes)}–${minutesToTime(g.endMinutes)}: có ${g.have}, cần ${g.need}.`,
      })),
    ];
    return { ...result, valid: false, errors };
  }, [schedule.year, schedule.month, schedule.workHours, schedule.dateOverrides, schedule.employees, schedule.shifts, schedule.staffing, storeId]);

  // ----- Firma / Monat / Öffnungszeiten -----
  const updateMeta = useCallback((patch: Partial<Schedule>) => {
    const { schedule: s, originalShifts: original } = latest.current;
    const nextYear = patch.year ?? s.year;
    const nextMonth = patch.month ?? s.month;
    if (nextYear === s.year && nextMonth === s.month) {
      setSchedule((cur) => ({ ...cur, ...patch }));
      return;
    }
    // Monatswechsel: aktuellen Plan ablegen, gespeicherten Plan des Zielmonats laden.
    const next = switchMonth(s, original, nextYear, nextMonth);
    const schedulePatched = { ...next.schedule, ...patch };
    latest.current = { ...latest.current, schedule: schedulePatched, originalShifts: next.originalShifts };
    setSchedule(schedulePatched);
    setOriginalShifts(next.originalShifts);
    setGenError(null);
  }, []);

  /** Alle Monate mit gespeichertem Plan (inkl. des aktuell geöffneten). */
  const savedMonths = useMemo(() => listSavedMonths(schedule), [schedule]);

  // ----- Mitarbeiter -----
  const addEmployee = useCallback((data: Omit<Employee, "id">): string => {
    const id = newEmployeeId();
    const emp = withAutomaticAzubiTarget({
      ...data,
      id,
      azubi:
        data.employmentType === "AZUBI" ? data.azubi ?? defaultAzubiConfig() : undefined,
    });
    setSchedule((s) => ({ ...s, employees: [...s.employees, emp] }));
    return id;
  }, []);

  const updateEmployee = useCallback((id: string, patch: Partial<Employee>) => {
    setSchedule((s) => ({
      ...s,
      employees: s.employees.map((e) =>
        e.id === id ? withAutomaticAzubiTarget({ ...e, ...patch }) : e,
      ),
    }));
  }, []);

  const removeEmployee = useCallback((id: string) => {
    setSchedule((s) => ({
      ...s,
      employees: s.employees.filter((e) => e.id !== id),
      shifts: s.shifts.filter((sh) => sh.employeeId !== id),
    }));
  }, []);

  // ----- Generierung -----
  const generate = useCallback(() => {
    setGenError(null);
    try {
      const shifts = generateSchedule({
        year: schedule.year,
        month: schedule.month,
        workHours: schedule.workHours,
        overrides: overridesToMap(schedule.dateOverrides),
        employees: schedule.employees,
        staffing: normalizeStaffing(schedule.staffing, storeId),
        // A fresh UI seed makes each click a useful alternative plan while
        // direct scheduler calls remain deterministic when no seed is given.
        seed: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });
      setSchedule((s) => ({ ...s, shifts }));
      setOriginalShifts(shifts.map((sh) => ({ ...sh })));
    } catch (err) {
      setGenError(err instanceof Error ? err.message : String(err));
    }
  }, [
    schedule.year,
    schedule.month,
    schedule.workHours,
    schedule.dateOverrides,
    schedule.employees,
    schedule.staffing,
    storeId,
  ]);

  const resetToOriginal = useCallback(() => {
    setSchedule((s) => ({ ...s, shifts: originalShifts.map((sh) => ({ ...sh })) }));
  }, [originalShifts]);

  const resetAll = useCallback(() => {
    clearState(storeId);
    skipArchiveMerge.current = true;
    setSchedule(emptySchedule(storeById(storeId)));
    setOriginalShifts([]);
    setGenError(null);
  }, [storeId]);

  const saveNow = useCallback(() => {
    saveState(storeId, { schedule, originalShifts, passwordHash });
  }, [storeId, schedule, originalShifts]);

  // ----- Ausnahmen je Datum -----
  const upsertOverride = useCallback((override: DateOverride) => {
    setSchedule((s) => {
      const rest = s.dateOverrides.filter((o) => o.date !== override.date);
      const next = [...rest, override].sort((a, b) => a.date.localeCompare(b.date));
      return { ...s, dateOverrides: next };
    });
  }, []);

  const removeOverride = useCallback((date: string) => {
    setSchedule((s) => ({
      ...s,
      dateOverrides: s.dateOverrides.filter((o) => o.date !== date),
    }));
  }, []);

  // ----- Schicht-Bearbeitung -----
  const findShift = useCallback(
    (employeeId: string, date: string): Shift | undefined =>
      schedule.shifts.find((s) => s.employeeId === employeeId && s.date === date),
    [schedule.shifts],
  );

  const editShiftTimes = useCallback(
    (
      shiftId: string,
      changes: Partial<Pick<Shift, "startMinutes" | "endMinutes" | "pauseMinutes">>,
    ) => {
      setSchedule((s) => ({
        ...s,
        shifts: s.shifts.map((sh) => (sh.id === shiftId ? updateShiftTimes(sh, changes) : sh)),
      }));
    },
    [],
  );

  const addShift = useCallback(
    (employeeId: string, date: string, start: number, end: number, pause: number) => {
      setSchedule((s) => {
        const exists = s.shifts.some((sh) => sh.employeeId === employeeId && sh.date === date);
        if (exists) return s;
        return { ...s, shifts: [...s.shifts, createManualShift(employeeId, date, start, end, pause)] };
      });
    },
    [],
  );

  const deleteShift = useCallback((shiftId: string) => {
    setSchedule((s) => ({ ...s, shifts: s.shifts.filter((sh) => sh.id !== shiftId) }));
  }, []);

  /** Markiert einen Tag als "Frei": entfernt eine bestehende Schicht. */
  const setFrei = useCallback((employeeId: string, date: string) => {
    setSchedule((s) => ({
      ...s,
      shifts: s.shifts.filter((sh) => !(sh.employeeId === employeeId && sh.date === date)),
    }));
  }, []);

  /** Verschiebt eine Schicht zu einem anderen Mitarbeiter (gleicher Tag). */
  const moveShiftToEmployee = useCallback((shiftId: string, targetEmployeeId: string) => {
    setSchedule((s) => {
      const shift = s.shifts.find((sh) => sh.id === shiftId);
      if (!shift) return s;
      const conflict = s.shifts.some(
        (sh) => sh.employeeId === targetEmployeeId && sh.date === shift.date,
      );
      if (conflict) return s;
      return {
        ...s,
        shifts: s.shifts.map((sh) =>
          sh.id === shiftId ? { ...sh, employeeId: targetEmployeeId, generated: false } : sh,
        ),
      };
    });
  }, []);

  /**
   * Passwort dieser Filiale ändern. Gibt eine Meldung zurück oder null bei
   * Erfolg.
   *
   * Das alte Passwort wird abgefragt, damit nicht jeder, der gerade vor dem
   * offenen Tablet steht, die Filiale aussperren kann. Geschrieben wird sofort
   * – wer nach dem Ändern gleich neu lädt, säße sonst vor dem alten Passwort.
   */
  const changePassword = useCallback(
    async (alt: string, neu: string): Promise<string | null> => {
      if (!(await passwordMatches(alt, latest.current.passwordHash))) {
        return "Mật khẩu hiện tại không đúng.";
      }
      const sauber = neu.trim();
      if (sauber.length < MIN_PASSWORD_LENGTH) {
        return `Mật khẩu mới phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`;
      }
      const neuerHash = await hashPassword(sauber);
      setPasswordHash(neuerHash);
      const naechster = { ...latest.current, passwordHash: neuerHash };
      saveState(storeId, naechster);
      if (isRemoteConfigured) {
        try {
          await saveRemote(storeId, naechster);
        } catch {
          setRemoteStatus("error");
        }
      }
      return null;
    },
    [storeId],
  );

  return {
    storeId,
    storeConfig,
    schedule,
    savedMonths,
    originalShifts,
    validation,
    genError,
    hasOriginal: originalShifts.length > 0,
    updateMeta,
    addEmployee,
    updateEmployee,
    removeEmployee,
    changePassword,
    hasOwnPassword: passwordHash !== undefined,
    generate,
    resetToOriginal,
    resetAll,
    remoteStatus,
    isRemoteConfigured,
    saveNow,
    upsertOverride,
    removeOverride,
    findShift,
    editShiftTimes,
    addShift,
    deleteShift,
    setFrei,
    moveShiftToEmployee,
  };
}

export type UseScheduleReturn = ReturnType<typeof useSchedule>;

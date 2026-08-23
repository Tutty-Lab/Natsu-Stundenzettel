// ============================================================================
// Zentrales State-Management (ohne externe Bibliothek). Kapselt Schedule,
// LocalStorage-Persistenz und alle Aktionen (Generieren, Bearbeiten, Reset).
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Employee, EmploymentType, Schedule, Shift } from "../types";
import { generateSchedule } from "../lib/scheduler";
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
import { loadStoreId, saveStoreId, storeById, type StoreConfig } from "../lib/stores";
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
  };
}

function newEmployeeId(): string {
  return `emp-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export function useSchedule() {
  const [storeId, setStoreIdState] = useState<string>(() => loadStoreId());
  const storeConfig = storeById(storeId);

  const [schedule, setSchedule] = useState<Schedule>(() => {
    const persisted = loadState(storeId);
    return normalizeSchedule(persisted?.schedule, storeById(storeId));
  });
  const [passwordHash, setPasswordHash] = useState<string | undefined>(
    () => loadState(loadStoreId())?.passwordHash,
  );
  const [originalShifts, setOriginalShifts] = useState<Shift[]>(() => {
    const persisted = loadState(storeId);
    return persisted?.originalShifts ?? [];
  });
  const [genError, setGenError] = useState<string | null>(null);
  const [remoteStatus, setRemoteStatus] = useState<RemoteStatus>(
    isRemoteConfigured ? "idle" : "off",
  );

  // Save immediately to localStorage so the app remains usable offline.
  useEffect(() => {
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
      } catch {
        if (!cancelled) setRemoteStatus("error");
      } finally {
        if (!cancelled) hydrated.current = true;
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
      saveRemote(storeId, { schedule, originalShifts, passwordHash })
        .then(() => setRemoteStatus("idle"))
        .catch(() => setRemoteStatus("error"));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [storeId, schedule, originalShifts]);

  const storeIdRef = useRef(storeId);
  useEffect(() => {
    storeIdRef.current = storeId;
  }, [storeId]);

  const setStoreId = useCallback((next: string) => {
    const nextStore = storeById(next);
    if (nextStore.id === storeIdRef.current) return;

    saveStoreId(nextStore.id);
    const cached = loadState(nextStore.id);
    setSchedule(normalizeSchedule(cached?.schedule, nextStore));
    setOriginalShifts(cached?.originalShifts ?? []);
    setGenError(null);
    setRemoteStatus(isRemoteConfigured ? "idle" : "off");
    setStoreIdState(nextStore.id);
  }, []);

  const validation: ValidationResult = useMemo(
    () => validateSchedule(schedule.employees, schedule.shifts),
    [schedule.employees, schedule.shifts],
  );

  // ----- Firma / Monat / Öffnungszeiten -----
  const updateMeta = useCallback((patch: Partial<Schedule>) => {
    setSchedule((s) => ({ ...s, ...patch }));
  }, []);

  // ----- Mitarbeiter -----
  const addEmployee = useCallback(
    (name: string, employmentType: EmploymentType, targetHours: number) => {
      const emp: Employee = {
        id: newEmployeeId(),
        name: name.trim() || "Neuer Mitarbeiter",
        employmentType,
        targetMinutes: Math.round(targetHours) * 60,
        azubi: employmentType === "AZUBI" ? defaultAzubiConfig() : undefined,
      };
      setSchedule((s) => ({
        ...s,
        employees: [...s.employees, withAutomaticAzubiTarget(emp)],
      }));
    },
    [],
  );

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
  ]);

  const resetToOriginal = useCallback(() => {
    setSchedule((s) => ({ ...s, shifts: originalShifts.map((sh) => ({ ...sh })) }));
  }, [originalShifts]);

  const resetAll = useCallback(() => {
    clearState(storeId);
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
    setStoreId,
    schedule,
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

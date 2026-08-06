import type { PersistedState } from "./storage";
import { isRemoteConfigured, supabase } from "./supabase";

const TABLE = "store_data";

export type RemoteStatus = "off" | "idle" | "saving" | "error";

export async function loadRemote(storeId: string): Promise<PersistedState | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(TABLE)
    .select("data")
    .eq("store_id", storeId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data?.data as PersistedState | undefined) ?? null;
}

export async function saveRemote(storeId: string, state: PersistedState): Promise<void> {
  if (!supabase) return;

  const { error } = await supabase
    .from(TABLE)
    .upsert({ store_id: storeId, data: state }, { onConflict: "store_id" });

  if (error) throw new Error(error.message);
}

export { isRemoteConfigured };

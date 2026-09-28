// Tenant helpers used inside server-function handlers.
// Active alliance is always resolved by the database (current_alliance_id),
// which validates membership / system admin — never trust client input.
import type { SupabaseClient } from "@supabase/supabase-js";

export async function activeAllianceId(supabase: SupabaseClient<any>): Promise<string> {
  const { data, error } = await supabase.rpc("current_alliance_id");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Nemaš aktivno članstvo u savezu.");
  return data as string;
}

export async function hasRole(
  supabase: SupabaseClient<any>,
  userId: string,
  role: string,
): Promise<boolean> {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: role });
  return !!data;
}

export async function hasAnyRole(
  supabase: SupabaseClient<any>,
  userId: string,
  roles: string[],
): Promise<boolean> {
  for (const r of roles) if (await hasRole(supabase, userId, r)) return true;
  return false;
}

export async function isSystemAdmin(supabase: SupabaseClient<any>, userId: string) {
  const { data } = await supabase.rpc("is_system_admin", { _user_id: userId });
  return !!data;
}

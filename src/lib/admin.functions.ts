import { safeAuditLog } from "@/lib/audit";
import { createServerFn } from "@tanstack/react-start";
import { createHash } from "node:crypto";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { activeAllianceId, hasRole } from "@/lib/tenant";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

async function requireAdmin(supabase: any, userId: string): Promise<string> {
  if (!(await hasRole(supabase, userId, "admin")))
    throw new Error("Samo admin može izvršiti ovu akciju.");
  return activeAllianceId(supabase);
}

async function requireMember(allianceId: string, targetUserId: string) {
  const { data } = await supabaseAdmin
    .from("user_memberships")
    .select("id")
    .eq("alliance_id", allianceId)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (!data) throw new Error("Korisnik nije član tvog saveza.");
}

const PasscodeSchema = z.object({ new_passcode: z.string().min(4).max(128) });

export const setBaunPasscode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PasscodeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const allianceId = await requireAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("alliances")
      .update({ passcode_hash: sha256Hex(data.new_passcode) })
      .eq("id", allianceId);
    if (error) {
      if (/duplicate key/i.test(error.message))
        throw new Error("Ovaj passcode nije dostupan. Izaberi drugi.");
      throw new Error(error.message);
    }
    await safeAuditLog(context.supabase, {
      user_id: context.userId,
      action: "change_passcode",
      entity_type: "alliance",
      entity_id: allianceId,
    });
    return { ok: true };
  });

const AssignSchema = z.object({
  target_user_id: z.string().uuid(),
  role: z.enum(["admin", "glavni_pirat", "pirat", "ide_na_plasman", "korisnik"]),
});

export const assignRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AssignSchema.parse(input))
  .handler(async ({ data, context }) => {
    const allianceId = await requireAdmin(context.supabase, context.userId);
    await requireMember(allianceId, data.target_user_id);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.target_user_id, role: data.role, alliance_id: allianceId });
    if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);
    await safeAuditLog(context.supabase, {
      user_id: context.userId,
      action: "assign_role",
      entity_type: "user_role",
      entity_id: data.target_user_id,
      metadata: { role: data.role },
    });
    return { ok: true };
  });

export const removeRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AssignSchema.parse(input))
  .handler(async ({ data, context }) => {
    const allianceId = await requireAdmin(context.supabase, context.userId);
    // safety: don't allow removing your own admin role
    if (data.target_user_id === context.userId && data.role === "admin") {
      throw new Error("Ne možeš sebi oduzeti admin rolu.");
    }
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.target_user_id)
      .eq("alliance_id", allianceId)
      .eq("role", data.role);
    if (error) throw new Error(error.message);
    await safeAuditLog(context.supabase, {
      user_id: context.userId,
      action: "remove_role",
      entity_type: "user_role",
      entity_id: data.target_user_id,
      metadata: { role: data.role },
    });
    return { ok: true };
  });

const ToggleActiveSchema = z.object({
  target_user_id: z.string().uuid(),
  is_active: z.boolean(),
});

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ToggleActiveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const allianceId = await requireAdmin(context.supabase, context.userId);
    await requireMember(allianceId, data.target_user_id);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: data.is_active })
      .eq("id", data.target_user_id);
    if (error) throw new Error(error.message);
    await safeAuditLog(context.supabase, {
      user_id: context.userId,
      action: data.is_active ? "activate_user" : "deactivate_user",
      entity_type: "profile",
      entity_id: data.target_user_id,
    });
    return { ok: true };
  });

const DeleteUserSchema = z.object({ target_user_id: z.string().uuid() });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteUserSchema.parse(input))
  .handler(async ({ data, context }) => {
    const allianceId = await requireAdmin(context.supabase, context.userId);
    if (data.target_user_id === context.userId) {
      throw new Error("Ne možeš obrisati sebe.");
    }
    await requireMember(allianceId, data.target_user_id);
    // Ako je korisnik član i drugih saveza, uklanja se samo članstvo u ovom savezu.
    const { count: otherCount } = await supabaseAdmin
      .from("user_memberships")
      .select("id", { count: "exact", head: true })
      .eq("user_id", data.target_user_id)
      .neq("alliance_id", allianceId);
    if ((otherCount ?? 0) > 0) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.target_user_id).eq("alliance_id", allianceId);
      const { error: mErr } = await supabaseAdmin.from("user_memberships").delete().eq("user_id", data.target_user_id).eq("alliance_id", allianceId);
      if (mErr) throw new Error(mErr.message);
      return { ok: true };
    }
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.target_user_id);
    if (error) throw new Error(error.message);
    await safeAuditLog(context.supabase, {
      user_id: context.userId,
      action: "delete_user",
      entity_type: "profile",
      entity_id: data.target_user_id,
    });
    return { ok: true };
  });

export const totalResetPiratePoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const allianceId = await requireAdmin(context.supabase, context.userId);

    // Reset svih piratskih poena na 0 (svi nalozi, svih korisnika)
    const { error: accErr, count } = await supabaseAdmin
      .from("ikariam_accounts")
      .update({ current_pirate_points: 0, last_updated_at: new Date().toISOString() }, { count: "exact" })
      .eq("alliance_id", allianceId)
      .gte("current_pirate_points", 0);
    if (accErr) throw new Error(accErr.message);

    // Otkaži sve pending misije (start ispočetka)
    const { error: misErr } = await supabaseAdmin
      .from("pirate_missions")
      .update({ status: "cancelled", completed_at: new Date().toISOString() })
      .eq("alliance_id", allianceId)
      .eq("status", "pending");
    if (misErr) throw new Error(misErr.message);

    await safeAuditLog(context.supabase, {
      user_id: context.userId,
      action: "total_reset_pirate_points",
      entity_type: "ikariam_accounts",
      metadata: { accounts_reset: count ?? null },
    });
    return { ok: true, accounts_reset: count ?? 0 };
  });


import { safeAuditLog } from "@/lib/audit";
import { createServerFn } from "@tanstack/react-start";
import { createHash } from "node:crypto";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

async function requireAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Samo admin može izvršiti ovu akciju.");
}

const PasscodeSchema = z.object({ new_passcode: z.string().min(4).max(128) });

export const setBaunPasscode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PasscodeSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("app_settings")
      .update({
        baun_passcode_hash: sha256Hex(data.new_passcode),
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    await safeAuditLog(context.supabase, {
      user_id: context.userId,
      action: "change_passcode",
      entity_type: "app_settings",
      entity_id: "1",
    });
    return { ok: true };
  });

const AssignSchema = z.object({
  target_user_id: z.string().uuid(),
  role: z.enum(["admin", "glavni_pirat", "korisnik"]),
});

export const assignRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AssignSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.target_user_id, role: data.role });
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
    await requireAdmin(context.userId);
    // safety: don't allow removing your own admin role
    if (data.target_user_id === context.userId && data.role === "admin") {
      throw new Error("Ne možeš sebi oduzeti admin rolu.");
    }
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.target_user_id)
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
    await requireAdmin(context.userId);
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
    await requireAdmin(context.userId);
    if (data.target_user_id === context.userId) {
      throw new Error("Ne možeš obrisati sebe.");
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

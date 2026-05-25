import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CoordsSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{1,2}:[0-9]{1,2}$/, "Format mora biti N:N (1-99)")
  .refine((s) => {
    const [a, b] = s.split(":").map(Number);
    return a >= 1 && a <= 99 && b >= 1 && b <= 99;
  }, "Oba broja moraju biti između 1 i 99");

const AddAccountSchema = z.object({
  ikariam_username: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[^\n\r\t]+$/, "Neispravno korisničko ime"),
  current_pirate_points: z.number().int().min(0).max(10_000_000).optional(),
  fortress_coordinates: CoordsSchema,
});

export const addAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AddAccountSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("ikariam_accounts")
      .insert({
        owner_user_id: userId,
        ikariam_username: data.ikariam_username,
        current_pirate_points: data.current_pirate_points ?? 0,
        fortress_coordinates: data.fortress_coordinates,
        last_updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await safeAuditLog(context.supabase, {
      user_id: userId,
      action: "add_account",
      entity_type: "ikariam_account",
      entity_id: row.id,
      metadata: {
        ikariam_username: data.ikariam_username,
        fortress_coordinates: data.fortress_coordinates,
      },
    });
    return row;
  });

const UpdateCoordsSchema = z.object({
  account_id: z.string().uuid(),
  fortress_coordinates: CoordsSchema,
});

export const updateAccountCoordinates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateCoordsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("ikariam_accounts")
      .update({
        fortress_coordinates: data.fortress_coordinates,
        last_updated_at: new Date().toISOString(),
      })
      .eq("id", data.account_id)
      .eq("owner_user_id", userId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await safeAuditLog(context.supabase, {
      user_id: userId,
      action: "update_coordinates",
      entity_type: "ikariam_account",
      entity_id: data.account_id,
      metadata: { fortress_coordinates: data.fortress_coordinates },
    });
    return row;
  });


const UpdatePointsSchema = z.object({
  account_id: z.string().uuid(),
  points: z.number().int().min(0).max(10_000_000),
});

export const updateAccountPoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdatePointsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("ikariam_accounts")
      .update({
        current_pirate_points: data.points,
        last_updated_at: new Date().toISOString(),
      })
      .eq("id", data.account_id)
      .eq("owner_user_id", userId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await safeAuditLog(context.supabase, {
      user_id: userId,
      action: "update_points",
      entity_type: "ikariam_account",
      entity_id: data.account_id,
      metadata: { points: data.points },
    });
    return row;
  });

const DeleteAccountSchema = z.object({ account_id: z.string().uuid() });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteAccountSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("ikariam_accounts")
      .delete()
      .eq("id", data.account_id)
      .eq("owner_user_id", userId);
    if (error) throw new Error(error.message);
    await safeAuditLog(context.supabase, {
      user_id: userId,
      action: "delete_account",
      entity_type: "ikariam_account",
      entity_id: data.account_id,
    });
    return { ok: true };
  });

const CollectSchema = z.object({ account_id: z.string().uuid() });

export const collectPoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CollectSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // verify role
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const allowed = (roles ?? []).some(
      (r) => r.role === "admin" || r.role === "glavni_pirat",
    );
    if (!allowed) {
      throw new Error("Samo glavni pirat ili admin može pokupiti poene.");
    }
    const now = new Date().toISOString();
    const { data: prev } = await supabaseAdmin
      .from("ikariam_accounts")
      .select("current_pirate_points, ikariam_username")
      .eq("id", data.account_id)
      .single();
    const { data: row, error } = await supabaseAdmin
      .from("ikariam_accounts")
      .update({
        current_pirate_points: 0,
        last_collected_at: now,
        collected_by_user_id: userId,
        last_updated_at: now,
      })
      .eq("id", data.account_id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await safeAuditLog(context.supabase, {
      user_id: userId,
      action: "collect_points",
      entity_type: "ikariam_account",
      entity_id: data.account_id,
      metadata: {
        collected: prev?.current_pirate_points ?? null,
        ikariam_username: prev?.ikariam_username ?? null,
      },
    });
    return row;
  });

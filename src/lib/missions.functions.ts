import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const MISSION_REWARD = {
  mission_8h: { hours: 8, reward: 4634 },
  mission_16h: { hours: 16, reward: 7414 },
} as const;

const StartSchema = z.object({
  account_id: z.string().uuid(),
  mission_type: z.enum(["mission_8h", "mission_16h"]),
});

export const startMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => StartSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify the account belongs to the user.
    const { data: acc, error: aErr } = await supabase
      .from("ikariam_accounts")
      .select("id, owner_user_id, ikariam_username")
      .eq("id", data.account_id)
      .single();
    if (aErr) throw new Error(aErr.message);
    if (acc.owner_user_id !== userId) {
      throw new Error("Možeš pokrenuti misiju samo za svoj nalog.");
    }

    const cfg = MISSION_REWARD[data.mission_type];
    const startedAt = new Date();
    const completesAt = new Date(startedAt.getTime() + cfg.hours * 60 * 60 * 1000);

    const { data: row, error } = await supabase
      .from("pirate_missions")
      .insert({
        ikariam_account_id: data.account_id,
        user_id: userId,
        mission_type: data.mission_type,
        reward_points: cfg.reward,
        started_at: startedAt.toISOString(),
        completes_at: completesAt.toISOString(),
        status: "pending",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await safeAuditLog(context.supabase, {
      user_id: userId,
      action: data.mission_type === "mission_16h" ? "mission_start_16h" : "mission_start_8h",
      entity_type: "pirate_mission",
      entity_id: row.id,
      metadata: {
        ikariam_username: acc.ikariam_username,
        reward_points: cfg.reward,
        completes_at: completesAt.toISOString(),
      },
    });

    return row;
  });

const CancelSchema = z.object({ mission_id: z.string().uuid() });

export const cancelMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CancelSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("pirate_missions")
      .update({ status: "cancelled" })
      .eq("id", data.mission_id)
      .eq("status", "pending");
    if (error) throw new Error(error.message);

    await safeAuditLog(context.supabase, {
      user_id: userId,
      action: "mission_cancelled",
      entity_type: "pirate_mission",
      entity_id: data.mission_id,
    });
    return { ok: true };
  });

// Atomic completion — bezopasno se može zvati često (FOR UPDATE SKIP LOCKED).
export const completeDueMissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin.rpc("complete_due_pirate_missions");
    if (error) throw new Error(error.message);
    return { completed: (data as number) ?? 0 };
  });

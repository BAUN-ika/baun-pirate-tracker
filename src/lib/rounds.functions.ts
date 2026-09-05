import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { safeAuditLog } from "@/lib/audit";

async function requireAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Samo admin može izvršiti ovu akciju.");
}

/** Admin postavlja tačan kraj trenutnog pirate round-a (ISO timestamp). */
export const setRoundEnd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ ends_at: z.string().min(10) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);

    const ends = new Date(data.ends_at);
    if (Number.isNaN(ends.getTime())) throw new Error("Neispravan datum/vrijeme.");

    const { data: round } = await supabase
      .from("pirate_rounds")
      .select("*")
      .eq("status", "active")
      .maybeSingle();

    if (!round) {
      const { data: created, error } = await supabase
        .from("pirate_rounds")
        .insert({
          starts_at: new Date().toISOString(),
          ends_at: ends.toISOString(),
          status: "active",
          created_by: userId,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      await safeAuditLog(supabase, {
        user_id: userId,
        action: "pirate_round_created",
        entity_type: "pirate_round",
        entity_id: created.id,
        metadata: { ends_at: ends.toISOString() },
      });
      return created;
    }

    const { data: upd, error } = await supabase
      .from("pirate_rounds")
      .update({ ends_at: ends.toISOString() })
      .eq("id", round.id)
      .select()
      .single();
    if (error) throw new Error(error.message);

    await safeAuditLog(supabase, {
      user_id: userId,
      action: "pirate_round_end_changed",
      entity_type: "pirate_round",
      entity_id: round.id,
      metadata: { previous_ends_at: round.ends_at, new_ends_at: ends.toISOString() },
    });
    return upd;
  });

/** Ručni "provjeri sada" — poziva istu idempotentnu funkciju koju koristi scheduler. */
export const checkRoundReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("complete_due_pirate_rounds");
    if (error) throw new Error(error.message);
    return { processed: (data as number) ?? 0 };
  });

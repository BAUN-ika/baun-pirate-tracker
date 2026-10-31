import { activeAllianceId } from "@/lib/tenant";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SubmitSchema = z.object({ raw_text: z.string().min(1).max(50_000) });

export interface SubmitResult {
  ok: boolean;
  error?: string;
  entries_count?: number;
  invalid_count?: number;
  manual_count?: number;
  scanner_count?: number;
  current_player_count?: number;
  current_player?: {
    username: string;
    points: number;
    status: "updated" | "no_match" | "not_owned";
    previous_points?: number;
  } | null;
  submission_id?: string;
  source?: string;
}

export const submitHighscore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SubmitSchema.parse(input))
  .handler(async ({ data, context }): Promise<SubmitResult> => {
    const allianceId = await activeAllianceId(context.supabase);
    const { data: alliance, error } = await context.supabase.from("alliances").select("world_id").eq("id", allianceId).single();
    if (error || !alliance) throw new Error("Savez nije dostupan.");
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const { importHighscore } = await import("@/lib/highscore-import.server");
    return importHighscore(data, { ...context, allianceId, worldId: alliance.world_id, isAdmin: !!isAdmin });
  });

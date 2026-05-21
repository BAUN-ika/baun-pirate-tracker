import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parseHighscoreText } from "@/lib/parser";
import { getCurrentPeriod } from "@/lib/period";

const SubmitSchema = z.object({
  raw_text: z.string().min(1).max(50_000),
});

export const submitHighscore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SubmitSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const parsed = parseHighscoreText(data.raw_text);
    const valid = parsed.filter((r) => r.valid);
    if (valid.length === 0) {
      return { ok: false as const, error: "Nema validnih redova za snimanje." };
    }
    const { start, end } = getCurrentPeriod();

    const { data: submission, error: sErr } = await supabase
      .from("highscore_submissions")
      .insert({
        submitted_by_user_id: userId,
        period_start: start.toISOString(),
        period_end: end.toISOString(),
        raw_text: data.raw_text,
        entries_count: valid.length,
      })
      .select()
      .single();
    if (sErr) throw new Error(sErr.message);

    const rows = valid.map((r) => ({
      submission_id: submission.id,
      period_start: start.toISOString(),
      period_end: end.toISOString(),
      rank: r.rank!,
      ikariam_username: r.ikariamUsername!,
      pirate_points: r.piratePoints!,
      submitted_by_user_id: userId,
    }));
    const { error: eErr } = await supabase.from("highscore_entries").insert(rows);
    if (eErr) throw new Error(eErr.message);

    await supabaseAdmin.from("audit_logs").insert({
      user_id: userId,
      action: "submit_highscore",
      entity_type: "highscore_submission",
      entity_id: submission.id,
      metadata: { count: valid.length },
    });

    return { ok: true as const, count: valid.length, submission_id: submission.id };
  });

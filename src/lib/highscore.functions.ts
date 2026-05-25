import { safeAuditLog } from "@/lib/audit";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parseHighscoreText } from "@/lib/parser";
import { getCurrentPeriod } from "@/lib/period";

const SubmitSchema = z.object({
  raw_text: z.string().min(1).max(50_000),
});

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
    const { supabase, userId } = context;
    const parsed = parseHighscoreText(data.raw_text);
    const valid = parsed.filter((r) => r.valid);
    const invalid = parsed.filter((r) => !r.valid);

    const cpRows = valid.filter((r) => r.kind === "current_player");
    const manualRows = valid.filter((r) => r.kind === "manual");
    const scannerRows = valid.filter((r) => r.kind === "scanner");
    const entryRows = [...manualRows, ...scannerRows];

    if (valid.length === 0) {
      return { ok: false, error: "Nema validnih redova za snimanje." };
    }

    // Determine source label
    let source: string;
    const hasEntries = entryRows.length > 0;
    const hasCp = cpRows.length > 0;
    const onlyManual = manualRows.length === entryRows.length && hasEntries;
    const onlyScanner = scannerRows.length === entryRows.length && hasEntries;
    if (hasEntries && hasCp) source = "mixed";
    else if (hasCp && !hasEntries) source = "current_player";
    else if (onlyManual && !hasCp) source = "manual";
    else if (onlyScanner && !hasCp) source = "scanner";
    else source = "mixed";

    const { start, end } = getCurrentPeriod();

    // Check admin role for ownership override
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");

    // Insert submission
    const { data: submission, error: sErr } = await supabase
      .from("highscore_submissions")
      .insert({
        submitted_by_user_id: userId,
        period_start: start.toISOString(),
        period_end: end.toISOString(),
        raw_text: data.raw_text,
        entries_count: entryRows.length,
        source,
      })
      .select()
      .single();
    if (sErr) throw new Error(sErr.message);

    // Insert highscore entries
    if (entryRows.length > 0) {
      const rows = entryRows.map((r) => ({
        submission_id: submission.id,
        period_start: start.toISOString(),
        period_end: end.toISOString(),
        rank: r.rank!,
        ikariam_username: r.ikariamUsername!,
        pirate_points: r.piratePoints!,
        submitted_by_user_id: userId,
        source: r.kind!, // 'manual' | 'scanner'
        alliance_tag: r.allianceTag ?? null,
        coordinates: r.coordinates ?? null,
        city_name: r.cityName ?? null,
      }));
      const { error: eErr } = await supabase.from("highscore_entries").insert(rows);
      if (eErr) throw new Error(eErr.message);
    }

    // Process CURRENT_PLAYER (use first one if multiple)
    let cpResult: SubmitResult["current_player"] = null;
    if (cpRows.length > 0) {
      const cp = cpRows[0];
      const uname = cp.ikariamUsername!.trim();
      const newPoints = cp.piratePoints!;

      // Find matching account (case-insensitive). Use admin client to avoid RLS hiding accounts.
      const { data: accounts } = await supabaseAdmin
        .from("ikariam_accounts")
        .select("id, owner_user_id, current_pirate_points, ikariam_username")
        .ilike("ikariam_username", uname);

      const match = (accounts ?? []).find(
        (a) => a.ikariam_username.trim().toLowerCase() === uname.toLowerCase(),
      );

      if (!match) {
        cpResult = { username: uname, points: newPoints, status: "no_match" };
        await safeAuditLog(context.supabase, {
          user_id: userId,
          action: "current_player_points_sync_no_matching_account",
          entity_type: "highscore_submission",
          entity_id: submission.id,
          metadata: {
            ikariam_username: uname,
            points: newPoints,
            source: "current_player",
            submitted_by_user_id: userId,
            submission_id: submission.id,
          },
        });
      } else if (!isAdmin && match.owner_user_id !== userId) {
        cpResult = { username: uname, points: newPoints, status: "not_owned" };
      } else {
        const previous = match.current_pirate_points;
        const { error: upErr } = await supabaseAdmin
          .from("ikariam_accounts")
          .update({
            current_pirate_points: newPoints,
            last_updated_at: new Date().toISOString(),
          })
          .eq("id", match.id);
        if (upErr) throw new Error(upErr.message);
        cpResult = {
          username: uname,
          points: newPoints,
          status: "updated",
          previous_points: previous,
        };
        await safeAuditLog(context.supabase, {
          user_id: userId,
          action: "current_player_points_synced_to_account",
          entity_type: "ikariam_account",
          entity_id: match.id,
          metadata: {
            ikariam_username: uname,
            previous_points: previous,
            new_points: newPoints,
            source: "current_player",
            submitted_by_user_id: userId,
            submission_id: submission.id,
          },
        });
      }
    }

    // Top-level submission audit log
    const action =
      source === "manual"
        ? "highscore_manual_submission_created"
        : source === "scanner"
          ? "highscore_scanner_submission_created"
          : source === "current_player"
            ? "current_player_points_submission_created"
            : "highscore_mixed_submission_created";

    await safeAuditLog(context.supabase, {
      user_id: userId,
      action,
      entity_type: "highscore_submission",
      entity_id: submission.id,
      metadata: {
        valid_count: valid.length,
        invalid_count: invalid.length,
        manual_count: manualRows.length,
        scanner_count: scannerRows.length,
        current_player_count: cpRows.length,
        period_start: start.toISOString(),
        period_end: end.toISOString(),
        source,
      },
    });

    return {
      ok: true,
      entries_count: entryRows.length,
      invalid_count: invalid.length,
      manual_count: manualRows.length,
      scanner_count: scannerRows.length,
      current_player_count: cpRows.length,
      current_player: cpResult,
      submission_id: submission.id,
      source,
    };
  });

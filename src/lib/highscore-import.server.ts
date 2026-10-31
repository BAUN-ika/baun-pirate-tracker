import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { parseHighscoreText, type ParsedRow } from "@/lib/parser";
import { getCurrentPeriod } from "@/lib/period";
import type { SubmitResult } from "@/lib/highscore.functions";

// Server-only shared import pipeline. Scope is verified by each caller.
export async function importHighscore(data: { raw_text: string; scanner_request_id?: string }, scope: {
  supabase: SupabaseClient<Database>; userId: string; allianceId: string; worldId: string; isAdmin: boolean;
}): Promise<SubmitResult> {
  const { supabase, userId, allianceId, worldId, isAdmin } = scope;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const audit = async (entry: { user_id: string; action: string; entity_type: string; entity_id: string; metadata: Record<string, unknown> }) => {
    const { error } = await supabaseAdmin.from("audit_logs").insert({ ...entry, metadata: entry.metadata as Json, alliance_id: allianceId, world_id: worldId });
    if (error) console.warn("[highscore audit]", error.message);
  };
  if (data.scanner_request_id) {
    const { data: previous, error } = await supabaseAdmin.from("highscore_submissions")
      .select("scanner_result, submitted_by_user_id").eq("scanner_request_id", data.scanner_request_id).eq("alliance_id", allianceId).eq("world_id", worldId).maybeSingle();
    if (error) throw new Error(error.message);
    if (previous) {
      if (previous.submitted_by_user_id !== userId) throw new Error("Nevažeći identifikator skeniranja.");
      if (previous.scanner_result) return previous.scanner_result as unknown as SubmitResult;
      throw new Error("Ovaj uvoz je u toku ili nije završen. Provjeri listu prije novog skeniranja.");
    }
  }
    const parsed = parseHighscoreText(data.raw_text);
    const valid = parsed.filter((r) => r.valid && r.ikariamUsername !== undefined && r.piratePoints !== undefined) as (ParsedRow & { ikariamUsername: string; piratePoints: number })[];
    const invalid = parsed.filter((r) => !r.valid);

    const cpRows = valid.filter((r) => r.kind === "current_player");
    const manualRows = valid.filter((r) => r.kind === "manual");
    const scannerRows = valid.filter((r) => r.kind === "scanner");
    const entryRows = [...manualRows, ...scannerRows].filter((r) => r.rank !== undefined) as (ParsedRow & { ikariamUsername: string; piratePoints: number; rank: number })[];

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



    // Insert submission
    const { data: submission, error: sErr } = await supabaseAdmin
      .from("highscore_submissions")
      .insert({
        submitted_by_user_id: userId,
        alliance_id: allianceId,
        world_id: worldId,
        scanner_request_id: data.scanner_request_id ?? null,
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
        alliance_id: allianceId,
        world_id: worldId,
        period_start: start.toISOString(),
        period_end: end.toISOString(),
        rank: r.rank,
        ikariam_username: r.ikariamUsername,
        pirate_points: r.piratePoints,
        submitted_by_user_id: userId,
        source: r.kind, // 'manual' | 'scanner'
        alliance_tag: r.allianceTag ?? null,
        coordinates: r.coordinates ?? null,
        city_name: r.cityName ?? null,
      }));
      const { error: eErr } = await supabaseAdmin.from("highscore_entries").insert(rows);
      if (eErr) throw new Error(eErr.message);

      // --- Sinhronizacija sa "Piratski poeni saveza" ---
      // Highscore smije prepisati poene naloga SAMO ako nema ručnog unosa,
      // završene misije ili pokupljanja nakon posljednje granice 18:00 (Europe/Sarajevo).
      const boundary = start; // posljednja 18:00 granica
      const { data: allAccounts } = await supabaseAdmin
        .from("ikariam_accounts")
        .select(
          "id, ikariam_username, current_pirate_points, points_source, points_authoritative_at",
        )
        .eq("alliance_id", allianceId);

      const byName = new Map<
        string,
        NonNullable<typeof allAccounts>[number]
      >();
      for (const a of allAccounts ?? []) {
        byName.set(a.ikariam_username.trim().toLowerCase(), a);
      }

      // Najnoviji entry po igraču (najveći rank-red zadnji pobjeđuje nije bitno — uzmi zadnji)
      const latestByName = new Map<string, (typeof entryRows)[number]>();
      for (const r of entryRows) {
        latestByName.set(r.ikariamUsername.trim().toLowerCase(), r);
      }

      for (const [key, entry] of latestByName) {
        const acc = byName.get(key);
        if (!acc) continue;

        const authAt = acc.points_authoritative_at
          ? new Date(acc.points_authoritative_at)
          : null;
        const protectedSource =
          acc.points_source === "manual" ||
          acc.points_source === "mission" ||
          acc.points_source === "current_player" ||
          acc.points_source === "collected";
        const isProtected =
          protectedSource && !!authAt && authAt.getTime() >= boundary.getTime();

        if (isProtected) {
          await audit({
            user_id: userId,
            action: "highscore_points_sync_skipped",
            entity_type: "ikariam_account",
            entity_id: acc.id,
            metadata: {
              ikariam_username: acc.ikariam_username,
              highscore_points: entry.piratePoints,
              current_points: acc.current_pirate_points,
              current_points_source: acc.points_source,
              current_points_authoritative_at: acc.points_authoritative_at,
              reason: "manual_or_mission_update_after_18_boundary",
            },
          });
          continue;
        }

        if (acc.current_pirate_points === entry.piratePoints) continue;

        const previous = acc.current_pirate_points;
        const { error: upErr } = await supabaseAdmin
          .from("ikariam_accounts")
          .update({
            current_pirate_points: entry.piratePoints,
            last_updated_at: new Date().toISOString(),
            points_source: "highscore",
            // NE diramo points_authoritative_at — highscore nije autoritativan izvor
          })
          .eq("id", acc.id).eq("alliance_id", allianceId).eq("world_id", worldId);
        if (upErr) throw new Error(upErr.message);

        await audit({
          user_id: userId,
          action: "highscore_points_synced_to_account",
          entity_type: "ikariam_account",
          entity_id: acc.id,
          metadata: {
            ikariam_username: acc.ikariam_username,
            previous_points: previous,
            new_points: entry.piratePoints,
            highscore_rank: entry.rank,
            submitted_by_user_id: userId,
            submission_id: submission.id,
          },
        });
      }
    }

    // Process CURRENT_PLAYER (use first one if multiple)
    let cpResult: SubmitResult["current_player"] = null;
    if (cpRows.length > 0) {
      const cp = cpRows[0];
      const uname = cp.ikariamUsername.trim();
      const newPoints = cp.piratePoints;

      // Find matching account (case-insensitive). Use admin client to avoid RLS hiding accounts.
      const { data: accounts } = await supabaseAdmin
        .from("ikariam_accounts")
        .select("id, owner_user_id, current_pirate_points, ikariam_username")
        .eq("alliance_id", allianceId)
        .ilike("ikariam_username", uname);

      const match = (accounts ?? []).find(
        (a) => a.ikariam_username.trim().toLowerCase() === uname.toLowerCase(),
      );

      if (!match) {
        cpResult = { username: uname, points: newPoints, status: "no_match" };
        await audit({
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
            // CURRENT_PLAYER je autoritativan (vlasnik sam javlja svoje poene)
            points_source: "current_player",
            points_authoritative_at: new Date().toISOString(),
          })
          .eq("id", match.id).eq("alliance_id", allianceId).eq("world_id", worldId);
        if (upErr) throw new Error(upErr.message);
        cpResult = {
          username: uname,
          points: newPoints,
          status: "updated",
          previous_points: previous,
        };
        await audit({
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

    await audit({
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

    const result: SubmitResult = {
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
    if (data.scanner_request_id) {
      const { error } = await supabaseAdmin.from("highscore_submissions").update({ scanner_result: result as unknown as Json }).eq("id", submission.id).eq("alliance_id", allianceId).eq("world_id", worldId);
      if (error) throw new Error(error.message);
    }
    return result;
}

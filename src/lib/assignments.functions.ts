import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { safeAuditLog } from "@/lib/audit";

/** Normalizacija imena igrača (latinica/ćirilica, razmaci, velika/mala slova). */
export function usernameKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

async function requireRegionManager(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data ?? []) as { role: string }[]).map((r) => r.role);
  if (!roles.includes("admin") && !roles.includes("glavni_pirat"))
    throw new Error("Samo admin ili glavni pirat može importovati dodjele igrača.");
}

const RowSchema = z.object({
  pirate_username: z.string().trim().min(1).optional().nullable(),
  coordinates: z.string().trim().max(20).optional().nullable(),
  player: z.string().trim().min(1).max(120),
});

const ImportSchema = z.object({
  pirate_user_id: z.string().uuid().optional().nullable(),
  mode: z.enum(["add", "replace"]).default("add"),
  rows: z.array(RowSchema).min(1, "Nema validnih redova za import."),
});

export const importPlayerAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ImportSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireRegionManager(supabase, userId);

    /* pirati kojima se smije dodijeliti */
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id, username"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    const pirateIds = new Set(
      ((roles ?? []) as any[])
        .filter((r) => r.role === "pirat" || r.role === "glavni_pirat")
        .map((r) => r.user_id as string),
    );
    const idByName = new Map<string, string>();
    for (const p of (profiles ?? []) as any[])
      if (pirateIds.has(p.id)) idByName.set(usernameKey(p.username), p.id as string);

    if (data.pirate_user_id && !pirateIds.has(data.pirate_user_id))
      throw new Error("Odabrani korisnik nema rank pirat ili glavni pirat.");

    type Prepared = {
      pirate_user_id: string;
      ikariam_username: string;
      username_key: string;
      coordinates: string | null;
    };
    const prepared: Prepared[] = [];
    const skipped: { player: string; reason: string }[] = [];

    for (const row of data.rows) {
      const pid = row.pirate_username
        ? idByName.get(usernameKey(row.pirate_username))
        : (data.pirate_user_id ?? undefined);
      if (!pid) {
        skipped.push({
          player: row.player,
          reason: row.pirate_username
            ? `Pirat "${row.pirate_username}" nije nađen ili nema rank pirat/glavni pirat.`
            : "Pirat nije odabran.",
        });
        continue;
      }
      prepared.push({
        pirate_user_id: pid,
        ikariam_username: row.player.trim(),
        username_key: usernameKey(row.player),
        coordinates: row.coordinates?.trim() || null,
      });
    }

    if (prepared.length === 0)
      throw new Error(skipped[0]?.reason ?? "Nema validnih redova za import.");

    /* dedup unutar fajla */
    const seen = new Set<string>();
    const rows = prepared.filter((r) => {
      const k = `${r.pirate_user_id}|${r.username_key}|${r.coordinates ?? ""}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    let deleted = 0;
    if (data.mode === "replace") {
      /* briše samo dodjele pirata iz ovog importa — territory/opsezi ostaju netaknuti */
      const pirateTargets = Array.from(new Set(rows.map((r) => r.pirate_user_id)));
      const { data: del, error: delErr } = await supabase
        .from("pirate_player_assignments")
        .delete()
        .in("pirate_user_id", pirateTargets)
        .select("id");
      if (delErr) throw new Error(delErr.message);
      deleted = (del ?? []).length;
    }

    const { data: ins, error } = await supabase
      .from("pirate_player_assignments")
      .upsert(
        rows.map((r) => ({ ...r, created_by: userId, source: "excel_import" })),
        { onConflict: "pirate_user_id,username_key,coordinates", ignoreDuplicates: true },
      )
      .select("id");
    if (error) {
      /* fallback ako upsert po izrazu nije podržan — insert red po red */
      let ok = 0;
      for (const r of rows) {
        const { error: e } = await supabase
          .from("pirate_player_assignments")
          .insert({ ...r, created_by: userId, source: "excel_import" });
        if (!e) ok++;
      }
      await safeAuditLog(supabase, {
        user_id: userId,
        action: "pirate_player_assignments_imported",
        entity_type: "pirate_player_assignment",
        metadata: { inserted: ok, deleted, skipped: skipped.length, mode: data.mode },
      });
      return { ok: true, inserted: ok, deleted, skipped };
    }

    await safeAuditLog(supabase, {
      user_id: userId,
      action: "pirate_player_assignments_imported",
      entity_type: "pirate_player_assignment",
      metadata: {
        inserted: (ins ?? []).length,
        deleted,
        skipped: skipped.length,
        mode: data.mode,
      },
    });

    return { ok: true, inserted: (ins ?? []).length, deleted, skipped };
  });

export const deletePlayerAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireRegionManager(supabase, userId);
    const { error } = await supabase
      .from("pirate_player_assignments")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

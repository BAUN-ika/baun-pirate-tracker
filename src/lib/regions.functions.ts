import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { safeAuditLog } from "@/lib/audit";

/** Normalizacija imena igrača (razmaci, velika/mala slova). */
export function usernameKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Rejone smiju upravljati admin i glavni pirat (postojeća permission logika). */
async function requireRegionManager(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data ?? []) as { role: string }[]).map((r) => r.role);
  if (!roles.includes("admin") && !roles.includes("glavni_pirat"))
    throw new Error("Samo admin ili glavni pirat može upravljati rejonima.");
}

/** Rejon se može dodijeliti samo piratu ili glavnom piratu. */
async function requireTargetIsPirate(supabase: any, pirateUserId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", pirateUserId);
  const roles = ((data ?? []) as { role: string }[]).map((r) => r.role);
  if (!roles.includes("pirat") && !roles.includes("glavni_pirat"))
    throw new Error("Rejon se može dodijeliti samo piratu ili glavnom piratu.");
}

const coord = z.number().int().min(1).max(100);

const ItemSchema = z
  .object({
    item_type: z.enum(["point", "rectangle"]),
    x_start: coord,
    x_end: coord,
    y_start: coord,
    y_end: coord,
  })
  /* automatska normalizacija obrnutog opsega (30-20 -> 20-30) */
  .transform((i) => ({
    item_type: i.item_type,
    x_start: Math.min(i.x_start, i.x_end),
    x_end: Math.max(i.x_start, i.x_end),
    y_start: Math.min(i.y_start, i.y_end),
    y_end: Math.max(i.y_start, i.y_end),
  }));

const PlayerSchema = z.object({
  x: coord,
  y: coord,
  ikariam_username: z.string().trim().min(1).max(120),
});

const SaveSchema = z.object({
  id: z.string().uuid().optional(),
  pirate_user_id: z.string().uuid(),
  name: z.string().trim().max(80).optional().nullable(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Boja mora biti HEX (#RRGGBB)."),
  items: z.array(ItemSchema).min(1, "Rejon mora imati najmanje jednu koordinatu ili opseg."),
  players: z.array(PlayerSchema).default([]),
});

export const saveRegion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SaveSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireRegionManager(supabase, userId);
    await requireTargetIsPirate(supabase, data.pirate_user_id);

    /* dedup identičnih itema unutar istog rejona */
    const seen = new Set<string>();
    const items = data.items.filter((i) => {
      const k = `${i.item_type}|${i.x_start}|${i.x_end}|${i.y_start}|${i.y_end}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    /* dedup igrača po koordinati (isti igrač na istoj koordinati samo jednom) */
    const pSeen = new Set<string>();
    const players = data.players.filter((p) => {
      const k = `${p.x}|${p.y}|${usernameKey(p.ikariam_username)}`;
      if (pSeen.has(k)) return false;
      pSeen.add(k);
      return true;
    });

    let regionId = data.id ?? null;
    const now = new Date().toISOString();

    if (regionId) {
      const { error } = await supabase
        .from("pirate_regions")
        .update({
          pirate_user_id: data.pirate_user_id,
          name: data.name?.trim() || null,
          color: data.color,
          updated_at: now,
        })
        .eq("id", regionId);
      if (error) throw new Error(error.message);
      const { error: delErr } = await supabase
        .from("pirate_region_items")
        .delete()
        .eq("region_id", regionId);
      if (delErr) throw new Error(delErr.message);
      const { error: delP } = await supabase
        .from("pirate_region_players")
        .delete()
        .eq("region_id", regionId);
      if (delP) throw new Error(delP.message);
    } else {
      const { data: row, error } = await supabase
        .from("pirate_regions")
        .insert({
          pirate_user_id: data.pirate_user_id,
          name: data.name?.trim() || null,
          color: data.color,
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      regionId = row.id as string;
    }

    const { error: itemsErr } = await supabase
      .from("pirate_region_items")
      .insert(items.map((i) => ({ ...i, region_id: regionId })));
    if (itemsErr) throw new Error(itemsErr.message);

    if (players.length > 0) {
      const { error: pErr } = await supabase.from("pirate_region_players").insert(
        players.map((p) => ({
          region_id: regionId,
          x: p.x,
          y: p.y,
          ikariam_username: p.ikariam_username.trim(),
          username_key: usernameKey(p.ikariam_username),
          created_by: userId,
        })),
      );
      if (pErr) throw new Error(pErr.message);
    }

    await safeAuditLog(supabase, {
      user_id: userId,
      action: data.id ? "pirate_region_updated" : "pirate_region_created",
      entity_type: "pirate_region",
      entity_id: regionId!,
      metadata: {
        pirate_user_id: data.pirate_user_id,
        items_count: items.length,
        players_count: players.length,
        color: data.color,
      },
    });

    return { ok: true, id: regionId };
  });

export const deleteRegion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireRegionManager(supabase, userId);
    const { error } = await supabase.from("pirate_regions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await safeAuditLog(supabase, {
      user_id: userId,
      action: "pirate_region_deleted",
      entity_type: "pirate_region",
      entity_id: data.id,
    });
    return { ok: true };
  });

/* ------------------------- Excel import (samo input metoda) ------------------------- */

const ImportRow = z.object({
  pirate_username: z.string().trim().min(1).optional().nullable(),
  coordinates: z.string().trim().min(3).max(20),
  player: z.string().trim().min(1).max(120),
});

const ImportSchema = z.object({
  /* eksplicitno odabran rejon (kada pirat ima više rejona) */
  region_id: z.string().uuid().optional().nullable(),
  pirate_user_id: z.string().uuid().optional().nullable(),
  mode: z.enum(["add", "replace"]).default("add"),
  rows: z.array(ImportRow).min(1, "Nema validnih redova za import."),
});

const parseCoords = (raw: string) => {
  const m = raw.trim().match(/^(\d{1,3})\s*[:.\-]\s*(\d{1,3})$/);
  if (!m) return null;
  const x = Number(m[1]);
  const y = Number(m[2]);
  if (x < 1 || x > 100 || y < 1 || y > 100) return null;
  return { x, y };
};

/**
 * Importuje Coordinates+Player redove DIREKTNO u rejon pirata. Excel nije zaseban
 * feature — rezultat je identičan ručnom unosu (pirate_region_items + pirate_region_players).
 */
export const importRegionPlayers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ImportSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireRegionManager(supabase, userId);

    const [{ data: profiles }, { data: roles }, { data: regions }] = await Promise.all([
      supabase.from("profiles").select("id, username"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("pirate_regions").select("id, pirate_user_id, color, created_at"),
    ]);

    const pirateIds = new Set(
      ((roles ?? []) as any[])
        .filter((r) => r.role === "pirat" || r.role === "glavni_pirat")
        .map((r) => r.user_id as string),
    );
    const idByName = new Map<string, string>();
    for (const p of (profiles ?? []) as any[])
      if (pirateIds.has(p.id)) idByName.set(usernameKey(p.username), p.id as string);

    const regionsByPirate = new Map<string, { id: string; created_at: string }[]>();
    for (const r of (regions ?? []) as any[]) {
      const list = regionsByPirate.get(r.pirate_user_id) ?? [];
      list.push({ id: r.id, created_at: r.created_at });
      regionsByPirate.set(r.pirate_user_id, list);
    }

    const skipped: { player: string; reason: string }[] = [];
    const created: string[] = [];

    /** Rejon za pirata: eksplicitni izbor, jedini postojeći, ili novi. */
    const resolveRegion = async (pirateId: string): Promise<string | null> => {
      if (data.region_id && data.pirate_user_id === pirateId) return data.region_id;
      const list = (regionsByPirate.get(pirateId) ?? []).sort((a, b) =>
        a.created_at.localeCompare(b.created_at),
      );
      if (list.length === 1) return list[0].id;
      if (list.length > 1) return list[0].id;
      const { data: row, error } = await supabase
        .from("pirate_regions")
        .insert({
          pirate_user_id: pirateId,
          name: "Rejon",
          color: "#38bdf8",
          created_by: userId,
        })
        .select("id, created_at")
        .single();
      if (error) throw new Error(error.message);
      regionsByPirate.set(pirateId, [{ id: row.id, created_at: row.created_at }]);
      created.push(row.id as string);
      return row.id as string;
    };

    type Prepared = { region_id: string; x: number; y: number; player: string };
    const prepared: Prepared[] = [];

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
      const c = parseCoords(row.coordinates);
      if (!c) {
        skipped.push({ player: row.player, reason: "Neispravne koordinate." });
        continue;
      }
      const regionId = await resolveRegion(pid);
      if (!regionId) {
        skipped.push({ player: row.player, reason: "Rejon nije pronađen." });
        continue;
      }
      prepared.push({ region_id: regionId, x: c.x, y: c.y, player: row.player.trim() });
    }

    if (prepared.length === 0)
      throw new Error(skipped[0]?.reason ?? "Nema validnih redova za import.");

    const affected = Array.from(new Set(prepared.map((p) => p.region_id)));

    let deleted = 0;
    if (data.mode === "replace") {
      const { data: del, error } = await supabase
        .from("pirate_region_players")
        .delete()
        .in("region_id", affected)
        .select("id");
      if (error) throw new Error(error.message);
      deleted = (del ?? []).length;
    }

    /* koordinate iz importa moraju biti dio territory-ja rejona */
    const { data: existingItems } = await supabase
      .from("pirate_region_items")
      .select("region_id, x_start, x_end, y_start, y_end")
      .in("region_id", affected);
    const covers = (regionId: string, x: number, y: number) =>
      ((existingItems ?? []) as any[]).some(
        (i) =>
          i.region_id === regionId &&
          x >= i.x_start &&
          x <= i.x_end &&
          y >= i.y_start &&
          y <= i.y_end,
      );
    const newItems = new Map<string, { region_id: string; x: number; y: number }>();
    for (const p of prepared) {
      const k = `${p.region_id}|${p.x}|${p.y}`;
      if (!covers(p.region_id, p.x, p.y) && !newItems.has(k))
        newItems.set(k, { region_id: p.region_id, x: p.x, y: p.y });
    }
    if (newItems.size > 0) {
      const { error } = await supabase.from("pirate_region_items").insert(
        Array.from(newItems.values()).map((i) => ({
          region_id: i.region_id,
          item_type: "point",
          x_start: i.x,
          x_end: i.x,
          y_start: i.y,
          y_end: i.y,
        })),
      );
      if (error) throw new Error(error.message);
    }

    /* dedup u okviru fajla + insert igrača */
    const seen = new Set<string>();
    const rows = prepared.filter((p) => {
      const k = `${p.region_id}|${p.x}|${p.y}|${usernameKey(p.player)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    let inserted = 0;
    const { data: ins, error } = await supabase
      .from("pirate_region_players")
      .upsert(
        rows.map((p) => ({
          region_id: p.region_id,
          x: p.x,
          y: p.y,
          ikariam_username: p.player,
          username_key: usernameKey(p.player),
          created_by: userId,
        })),
        { onConflict: "region_id,x,y,username_key", ignoreDuplicates: true },
      )
      .select("id");
    if (error) {
      for (const p of rows) {
        const { error: e } = await supabase.from("pirate_region_players").insert({
          region_id: p.region_id,
          x: p.x,
          y: p.y,
          ikariam_username: p.player,
          username_key: usernameKey(p.player),
          created_by: userId,
        });
        if (!e) inserted++;
      }
    } else {
      inserted = (ins ?? []).length;
    }

    await safeAuditLog(supabase, {
      user_id: userId,
      action: "pirate_region_players_imported",
      entity_type: "pirate_region",
      metadata: {
        inserted,
        deleted,
        skipped: skipped.length,
        mode: data.mode,
        regions: affected,
        created_regions: created,
      },
    });

    return { ok: true, inserted, deleted, skipped, regions: affected };
  });

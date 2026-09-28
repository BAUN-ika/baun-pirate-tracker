import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { activeAllianceId } from "@/lib/tenant";

const SECTION_COL = {
  highscore: "can_view_global_highscore",
  clusters: "can_view_global_clusters",
  nearest: "can_view_global_nearest_points",
  map: "can_view_global_map",
} as const;

export interface GlobalEntry {
  rank: number | null;
  ikariam_username: string;
  pirate_points: number;
  alliance_tag: string | null;
  coordinates: string | null;
  city_name: string | null;
  created_at: string;
  /** Uvijek false — podatak dolazi iz drugog saveza (sanitizovan). */
  own: false;
}

/**
 * Sanitizovani globalni target podaci iz DRUGIH saveza istog svijeta.
 * Vraća [] ako korisnik/savez nema dozvolu za datu sekciju.
 * Nikad ne vraća ko je unio, ko je krenuo/pokupio, vlasnika naloga ni rejone.
 */
export const getGlobalEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        section: z.enum(["highscore", "clusters", "nearest", "map"]),
        startISO: z.string(),
        endISO: z.string(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<GlobalEntry[]> => {
    const allianceId = await activeAllianceId(context.supabase);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const col = SECTION_COL[data.section];

    const { data: al } = await db.from("alliances").select("world_id").eq("id", allianceId).single();
    if (!al) return [];
    const worldId = al.world_id;

    const [{ data: up }, { data: ap }] = await Promise.all([
      db
        .from("user_visibility_permissions")
        .select(col)
        .eq("user_id", context.userId)
        .eq("world_id", worldId)
        .maybeSingle(),
      db.from("alliance_visibility_permissions").select(col).eq("alliance_id", allianceId).maybeSingle(),
    ]);
    const userVal = (up as Record<string, boolean | null> | null)?.[col];
    const allowed = userVal ?? !!(ap as Record<string, boolean> | null)?.[col];
    if (!allowed) return [];

    const out: GlobalEntry[] = [];
    const PAGE = 1000;
    let from = 0;
    while (from < 100_000) {
      const { data: rows, error } = await db
        .from("highscore_entries")
        .select("rank, ikariam_username, pirate_points, alliance_tag, coordinates, city_name, created_at")
        .eq("world_id", worldId)
        .neq("alliance_id", allianceId)
        .gte("period_start", data.startISO)
        .lt("period_start", data.endISO)
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      if (!rows?.length) break;
      for (const r of rows) out.push({ ...r, own: false });
      if (rows.length < PAGE) break;
      from += PAGE;
    }

    // Nalozi drugih saveza (sanitizovano). Isto pravilo prioriteta kao inače:
    // ručni unos / CURRENT_PLAYER / misija / pokupljeno nakon granice perioda
    // pobjeđuje highscore; inače pobjeđuje noviji podatak.
    const { data: accs } = await db
      .from("ikariam_accounts")
      .select("alliance_id, ikariam_username, current_pirate_points, fortress_coordinates, last_updated_at, points_source, points_authoritative_at")
      .eq("world_id", worldId)
      .neq("alliance_id", allianceId);
    const { data: others } = await db
      .from("alliances")
      .select("id, tag")
      .eq("world_id", worldId);
    const tagOf = new Map((others ?? []).map((o) => [o.id, o.tag]));
    const start = new Date(data.startISO).getTime();
    for (const a of accs ?? []) {
      const protectedSrc = ["manual", "mission", "current_player", "collected"].includes(a.points_source);
      const authAt = a.points_authoritative_at ? new Date(a.points_authoritative_at).getTime() : 0;
      const wins = protectedSrc && authAt >= start;
      out.push({
        rank: null,
        ikariam_username: a.ikariam_username,
        pirate_points: a.current_pirate_points ?? 0,
        alliance_tag: tagOf.get(a.alliance_id as string) ?? null,
        coordinates: a.fortress_coordinates,
        city_name: null,
        // Zaštićeni izvor dobija prednost u "najnoviji pobjeđuje" dedupu.
        created_at: wins ? "9999-12-31T00:00:00.000Z" : a.last_updated_at,
        own: false,
      });
    }
    return out;
  });

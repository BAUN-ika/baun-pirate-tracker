import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RegionItemType = "point" | "rectangle";

export interface RegionItem {
  id: string;
  item_type: RegionItemType;
  x_start: number;
  x_end: number;
  y_start: number;
  y_end: number;
}

export interface RegionPlayer {
  id: string;
  x: number;
  y: number;
  ikariam_username: string;
}

export interface PirateRegion {
  id: string;
  pirate_user_id: string;
  pirate_username: string;
  pirate_roles: string[];
  name: string | null;
  color: string;
  created_at: string;
  updated_at: string;
  items: RegionItem[];
  points: RegionItem[];
  rectangles: RegionItem[];
  players: RegionPlayer[];
}

export interface PirateCandidate {
  id: string;
  username: string;
  roles: string[];
}

/** Paleta jasno različitih boja — namjerno izbjegava relation boje (žuta/zelena/crvena). */
export const REGION_PALETTE = [
  "#38bdf8",
  "#a78bfa",
  "#f472b6",
  "#22d3ee",
  "#818cf8",
  "#2dd4bf",
  "#c084fc",
  "#60a5fa",
  "#e879f9",
  "#7dd3fc",
  "#fb923c",
  "#94a3b8",
];

/** Stabilna boja po piratu — svi rejoni istog pirata dobijaju istu osnovnu boju. */
export function suggestColor(pirateUserId: string, existing: PirateRegion[]): string {
  const same = existing.find((r) => r.pirate_user_id === pirateUserId);
  if (same) return same.color;
  const used = new Set(existing.map((r) => r.color.toLowerCase()));
  const free = REGION_PALETTE.find((c) => !used.has(c.toLowerCase()));
  if (free) return free;
  let h = 0;
  for (const ch of pirateUserId) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return REGION_PALETTE[h % REGION_PALETTE.length];
}

/** Sve koordinate rejona, bez duplikata (point + rectangle preklapanje = jedno polje). */
export function regionCells(region: PirateRegion): string[] {
  const set = new Set<string>();
  for (const it of region.items)
    for (let x = it.x_start; x <= it.x_end; x++)
      for (let y = it.y_start; y <= it.y_end; y++) set.add(`${x}:${y}`);
  return Array.from(set);
}

/** Dodijeljeni igrači grupisani po koordinati ("x:y"). */
export function playersByCell(region: PirateRegion): Map<string, RegionPlayer[]> {
  const map = new Map<string, RegionPlayer[]>();
  for (const p of region.players) {
    const k = `${p.x}:${p.y}`;
    const list = map.get(k) ?? [];
    list.push(p);
    map.set(k, list);
  }
  for (const list of map.values())
    list.sort((a, b) => a.ikariam_username.localeCompare(b.ikariam_username));
  return map;
}

/**
 * Jedinstven prikaz koordinata rejona: sve pojedinačne koordinate + sve koordinate
 * (i unutar opsega) koje imaju dodijeljene igrače.
 */
export function regionCoordRows(
  region: PirateRegion,
): { key: string; x: number; y: number; players: RegionPlayer[] }[] {
  const byCell = playersByCell(region);
  const keys = new Set<string>([
    ...region.points.map((p) => `${p.x_start}:${p.y_start}`),
    ...byCell.keys(),
  ]);
  return Array.from(keys)
    .map((key) => {
      const [x, y] = key.split(":").map(Number);
      return { key, x, y, players: byCell.get(key) ?? [] };
    })
    .sort((a, b) => a.x - b.x || a.y - b.y);
}

export function useRegions() {
  return useQuery({
    queryKey: ["pirate-regions"],
    queryFn: async (): Promise<PirateRegion[]> => {
      const [{ data: regions, error }, { data: items }, { data: rplayers }, { data: profiles }, { data: roles }] =
        await Promise.all([
          supabase
            .from("pirate_regions")
            .select("id, pirate_user_id, name, color, created_at, updated_at")
            .order("created_at", { ascending: true }),
          supabase
            .from("pirate_region_items")
            .select("id, region_id, item_type, x_start, x_end, y_start, y_end"),
          supabase
            .from("pirate_region_players")
            .select("id, region_id, x, y, ikariam_username"),
          supabase.from("profiles").select("id, username"),
          supabase.from("user_roles").select("user_id, role"),
        ]);
      if (error) throw new Error(error.message);

      const nameById = new Map((profiles ?? []).map((p: any) => [p.id, p.username as string]));
      const rolesById = new Map<string, string[]>();
      for (const r of (roles ?? []) as any[]) {
        const list = rolesById.get(r.user_id) ?? [];
        list.push(r.role);
        rolesById.set(r.user_id, list);
      }
      const itemsByRegion = new Map<string, RegionItem[]>();
      for (const it of (items ?? []) as any[]) {
        const list = itemsByRegion.get(it.region_id) ?? [];
        list.push({
          id: it.id,
          item_type: it.item_type,
          x_start: it.x_start,
          x_end: it.x_end,
          y_start: it.y_start,
          y_end: it.y_end,
        });
        itemsByRegion.set(it.region_id, list);
      }
      const playersByRegion = new Map<string, RegionPlayer[]>();
      for (const p of (rplayers ?? []) as any[]) {
        const list = playersByRegion.get(p.region_id) ?? [];
        list.push({ id: p.id, x: p.x, y: p.y, ikariam_username: p.ikariam_username });
        playersByRegion.set(p.region_id, list);
      }

      return ((regions ?? []) as any[]).map((r) => {
        const list = itemsByRegion.get(r.id) ?? [];
        return {
          id: r.id,
          pirate_user_id: r.pirate_user_id,
          pirate_username: nameById.get(r.pirate_user_id) ?? "Nepoznat",
          pirate_roles: rolesById.get(r.pirate_user_id) ?? [],
          name: r.name,
          color: r.color,
          created_at: r.created_at,
          updated_at: r.updated_at,
          items: list,
          points: list.filter((i) => i.item_type === "point"),
          rectangles: list.filter((i) => i.item_type === "rectangle"),
          players: playersByRegion.get(r.id) ?? [],
        } satisfies PirateRegion;
      });
    },
  });
}

/** Korisnici kojima se rejon može dodijeliti: pirat i glavni pirat. */
export function usePirateCandidates() {
  return useQuery({
    queryKey: ["pirate-candidates"],
    queryFn: async (): Promise<PirateCandidate[]> => {
      const [{ data: roles }, { data: profiles }] = await Promise.all([
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("profiles").select("id, username"),
      ]);
      const rolesById = new Map<string, string[]>();
      for (const r of (roles ?? []) as any[]) {
        const list = rolesById.get(r.user_id) ?? [];
        list.push(r.role);
        rolesById.set(r.user_id, list);
      }
      return ((profiles ?? []) as any[])
        .map((p) => ({ id: p.id, username: p.username, roles: rolesById.get(p.id) ?? [] }))
        .filter((p) => p.roles.includes("pirat") || p.roles.includes("glavni_pirat"))
        .sort((a, b) => a.username.localeCompare(b.username));
    },
  });
}

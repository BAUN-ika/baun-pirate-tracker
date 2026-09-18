import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  useEffectiveRelation,
  type RelationType,
} from "@/components/alliance-badge";
import {
  effectivePoints,
  statusOf,
  useTargetStatusMap,
  type TargetStatusRow,
} from "@/hooks/use-target-status";
import type { Period } from "@/lib/period";

/**
 * Centralni resolver trenutnog stanja svake mete ("CurrentPirateTarget").
 * Spaja: ikariam_accounts (Piratski poeni saveza) + highscore_entries
 * + globalni target status + player/alliance relations.
 *
 * Svi prikazi treba da koriste ovaj resolver — bez duplirane business logike.
 */

export type TargetSource = "alliance" | "highscore" | "both";

export interface CurrentPirateTarget {
  canonical_player_key: string;
  username: string;
  coordinates: string | null;
  x: number | null;
  y: number | null;
  current_pirate_points: number;
  alliance_tag: string | null;
  city_name: string | null;
  rank: number | null;
  effective_relation: RelationType | null;
  relation_from_player: boolean;
  target_status: string;
  assigned_pirate_name: string | null;
  collected_at: string | null;
  source: TargetSource;
  highscore_entry_id: string | null;
  ikariam_account_id: string | null;
  updated_at: string | null;
}

export function parseXY(c: string | null | undefined): { x: number; y: number } | null {
  if (!c) return null;
  const m = /^(\d{1,3}):(\d{1,3})$/.exec(c.trim());
  if (!m) return null;
  const x = Number(m[1]);
  const y = Number(m[2]);
  if (x < 1 || x > 100 || y < 1 || y > 100) return null;
  return { x, y };
}

interface RawAccount {
  id: string;
  ikariam_username: string;
  current_pirate_points: number | null;
  fortress_coordinates: string | null;
  last_updated_at: string | null;
}

interface RawEntry {
  id: string;
  rank: number | null;
  ikariam_username: string;
  pirate_points: number | null;
  alliance_tag: string | null;
  coordinates: string | null;
  city_name: string | null;
  created_at: string;
}

async function loadHighscore(startISO: string, endISO: string): Promise<RawEntry[]> {
  const PAGE = 1000;
  let from = 0;
  const all: RawEntry[] = [];
  while (from < 50_000) {
    const { data, error } = await supabase
      .from("highscore_entries")
      .select(
        "id, rank, ikariam_username, pirate_points, alliance_tag, coordinates, city_name, created_at",
      )
      .gte("period_start", startISO)
      .lt("period_start", endISO)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as unknown as RawEntry[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

/** Sirovi izvori za dati period (accounts + highscore). */
export function useTargetSources(period: Period) {
  return useQuery({
    queryKey: ["current-targets", period.start.toISOString()],
    queryFn: async () => {
      const [accRes, entries] = await Promise.all([
        supabase
          .from("ikariam_accounts")
          .select(
            "id, ikariam_username, current_pirate_points, fortress_coordinates, last_updated_at",
          ),
        loadHighscore(period.start.toISOString(), period.end.toISOString()),
      ]);
      if (accRes.error) throw accRes.error;
      return {
        accounts: (accRes.data ?? []) as unknown as RawAccount[],
        entries,
      };
    },
  });
}

function resolve(
  accounts: RawAccount[],
  entries: RawEntry[],
  statuses: Map<string, TargetStatusRow>,
  effRelation: (u: string | null, a: string | null) => {
    relation: RelationType | null;
    fromPlayer: boolean;
  },
): CurrentPirateTarget[] {
  const byKey = new Map<string, CurrentPirateTarget>();

  const base = (key: string, username: string): CurrentPirateTarget => ({
    canonical_player_key: key,
    username,
    coordinates: null,
    x: null,
    y: null,
    current_pirate_points: 0,
    alliance_tag: null,
    city_name: null,
    rank: null,
    effective_relation: null,
    relation_from_player: false,
    target_status: "ready",
    assigned_pirate_name: null,
    collected_at: null,
    source: "highscore",
    highscore_entry_id: null,
    ikariam_account_id: null,
    updated_at: null,
  });

  // 1) Savezni nalozi — autoritativna vrijednost poena (manual/mission/collected logika).
  for (const a of accounts) {
    const key = a.ikariam_username.trim().toLowerCase();
    if (!key) continue;
    const t = byKey.get(key) ?? base(key, a.ikariam_username.trim());
    t.source = "alliance";
    t.ikariam_account_id = a.id;
    t.alliance_tag = t.alliance_tag ?? "BAUN";
    t.current_pirate_points = a.current_pirate_points ?? 0;
    t.coordinates = a.fortress_coordinates ?? t.coordinates;
    t.updated_at = a.last_updated_at ?? t.updated_at;
    byKey.set(key, t);
  }

  // 2) Highscore — metadata (rank, savez, grad) + poeni za mete bez naloga.
  for (const e of entries) {
    const username = (e.ikariam_username ?? "").trim();
    const key = username.toLowerCase();
    if (!key) continue;
    const existing = byKey.get(key);
    if (existing) {
      // ne dupliraj metu; samo dopuni metadata i zadrži autoritativne poene naloga
      if (existing.highscore_entry_id) continue;
      existing.source = existing.ikariam_account_id ? "both" : existing.source;
      existing.highscore_entry_id = e.id;
      existing.rank = e.rank ?? existing.rank;
      existing.alliance_tag = e.alliance_tag ?? existing.alliance_tag;
      existing.city_name = e.city_name ?? existing.city_name;
      existing.coordinates = existing.coordinates ?? e.coordinates ?? null;
      continue;
    }
    const t = base(key, username);
    t.source = "highscore";
    t.highscore_entry_id = e.id;
    t.rank = e.rank ?? null;
    t.alliance_tag = e.alliance_tag ?? null;
    t.city_name = e.city_name ?? null;
    t.coordinates = e.coordinates ?? null;
    t.current_pirate_points = e.pirate_points ?? 0;
    t.updated_at = e.created_at;
    byKey.set(key, t);
  }

  // 3) Globalni status + relation + efektivni poeni (collected = 0 svuda).
  const out: CurrentPirateTarget[] = [];
  for (const t of byKey.values()) {
    const st = statusOf(statuses, t.username);
    t.target_status = st?.status ?? "ready";
    t.assigned_pirate_name = st?.assigned_pirate_name ?? null;
    t.collected_at = st?.collected_at ?? null;
    t.current_pirate_points = effectivePoints(
      statuses,
      t.username,
      t.current_pirate_points,
    );
    const rel = effRelation(t.username, t.alliance_tag);
    t.effective_relation = rel.relation;
    t.relation_from_player = rel.fromPlayer;
    const xy = parseXY(t.coordinates);
    t.x = xy?.x ?? null;
    t.y = xy?.y ?? null;
    out.push(t);
  }
  return out;
}

/** Kanonske trenutne mete za dati period. */
export function useCurrentTargets(period: Period) {
  const { data, isLoading } = useTargetSources(period);
  const { map: statuses } = useTargetStatusMap();
  const effRelation = useEffectiveRelation();

  const targets = useMemo(
    () => resolve(data?.accounts ?? [], data?.entries ?? [], statuses, effRelation),
    [data, statuses, effRelation],
  );

  return { targets, isLoading };
}

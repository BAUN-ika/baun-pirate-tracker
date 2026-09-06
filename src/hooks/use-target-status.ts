import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  targetBulkCollect,
  targetBulkSetEnRoute,
  targetCancelEnRoute,
  targetCollect,
  targetSetEnRoute,
} from "@/lib/targets.functions";

export interface PirateRound {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
}

export interface TargetStatusRow {
  id: string;
  username_key: string;
  ikariam_username: string;
  coordinates: string | null;
  alliance_tag: string | null;
  status: string;
  assigned_pirate_name: string | null;
  collected_at: string | null;
  collected_points: number | null;
}

export function useActiveRound() {
  return useQuery({
    queryKey: ["active-round"],
    queryFn: async (): Promise<PirateRound | null> => {
      const { data, error } = await supabase
        .from("pirate_rounds")
        .select("id, starts_at, ends_at, status")
        .eq("status", "active")
        .order("starts_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as PirateRound) ?? null;
    },
    refetchInterval: 60_000,
  });
}

/** Globalni status meta — isti za sve stranice (aktivni pirate round). */
export function useTargetStatusMap() {
  const round = useActiveRound();
  const roundId = round.data?.id ?? null;
  const q = useQuery({
    queryKey: ["target-status", roundId],
    enabled: round.isFetched,
    queryFn: async (): Promise<Map<string, TargetStatusRow>> => {
      let query = supabase
        .from("pirate_target_status")
        .select(
          "id, username_key, ikariam_username, coordinates, alliance_tag, status, assigned_pirate_name, collected_at, collected_points",
        );
      query = roundId
        ? query.eq("pirate_round_id", roundId)
        : query.is("pirate_round_id", null);
      const { data, error } = await query;
      if (error) throw error;
      const m = new Map<string, TargetStatusRow>();
      for (const r of (data ?? []) as TargetStatusRow[]) m.set(r.username_key, r);
      return m;
    },
  });
  return { map: q.data ?? new Map<string, TargetStatusRow>(), isLoading: q.isLoading };
}

export function statusOf(
  map: Map<string, TargetStatusRow>,
  username: string | null | undefined,
): TargetStatusRow | null {
  if (!username) return null;
  return map.get(username.trim().toLowerCase()) ?? null;
}

export interface TargetRef {
  ikariam_username: string;
  coordinates?: string | null;
  alliance_tag?: string | null;
  rank?: number | null;
  pirate_points?: number | null;
}

/** Kreni / Otkaži / Pokupi — centralizovano, radi identično na svim stranicama. */
export function useTargetActions(source?: string) {
  const qc = useQueryClient();
  const enRouteFn = useServerFn(targetSetEnRoute);
  const cancelFn = useServerFn(targetCancelEnRoute);
  const collectFn = useServerFn(targetCollect);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["target-status"] });
    qc.invalidateQueries({ queryKey: ["all-accounts"] });
    qc.invalidateQueries({ queryKey: ["my-accounts"] });
    qc.invalidateQueries({ queryKey: ["collection-events"] });
    qc.invalidateQueries({ queryKey: ["clusters-raw"] });
    qc.invalidateQueries({ queryKey: ["nearby-candidates"] });
    qc.invalidateQueries({ queryKey: ["highscore"] });
  };

  const enRoute = useMutation({
    mutationFn: (v: { target: TargetRef; pirate_name?: string }) =>
      enRouteFn({ data: { ...v.target, pirate_name: v.pirate_name } }),
    onSuccess: (r: any) => {
      toast.success(`Krenuo: ${r?.assigned_pirate_name ?? "—"}`);
      refresh();
    },
    onError: (e: any) => toast.error("Greška", { description: e?.message }),
  });

  const cancel = useMutation({
    mutationFn: (username: string) => cancelFn({ data: { ikariam_username: username } }),
    onSuccess: () => {
      toast.success("Assignment otkazan.");
      refresh();
    },
    onError: (e: any) => toast.error("Greška", { description: e?.message }),
  });

  const collect = useMutation({
    mutationFn: (v: { target: TargetRef; collected_by_name?: string }) =>
      collectFn({
        data: { ...v.target, collected_by_name: v.collected_by_name, source },
      }),
    onSuccess: (r: any) => {
      toast.success(`Pokupio: ${r?.collected_by_name ?? "—"}`);
      refresh();
    },
    onError: (e: any) => toast.error("Greška", { description: e?.message }),
  });

  return { enRoute, cancel, collect };
}

/** Efektivni poeni mete: pokupljena meta ima 0 poena SVUDA. */
export function effectivePoints(
  map: Map<string, TargetStatusRow>,
  username: string | null | undefined,
  rawPoints: number | null | undefined,
): number {
  const st = statusOf(map, username);
  if (st?.status === "collected") return 0;
  return rawPoints ?? 0;
}

/** Masovne akcije za cijeli klaster. */
export function useBulkTargetActions(source?: string) {
  const qc = useQueryClient();
  const bulkEnRouteFn = useServerFn(targetBulkSetEnRoute);
  const bulkCollectFn = useServerFn(targetBulkCollect);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["target-status"] });
    qc.invalidateQueries({ queryKey: ["all-accounts"] });
    qc.invalidateQueries({ queryKey: ["my-accounts"] });
    qc.invalidateQueries({ queryKey: ["collection-events"] });
    qc.invalidateQueries({ queryKey: ["clusters-raw"] });
    qc.invalidateQueries({ queryKey: ["nearby-candidates"] });
    qc.invalidateQueries({ queryKey: ["highscore"] });
  };

  const enRouteAll = useMutation({
    mutationFn: (v: { targets: TargetRef[]; pirate_name?: string }) =>
      bulkEnRouteFn({ data: { targets: v.targets as any, pirate_name: v.pirate_name } }),
    onSuccess: (r: any) => {
      toast.success(`Krenuo: ${r?.assigned_pirate_name ?? "—"} · ${r?.count ?? 0} meta`);
      refresh();
    },
    onError: (e: any) => toast.error("Greška", { description: e?.message }),
  });

  const collectAll = useMutation({
    mutationFn: (v: { targets: TargetRef[]; collected_by_name?: string }) =>
      bulkCollectFn({
        data: { targets: v.targets as any, collected_by_name: v.collected_by_name, source },
      }),
    onSuccess: (r: any) => {
      toast.success(
        `Pokupljeno ${r?.count ?? 0} meta · ${(r?.total_points ?? 0).toLocaleString("bs-BA")} poena`,
      );
      refresh();
    },
    onError: (e: any) => toast.error("Greška", { description: e?.message }),
  });

  return { enRouteAll, collectAll };
}

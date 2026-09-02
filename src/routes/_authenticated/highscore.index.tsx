import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Coins, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CoordsLink } from "@/components/coords-link";
import { AssignDialog } from "@/components/assign-dialog";
import {
  AllianceBadge,
  StatusBadge,
  relationOf,
  useRelationMap,
} from "@/components/alliance-badge";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  highscoreCancelEnRoute,
  highscoreCollect,
  highscoreSetEnRoute,
} from "@/lib/targets.functions";
import { getCurrentPeriod, getPreviousPeriod, type Period } from "@/lib/period";

export const Route = createFileRoute("/_authenticated/highscore/")({
  component: HighscoreListPage,
});

interface Row {
  rank: number;
  ikariam_username: string;
  pirate_points: number;
  alliance_tag: string | null;
  coordinates: string | null;
  city_name: string | null;
  submitted_by: string;
  created_at: string;
}

interface TargetStatus {
  ikariam_username: string;
  status: string;
  assigned_pirate_name: string | null;
}

function useHighscore(period: Period) {
  return useQuery({
    queryKey: ["highscore", period.start.toISOString()],
    queryFn: async (): Promise<Row[]> => {
      // Paginate to bypass PostgREST default 1000-row cap.
      const PAGE = 1000;
      let from = 0;
      type Raw = {
        rank: number;
        ikariam_username: string;
        pirate_points: number;
        alliance_tag: string | null;
        coordinates: string | null;
        city_name: string | null;
        submitted_by_user_id: string;
        created_at: string;
      };
      const all: Raw[] = [];
      while (from < 50_000) {
        const { data, error } = await supabase
          .from("highscore_entries")
          .select(
            "rank, ikariam_username, pirate_points, alliance_tag, coordinates, city_name, submitted_by_user_id, created_at",
          )
          .gte("period_start", period.start.toISOString())
          .lt("period_start", period.end.toISOString())
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...(data as Raw[]));
        if (data.length < PAGE) break;
        from += PAGE;
      }
      // Dedupe by username — keep most recent entry per player.
      const seen = new Set<string>();
      const deduped: Raw[] = [];
      for (const r of all) {
        const k = r.ikariam_username.trim().toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        deduped.push(r);
      }
      const ids = Array.from(new Set(deduped.map((r) => r.submitted_by_user_id)));
      const profiles =
        ids.length > 0
          ? (await supabase.from("profiles").select("id, username").in("id", ids))
              .data ?? []
          : [];
      const m = new Map(profiles.map((p) => [p.id, p.username]));
      return deduped
        .map((r) => ({
          rank: r.rank,
          ikariam_username: r.ikariam_username,
          pirate_points: r.pirate_points,
          alliance_tag: r.alliance_tag ?? null,
          coordinates: r.coordinates ?? null,
          city_name: r.city_name ?? null,
          submitted_by: m.get(r.submitted_by_user_id) ?? "—",
          created_at: r.created_at,
        }))
        .sort((a, b) => a.rank - b.rank);
    },
  });
}

function useTargetStatuses(period: Period) {
  return useQuery({
    queryKey: ["hs-target-status", period.start.toISOString()],
    queryFn: async (): Promise<Map<string, TargetStatus>> => {
      const { data, error } = await supabase
        .from("highscore_target_status")
        .select("ikariam_username, status, assigned_pirate_name")
        .eq("period_start", period.start.toISOString());
      if (error) throw error;
      const m = new Map<string, TargetStatus>();
      for (const r of (data ?? []) as TargetStatus[]) {
        m.set(r.ikariam_username.trim().toLowerCase(), r);
      }
      return m;
    },
  });
}

function HighscoreListPage() {
  const cur = getCurrentPeriod();
  const prev = getPreviousPeriod();

  return (
    <div>
      <PageHeader
        title="Highscore lista"
        description="Spojeni globalni Capture Points highscore iz svih unosa članova saveza."
      />

      <Tabs defaultValue="current">
        <TabsList className="mb-4">
          <TabsTrigger value="current">Trenutna lista</TabsTrigger>
          <TabsTrigger value="previous">Prethodna lista</TabsTrigger>
        </TabsList>
        <TabsContent value="current">
          <HighscoreTable period={cur} label="Trenutni period" />
        </TabsContent>
        <TabsContent value="previous">
          <HighscoreTable period={prev} label="Prethodni period" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function HighscoreTable({ period, label }: { period: Period; label: string }) {
  const qc = useQueryClient();
  const { isPirate } = useCurrentUser();
  const { data, isLoading } = useHighscore(period);
  const { data: statuses } = useTargetStatuses(period);
  const relations = useRelationMap();

  const [search, setSearch] = useState("");
  const [minR, setMinR] = useState("");
  const [maxR, setMaxR] = useState("");
  const [allianceFilter, setAllianceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const periodStart = period.start.toISOString();
  const enRouteFn = useServerFn(highscoreSetEnRoute);
  const cancelFn = useServerFn(highscoreCancelEnRoute);
  const collectFn = useServerFn(highscoreCollect);

  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["hs-target-status", periodStart] });

  const enRouteMut = useMutation({
    mutationFn: (v: { row: Row; pirate_name?: string }) =>
      enRouteFn({
        data: {
          period_start: periodStart,
          ikariam_username: v.row.ikariam_username,
          rank: v.row.rank,
          coordinates: v.row.coordinates ?? undefined,
          alliance_tag: v.row.alliance_tag ?? undefined,
          pirate_name: v.pirate_name,
        },
      }),
    onSuccess: (r: any) => {
      toast.success(`Krenuo: ${r?.assigned_pirate_name ?? "—"}`);
      refresh();
    },
    onError: (e: any) => toast.error("Greška", { description: e?.message }),
  });

  const cancelMut = useMutation({
    mutationFn: (username: string) =>
      cancelFn({ data: { period_start: periodStart, ikariam_username: username } }),
    onSuccess: () => {
      toast.success("Assignment otkazan.");
      refresh();
    },
    onError: (e: any) => toast.error("Greška", { description: e?.message }),
  });

  const collectMut = useMutation({
    mutationFn: (row: Row) =>
      collectFn({
        data: {
          period_start: periodStart,
          ikariam_username: row.ikariam_username,
          rank: row.rank,
          coordinates: row.coordinates ?? undefined,
          alliance_tag: row.alliance_tag ?? undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Meta označena kao pokupljena.");
      refresh();
    },
    onError: (e: any) => toast.error("Greška", { description: e?.message }),
  });

  const rows = useMemo(() => {
    let xs = data ?? [];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      xs = xs.filter(
        (r) =>
          r.ikariam_username.toLowerCase().includes(q) ||
          (r.alliance_tag ?? "").toLowerCase().includes(q) ||
          (r.city_name ?? "").toLowerCase().includes(q),
      );
    }
    const mn = Number(minR);
    const mx = Number(maxR);
    if (Number.isFinite(mn) && minR) xs = xs.filter((r) => r.rank >= mn);
    if (Number.isFinite(mx) && maxR) xs = xs.filter((r) => r.rank <= mx);

    if (allianceFilter !== "all") {
      xs = xs.filter((r) => {
        const rel = relationOf(relations, r.alliance_tag);
        if (allianceFilter === "none") return rel === null;
        if (allianceFilter === "attackable") return rel === null;
        return rel === allianceFilter;
      });
    }
    if (statusFilter !== "all") {
      xs = xs.filter((r) => {
        const st =
          statuses?.get(r.ikariam_username.trim().toLowerCase())?.status ?? "ready";
        return st === statusFilter;
      });
    }
    return xs;
  }, [data, search, minR, maxR, allianceFilter, statusFilter, relations, statuses]);

  return (
    <div>
      <div className="text-xs text-muted-foreground mb-3">
        {label}: {period.start.toLocaleString("bs-BA")} →{" "}
        {period.end.toLocaleString("bs-BA")}
      </div>

      <div className="pirate-card rounded-2xl p-4 mb-4 flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Pretraži username / savez / grad..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Input
          type="number"
          placeholder="Min rank"
          value={minR}
          onChange={(e) => setMinR(e.target.value)}
          className="lg:w-28"
        />
        <Input
          type="number"
          placeholder="Max rank"
          value={maxR}
          onChange={(e) => setMaxR(e.target.value)}
          className="lg:w-28"
        />
        <Select value={allianceFilter} onValueChange={setAllianceFilter}>
          <SelectTrigger className="lg:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Svi savezi</SelectItem>
            <SelectItem value="attackable">Samo napadive mete</SelectItem>
            <SelectItem value="our_alliance">Naš savez</SelectItem>
            <SelectItem value="deal">Dogovor</SelectItem>
            <SelectItem value="protected">Zaštićeni</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="lg:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Svi statusi</SelectItem>
            <SelectItem value="ready">READY</SelectItem>
            <SelectItem value="en_route">EN ROUTE</SelectItem>
            <SelectItem value="collected">POKUPLJENO</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="pirate-card rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Učitavam...</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nema unosa za ovaj period.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-muted-foreground bg-card/40">
                <tr>
                  <th className="text-right py-2.5 pl-4 pr-2 w-16">Rank</th>
                  <th className="text-left py-2.5 px-2">Username</th>
                  <th className="text-right py-2.5 px-2">Poeni</th>
                  <th className="text-left py-2.5 px-2">Savez</th>
                  <th className="text-left py-2.5 px-2">Koordinate</th>
                  <th className="text-left py-2.5 px-2">Grad</th>
                  <th className="text-left py-2.5 px-2">Status</th>
                  <th className="text-right py-2.5 px-2">Akcija</th>
                  <th className="text-right py-2.5 pr-4 pl-2">Uneseno</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const rel = relationOf(relations, r.alliance_tag);
                  const st = statuses?.get(r.ikariam_username.trim().toLowerCase());
                  const status = st?.status ?? "ready";
                  const blocked = rel !== null;
                  return (
                    <tr
                      key={`${r.rank}-${r.ikariam_username}`}
                      className="border-t border-border hover:bg-card/60"
                    >
                      <td className="py-2 pl-4 pr-2 text-right font-display text-gold">
                        #{r.rank}
                      </td>
                      <td className="py-2 px-2 font-medium truncate max-w-[16rem]">
                        {r.ikariam_username}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {r.pirate_points.toLocaleString("bs-BA")}
                      </td>
                      <td className="py-2 px-2">
                        <AllianceBadge tag={r.alliance_tag} relation={rel} />
                      </td>
                      <td className="py-2 px-2">
                        <CoordsLink coords={r.coordinates ?? ""} />
                      </td>
                      <td className="py-2 px-2 text-muted-foreground truncate max-w-[12rem]">
                        {r.city_name ?? "—"}
                      </td>
                      <td className="py-2 px-2">
                        <StatusBadge status={status} />
                        {status === "en_route" && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {st?.assigned_pirate_name ?? "—"}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right whitespace-nowrap space-x-1">
                        {status === "en_route" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={cancelMut.isPending}
                            onClick={() => cancelMut.mutate(r.ikariam_username)}
                          >
                            Otkaži
                          </Button>
                        ) : (
                          <AssignDialog
                            targetLabel={`${r.ikariam_username} (${r.coordinates ?? "—"})`}
                            disabled={blocked}
                            loading={enRouteMut.isPending}
                            onConfirm={(name) =>
                              enRouteMut.mutate({ row: r, pirate_name: name })
                            }
                          />
                        )}
                        {isPirate && (
                          <Button
                            size="sm"
                            disabled={collectMut.isPending || status === "collected"}
                            onClick={() => collectMut.mutate(r)}
                          >
                            <Coins className="size-3.5 mr-1.5" />
                            Pokupi
                          </Button>
                        )}
                      </td>
                      <td className="py-2 pr-4 pl-2 text-right text-[10px] text-muted-foreground">
                        <div className="text-gold/80">{r.submitted_by}</div>
                        <div>{new Date(r.created_at).toLocaleString("bs-BA")}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

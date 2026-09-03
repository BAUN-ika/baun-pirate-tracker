import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Coins, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CoordsLink } from "@/components/coords-link";
import { AssignDialog } from "@/components/assign-dialog";
import {
  AllianceBadge,
  StatusBadge,
  relationOf,
  useRelationMap,
  type RelationType,
} from "@/components/alliance-badge";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  clusterCancelEnRoute,
  clusterCollect,
  clusterSetEnRoute,
} from "@/lib/targets.functions";
import { getCurrentPeriod, getPreviousPeriod, type Period } from "@/lib/period";

/** Stabilan kratki ključ (<=64 char) za klaster. */
function hashKey(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 ^= s.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = (Math.imul(h2 ^ s.charCodeAt(i), 0x85ebca6b) + i) >>> 0;
  }
  return `c${h1.toString(16)}${h2.toString(16)}`;
}

export const Route = createFileRoute("/_authenticated/clusters")({
  component: ClustersPage,
});

interface Entry {
  rank: number;
  ikariam_username: string;
  pirate_points: number;
  alliance_tag: string | null;
  coordinates: string;
  city_name: string | null;
  x: number;
  y: number;
}

interface Cluster {
  key: string;
  shortKey: string;
  total: number;
  players: Entry[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function parseCoords(c: string | null): { x: number; y: number } | null {
  if (!c) return null;
  const m = c.trim().match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m) return null;
  return { x: +m[1], y: +m[2] };
}

function useClusterData(period: Period) {
  return useQuery({
    queryKey: ["clusters-raw", period.start.toISOString()],
    queryFn: async (): Promise<Entry[]> => {
      // Load allied usernames (Piratski poeni saveza) — to ignore.
      const { data: accs } = await supabase
        .from("ikariam_accounts")
        .select("ikariam_username");
      const allied = new Set(
        (accs ?? []).map((a) => a.ikariam_username.trim().toLowerCase()),
      );

      // Paginated highscore entries for period.
      const PAGE = 1000;
      let from = 0;
      type Raw = {
        rank: number;
        ikariam_username: string;
        pirate_points: number;
        alliance_tag: string | null;
        coordinates: string | null;
        city_name: string | null;
        created_at: string;
      };
      const all: Raw[] = [];
      while (from < 50_000) {
        const { data, error } = await supabase
          .from("highscore_entries")
          .select(
            "rank, ikariam_username, pirate_points, alliance_tag, coordinates, city_name, created_at",
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

      // Dedup by username — keep most recent entry.
      const seen = new Set<string>();
      const deduped: Raw[] = [];
      for (const r of all) {
        const k = r.ikariam_username.trim().toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        deduped.push(r);
      }

      // Filter and map.
      const out: Entry[] = [];
      for (const r of deduped) {
        if (!r.coordinates || !r.pirate_points || !r.ikariam_username) continue;
        const uname = r.ikariam_username.trim();
        if (!uname) continue;
        if (allied.has(uname.toLowerCase())) continue;
        if ((r.alliance_tag ?? "").trim().toLowerCase() === "baun") continue;
        const xy = parseCoords(r.coordinates);
        if (!xy) continue;
        out.push({
          rank: r.rank,
          ikariam_username: uname,
          pirate_points: r.pirate_points,
          alliance_tag: r.alliance_tag,
          coordinates: r.coordinates,
          city_name: r.city_name,
          x: xy.x,
          y: xy.y,
        });
      }
      return out;
    },
  });
}

function buildClusters(entries: Entry[], radius: number): Cluster[] {
  const map = new Map<string, Cluster>();
  for (let i = 0; i < entries.length; i++) {
    const seed = entries[i];
    const members: Entry[] = [];
    for (let j = 0; j < entries.length; j++) {
      const e = entries[j];
      if (
        Math.abs(seed.x - e.x) <= radius &&
        Math.abs(seed.y - e.y) <= radius
      ) {
        members.push(e);
      }
    }
    if (members.length < 2) continue;
    // Build dedup key from sorted username|coords pairs.
    const key = members
      .map((m) => `${m.ikariam_username.toLowerCase()}@${m.coordinates}`)
      .sort()
      .join("|");
    if (map.has(key)) continue;
    const total = members.reduce((s, m) => s + m.pirate_points, 0);
    const xs = members.map((m) => m.x);
    const ys = members.map((m) => m.y);
    map.set(key, {
      key,
      shortKey: hashKey(key),
      total,
      players: members.slice().sort((a, b) => b.pirate_points - a.pirate_points),
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    });
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

function ClustersPage() {
  const cur = getCurrentPeriod();
  const prev = getPreviousPeriod();
  const [radiusInput, setRadiusInput] = useState("3");
  const [radius, setRadius] = useState(3);

  // Debounce.
  useEffect(() => {
    const t = setTimeout(() => {
      const n = Number(radiusInput);
      if (Number.isFinite(n) && n >= 0 && n <= 99) setRadius(Math.floor(n));
    }, 300);
    return () => clearTimeout(t);
  }, [radiusInput]);

  return (
    <div>
      <PageHeader
        title="Piratski klasteri"
        description="Pronađi gdje se nalazi najveća koncentracija piratskih poena u blizini — na osnovu koordinata iz Highscore liste. Igrači iz BAUN saveza i nalozi iz 'Piratski poeni saveza' su isključeni."
      />

      <div className="pirate-card rounded-2xl p-4 mb-4 flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <Label htmlFor="radius" className="text-xs uppercase tracking-widest text-muted-foreground">
            Radius koordinata (±)
          </Label>
          <Input
            id="radius"
            type="number"
            min={0}
            max={99}
            value={radiusInput}
            onChange={(e) => setRadiusInput(e.target.value)}
            className="mt-1 sm:w-40"
          />
          <div className="text-[11px] text-muted-foreground mt-1">
            Dva igrača su u istom klasteru ako su i x i y razlika ≤ radius.
          </div>
        </div>
      </div>

      <Tabs defaultValue="current">
        <TabsList className="mb-4">
          <TabsTrigger value="current">Trenutna lista</TabsTrigger>
          <TabsTrigger value="previous">Prethodna lista</TabsTrigger>
        </TabsList>
        <TabsContent value="current">
          <ClusterList period={cur} radius={radius} label="Trenutni period" />
        </TabsContent>
        <TabsContent value="previous">
          <ClusterList period={prev} radius={radius} label="Prethodni period" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ClusterList({
  period,
  radius,
  label,
}: {
  period: Period;
  radius: number;
  label: string;
}) {
  const { data, isLoading } = useClusterData(period);
  const clusters = useMemo(
    () => (data ? buildClusters(data, radius) : []),
    [data, radius],
  );

  return (
    <div>
      <div className="text-xs text-muted-foreground mb-3">
        {label}: {period.start.toLocaleString("bs-BA")} →{" "}
        {period.end.toLocaleString("bs-BA")}
        {data ? ` · ${data.length} igrača u analizi` : ""}
      </div>

      {isLoading ? (
        <div className="pirate-card rounded-2xl p-6 text-sm text-muted-foreground">
          Učitavam...
        </div>
      ) : clusters.length === 0 ? (
        <div className="pirate-card rounded-2xl p-8 text-center text-sm text-muted-foreground">
          Nema klastera sa najmanje 2 igrača za odabrani radius.
        </div>
      ) : (
        <div className="space-y-4">
          {clusters.map((c) => (
            <ClusterCard
              key={c.key}
              cluster={c}
              radius={radius}
              period={period}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ClusterCard({
  cluster,
  radius,
  period,
}: {
  cluster: Cluster;
  radius: number;
  period: Period;
}) {
  const qc = useQueryClient();
  const relations = useRelationMap();
  const { data: me } = useCurrentUser();
  const isPirate =
    !!me?.roles.includes("admin") || !!me?.roles.includes("glavni_pirat");

  const enRouteFn = useServerFn(clusterSetEnRoute);
  const cancelFn = useServerFn(clusterCancelEnRoute);
  const collectFn = useServerFn(clusterCollect);

  const base = {
    period_start: period.start.toISOString(),
    radius,
    cluster_key: cluster.shortKey,
  };

  const statusQ = useQuery({
    queryKey: ["cluster-status", base.period_start, radius, cluster.shortKey],
    queryFn: async () => {
      const { data } = await supabase
        .from("pirate_cluster_status")
        .select("status, assigned_pirate_name")
        .eq("period_start", base.period_start)
        .eq("radius", radius)
        .eq("cluster_key", cluster.shortKey)
        .maybeSingle();
      return data ?? null;
    },
  });

  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["cluster-status", base.period_start, radius, cluster.shortKey] });

  const enRouteMut = useMutation({
    mutationFn: (pirate_name?: string) => enRouteFn({ data: { ...base, pirate_name } }),
    onSuccess: (r: any) => {
      toast.success(`Krenuo: ${r?.assigned_pirate_name ?? "—"}`);
      refresh();
    },
    onError: (e: any) => toast.error("Greška", { description: e?.message }),
  });
  const cancelMut = useMutation({
    mutationFn: () => cancelFn({ data: base }),
    onSuccess: () => {
      toast.success("Assignment otkazan.");
      refresh();
    },
    onError: (e: any) => toast.error("Greška", { description: e?.message }),
  });
  const collectMut = useMutation({
    mutationFn: () => collectFn({ data: base }),
    onSuccess: () => {
      toast.success("Klaster označen kao pokupljen.");
      refresh();
    },
    onError: (e: any) => toast.error("Greška", { description: e?.message }),
  });

  const status = statusQ.data?.status ?? "ready";
  const protectedTags = cluster.players
    .map((p) => ({ tag: p.alliance_tag, rel: relationOf(relations, p.alliance_tag) }))
    .filter((x) => x.rel === "protected")
    .map((x) => x.tag as string);
  const uniqueProtected = Array.from(new Set(protectedTags));
  const warning = uniqueProtected.length
    ? `U ovom klasteru se nalaze igrači iz ZABRANJENIH saveza (${uniqueProtected.join(", ")}). Da li si siguran da želiš krenuti?`
    : undefined;

  return (
    <div className="pirate-card rounded-2xl overflow-hidden">
      <div className="p-4 border-b border-border bg-card/40 flex flex-wrap gap-4 items-center">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Total poena
          </div>
          <div className="font-display text-2xl text-gold tabular-nums">
            {cluster.total.toLocaleString("bs-BA")}
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Users className="size-4 text-gold/80" />
          <span className="tabular-nums">{cluster.players.length}</span>
          <span className="text-muted-foreground">igrača</span>
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground">Radius:</span>{" "}
          <span className="text-gold">±{radius}</span>
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground">Područje:</span>{" "}
          <span className="tabular-nums">
            {cluster.minX}:{cluster.minY} – {cluster.maxX}:{cluster.maxY}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="text-right">
            <StatusBadge status={status} />
            {status === "en_route" && (
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {statusQ.data?.assigned_pirate_name ?? "—"}
              </div>
            )}
          </div>
          {status === "en_route" ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={cancelMut.isPending}
              onClick={() => cancelMut.mutate()}
            >
              Otkaži
            </Button>
          ) : (
            <AssignDialog
              targetLabel={`Klaster ${cluster.minX}:${cluster.minY} – ${cluster.maxX}:${cluster.maxY} (${cluster.players.length} igrača)`}
              loading={enRouteMut.isPending}
              warning={warning}
              onConfirm={(name) => enRouteMut.mutate(name)}
            />
          )}
          {isPirate && (
            <Button
              size="sm"
              disabled={collectMut.isPending || status === "collected"}
              onClick={() => collectMut.mutate()}
            >
              <Coins className="size-3.5 mr-1.5" />
              Pokupi
            </Button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-muted-foreground bg-card/20">
            <tr>
              <th className="text-right py-2.5 pl-4 pr-2 w-16">Rank</th>
              <th className="text-left py-2.5 px-2">Username</th>
              <th className="text-left py-2.5 px-2">Savez</th>
              <th className="text-right py-2.5 px-2">Poeni</th>
              <th className="text-left py-2.5 px-2">Koordinate</th>
              <th className="text-left py-2.5 pr-4 pl-2">Grad</th>
            </tr>
          </thead>
          <tbody>
            {cluster.players.map((p) => (
              <tr
                key={`${p.ikariam_username}-${p.coordinates}`}
                className="border-t border-border hover:bg-card/60"
              >
                <td className="py-2 pl-4 pr-2 text-right font-display text-gold">
                  #{p.rank}
                </td>
                <td className="py-2 px-2 font-medium truncate max-w-[16rem]">
                  {p.ikariam_username}
                </td>
                <td className="py-2 px-2">
                  <AllianceBadge
                    tag={p.alliance_tag}
                    relation={relationOf(relations, p.alliance_tag)}
                  />
                </td>
                <td className="py-2 px-2 text-right tabular-nums">
                  {p.pirate_points.toLocaleString("bs-BA")}
                </td>
                <td className="py-2 px-2">
                  <CoordsLink coords={p.coordinates} />
                </td>
                <td className="py-2 pr-4 pl-2 text-muted-foreground truncate max-w-[12rem]">
                  {p.city_name ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

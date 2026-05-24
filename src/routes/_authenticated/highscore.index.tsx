import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CoordsLink } from "@/components/coords-link";
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

function useHighscore(period: Period) {
  return useQuery({
    queryKey: ["highscore", period.start.toISOString()],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("highscore_entries")
        .select(
          "rank, ikariam_username, pirate_points, alliance_tag, coordinates, city_name, submitted_by_user_id, created_at",
        )
        .gte("period_start", period.start.toISOString())
        .lt("period_start", period.end.toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Dedupe by (rank, username) — keep most recent (data already ordered desc by created_at)
      const seen = new Set<string>();
      const deduped: typeof data = [];
      for (const r of data) {
        const k = `${r.rank}::${r.ikariam_username.toLowerCase()}`;
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
  const { data, isLoading } = useHighscore(period);
  const [search, setSearch] = useState("");
  const [minR, setMinR] = useState("");
  const [maxR, setMaxR] = useState("");

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
    return xs;
  }, [data, search, minR, maxR]);

  return (
    <div>
      <div className="text-xs text-muted-foreground mb-3">
        {label}: {period.start.toLocaleString("bs-BA")} →{" "}
        {period.end.toLocaleString("bs-BA")}
      </div>

      <div className="pirate-card rounded-2xl p-4 mb-4 flex flex-col sm:flex-row gap-3">
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
          className="sm:w-32"
        />
        <Input
          type="number"
          placeholder="Max rank"
          value={maxR}
          onChange={(e) => setMaxR(e.target.value)}
          className="sm:w-32"
        />
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
                  <th className="text-right py-2.5 pr-4 pl-2">Uneseno</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
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
                    <td className="py-2 px-2 text-muted-foreground">
                      {r.alliance_tag ?? "—"}
                    </td>
                    <td className="py-2 px-2">
                      <CoordsLink coords={r.coordinates ?? ""} />
                    </td>
                    <td className="py-2 px-2 text-muted-foreground truncate max-w-[12rem]">
                      {r.city_name ?? "—"}
                    </td>
                    <td className="py-2 pr-4 pl-2 text-right text-[10px] text-muted-foreground">
                      <div className="text-gold/80">{r.submitted_by}</div>
                      <div>{new Date(r.created_at).toLocaleString("bs-BA")}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

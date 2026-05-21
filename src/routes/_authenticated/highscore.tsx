import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getCurrentPeriod, getPreviousPeriod, type Period } from "@/lib/period";

export const Route = createFileRoute("/_authenticated/highscore")({
  component: HighscoreListPage,
});

interface Row {
  rank: number;
  ikariam_username: string;
  pirate_points: number;
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
          "rank, ikariam_username, pirate_points, submitted_by_user_id, created_at",
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
      xs = xs.filter((r) => r.ikariam_username.toLowerCase().includes(q));
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
            placeholder="Pretraži username..."
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

      <div className="space-y-2">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Učitavam...</div>
        ) : rows.length === 0 ? (
          <div className="pirate-card rounded-xl p-8 text-center text-sm text-muted-foreground">
            Nema unosa za ovaj period.
          </div>
        ) : (
          rows.map((r) => (
            <div
              key={`${r.rank}-${r.ikariam_username}`}
              className="grid grid-cols-12 items-center gap-3 px-4 py-2.5 rounded-lg bg-card/60 border border-border hover:border-gold/30 transition"
            >
              <div className="col-span-2 sm:col-span-1 font-display text-gold text-lg">
                #{r.rank}
              </div>
              <div className="col-span-6 sm:col-span-5 min-w-0">
                <div className="font-medium truncate">{r.ikariam_username}</div>
              </div>
              <div className="col-span-4 sm:col-span-2 text-right font-display text-base">
                {r.pirate_points.toLocaleString("bs-BA")}
              </div>
              <div className="col-span-12 sm:col-span-4 text-right text-xs text-muted-foreground">
                <span className="text-gold/80">{r.submitted_by}</span>
                {" · "}
                {new Date(r.created_at).toLocaleString("bs-BA")}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CoordsLink } from "@/components/coords-link";
import { useActiveRound } from "@/hooks/use-target-status";
import { formatSarajevo } from "@/lib/period";

export const Route = createFileRoute("/_authenticated/performance")({
  component: PerformancePage,
  head: () => ({
    meta: [
      { title: "Piratski učinak | BAUN Pirate Tracker" },
      {
        name: "description",
        content:
          "Ko je koliko piratskih poena pokupio — leaderboard i istorija pokupljenih meta po ciklusu.",
      },
      { property: "og:title", content: "Piratski učinak | BAUN Pirate Tracker" },
      {
        property: "og:description",
        content: "Leaderboard pirata i istorija pokupljenih piratskih poena.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

interface EventRow {
  id: string;
  pirate_round_id: string | null;
  collected_by_name: string;
  target_username: string;
  target_coordinates: string | null;
  target_alliance: string | null;
  pirate_points_collected: number;
  source: string | null;
  collected_at: string;
}

function useCollectionEvents(scope: "round" | "all", roundId: string | null) {
  return useQuery({
    queryKey: ["collection-events", scope, roundId],
    queryFn: async (): Promise<EventRow[]> => {
      let q = supabase
        .from("pirate_collection_events")
        .select(
          "id, pirate_round_id, collected_by_name, target_username, target_coordinates, target_alliance, pirate_points_collected, source, collected_at",
        )
        .order("collected_at", { ascending: false })
        .limit(2000);
      if (scope === "round") {
        q = roundId ? q.eq("pirate_round_id", roundId) : q.is("pirate_round_id", null);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
  });
}

function PerformancePage() {
  const round = useActiveRound();
  const [scope, setScope] = useState<"round" | "all">("round");
  const [search, setSearch] = useState("");
  const { data, isLoading } = useCollectionEvents(scope, round.data?.id ?? null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter(
      (r) =>
        r.collected_by_name.toLowerCase().includes(q) ||
        r.target_username.toLowerCase().includes(q),
    );
  }, [data, search]);

  const leaderboard = useMemo(() => {
    const m = new Map<string, { name: string; points: number; count: number }>();
    for (const r of rows) {
      const k = r.collected_by_name.trim().toLowerCase();
      const cur = m.get(k) ?? { name: r.collected_by_name, points: 0, count: 0 };
      cur.points += r.pirate_points_collected ?? 0;
      cur.count += 1;
      m.set(k, cur);
    }
    return Array.from(m.values()).sort(
      (a, b) => b.points - a.points || b.count - a.count,
    );
  }, [rows]);

  return (
    <div>
      <PageHeader
        title="Piratski učinak"
        description="Ko je koliko poena pokupio, i sa kojih meta. Istorija se čuva i nakon reseta ciklusa."
      />

      <div className="pirate-card rounded-2xl p-4 mb-4 flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Pretraži po pirati ili meti..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        <Select value={scope} onValueChange={(v) => setScope(v as "round" | "all")}>
          <SelectTrigger className="sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="round">Trenutni ciklus</SelectItem>
            <SelectItem value="all">Cijela istorija</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {round.data && scope === "round" && (
        <div className="text-xs text-muted-foreground mb-4">
          Ciklus: {formatSarajevo(new Date(round.data.starts_at))} →{" "}
          {formatSarajevo(new Date(round.data.ends_at))}
        </div>
      )}

      <Tabs defaultValue="leaderboard">
        <TabsList className="mb-4">
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="history">Istorija</TabsTrigger>
        </TabsList>

        <TabsContent value="leaderboard">
          <div className="pirate-card rounded-2xl overflow-hidden">
            {isLoading ? (
              <div className="p-6 text-sm text-muted-foreground">Učitavam...</div>
            ) : leaderboard.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                <Trophy className="size-6 mx-auto mb-3 text-gold/70" />
                Još nema pokupljenih poena.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-widest text-muted-foreground bg-card/30">
                  <tr>
                    <th className="text-right py-2.5 pl-4 pr-2 w-16">#</th>
                    <th className="text-left py-2.5 px-2">Pirat</th>
                    <th className="text-right py-2.5 px-2">Pokupljeno poena</th>
                    <th className="text-right py-2.5 pr-4 pl-2">Broj meta</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((r, i) => (
                    <tr key={r.name + i} className="border-t border-border hover:bg-card/60">
                      <td className="py-2 pl-4 pr-2 text-right font-display text-gold">
                        {i + 1}
                      </td>
                      <td className="py-2 px-2 font-medium">{r.name}</td>
                      <td className="py-2 px-2 text-right font-display text-gold tabular-nums">
                        {r.points.toLocaleString("bs-BA")}
                      </td>
                      <td className="py-2 pr-4 pl-2 text-right tabular-nums">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="history">
          <div className="pirate-card rounded-2xl overflow-hidden">
            {isLoading ? (
              <div className="p-6 text-sm text-muted-foreground">Učitavam...</div>
            ) : rows.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Nema zapisa.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[10px] uppercase tracking-widest text-muted-foreground bg-card/30">
                    <tr>
                      <th className="text-left py-2.5 pl-4 pr-2">Vrijeme</th>
                      <th className="text-left py-2.5 px-2">Pirat</th>
                      <th className="text-left py-2.5 px-2">Meta</th>
                      <th className="text-left py-2.5 px-2">Koordinate</th>
                      <th className="text-left py-2.5 px-2">Savez</th>
                      <th className="text-right py-2.5 pr-4 pl-2">Poeni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t border-border hover:bg-card/60">
                        <td className="py-2 pl-4 pr-2 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(r.collected_at).toLocaleString("bs-BA")}
                        </td>
                        <td className="py-2 px-2 font-medium">{r.collected_by_name}</td>
                        <td className="py-2 px-2 truncate max-w-[14rem]">
                          {r.target_username}
                        </td>
                        <td className="py-2 px-2">
                          <CoordsLink coords={r.target_coordinates ?? ""} />
                        </td>
                        <td className="py-2 px-2 text-muted-foreground">
                          {r.target_alliance ?? "—"}
                        </td>
                        <td className="py-2 pr-4 pl-2 text-right font-display text-gold tabular-nums">
                          {(r.pirate_points_collected ?? 0).toLocaleString("bs-BA")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

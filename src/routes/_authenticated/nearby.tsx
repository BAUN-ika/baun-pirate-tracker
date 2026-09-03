import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Compass } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CoordsLink, validCoords } from "@/components/coords-link";
import { AllianceBadge, relationOf, useRelationMap } from "@/components/alliance-badge";
import { getCurrentPeriod, getPreviousPeriod } from "@/lib/period";

export const Route = createFileRoute("/_authenticated/nearby")({
  component: NearbyPage,
  head: () => ({
    meta: [
      { title: "Najbliži piratski poeni | BAUN Pirate Tracker" },
      {
        name: "description",
        content:
          "Unesi koordinate i pronađi najbliže mete sa piratskim poenima, sortirane od najbližih ka najdaljim.",
      },
      { property: "og:title", content: "Najbliži piratski poeni | BAUN Pirate Tracker" },
      {
        property: "og:description",
        content: "Pretraga meta sa piratskim poenima po udaljenosti od zadatih koordinata.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Source = "highscore" | "alliance";

interface Candidate {
  key: string;
  username: string;
  points: number;
  alliance_tag: string | null;
  coordinates: string;
  city_name: string | null;
  rank: number | null;
  source: Source;
  x: number;
  y: number;
}

function parseCoords(c: string | null | undefined) {
  if (!c) return null;
  const m = c.trim().match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m) return null;
  return { x: +m[1], y: +m[2] };
}

function useCandidates() {
  const cur = getCurrentPeriod();
  const prev = getPreviousPeriod();
  return useQuery({
    queryKey: ["nearby-candidates", cur.start.toISOString()],
    queryFn: async (): Promise<Candidate[]> => {
      const out: Candidate[] = [];

      // 1) Savezni nalozi ("Piratski poeni saveza")
      const { data: accs } = await supabase
        .from("ikariam_accounts")
        .select("id, ikariam_username, current_pirate_points, fortress_coordinates");
      for (const a of accs ?? []) {
        const xy = parseCoords(a.fortress_coordinates);
        if (!xy) continue;
        out.push({
          key: `acc-${a.id}`,
          username: a.ikariam_username,
          points: a.current_pirate_points ?? 0,
          alliance_tag: "BAUN",
          coordinates: a.fortress_coordinates as string,
          city_name: null,
          rank: null,
          source: "alliance",
          ...xy,
        });
      }

      // 2) Highscore lista (trenutni period, fallback prethodni)
      const loadHs = async (startISO: string, endISO: string) => {
        const PAGE = 1000;
        let from = 0;
        const all: any[] = [];
        while (from < 50_000) {
          const { data, error } = await supabase
            .from("highscore_entries")
            .select(
              "rank, ikariam_username, pirate_points, alliance_tag, coordinates, city_name, created_at",
            )
            .gte("period_start", startISO)
            .lt("period_start", endISO)
            .order("created_at", { ascending: false })
            .range(from, from + PAGE - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          all.push(...data);
          if (data.length < PAGE) break;
          from += PAGE;
        }
        return all;
      };

      let hs = await loadHs(cur.start.toISOString(), cur.end.toISOString());
      if (hs.length === 0)
        hs = await loadHs(prev.start.toISOString(), prev.end.toISOString());

      const seen = new Set(out.map((o) => o.username.trim().toLowerCase()));
      for (const r of hs) {
        const uname = (r.ikariam_username ?? "").trim();
        if (!uname) continue;
        const k = uname.toLowerCase();
        if (seen.has(k)) continue;
        const xy = parseCoords(r.coordinates);
        if (!xy) continue;
        seen.add(k);
        out.push({
          key: `hs-${k}`,
          username: uname,
          points: r.pirate_points ?? 0,
          alliance_tag: r.alliance_tag ?? null,
          coordinates: r.coordinates,
          city_name: r.city_name ?? null,
          rank: r.rank ?? null,
          source: "highscore",
          ...xy,
        });
      }

      return out;
    },
  });
}

function NearbyPage() {
  const [coords, setCoords] = useState("");
  const [source, setSource] = useState<"all" | Source>("all");
  const [onlyPositive, setOnlyPositive] = useState(true);
  const relations = useRelationMap();
  const { data, isLoading } = useCandidates();

  const origin = validCoords(coords.trim()) ? parseCoords(coords.trim()) : null;

  const rows = useMemo(() => {
    if (!origin) return [];
    let xs = data ?? [];
    if (source !== "all") xs = xs.filter((c) => c.source === source);
    if (onlyPositive) xs = xs.filter((c) => c.points > 0);
    return xs
      .map((c) => {
        const dx = c.x - origin.x;
        const dy = c.y - origin.y;
        return {
          ...c,
          dist: Math.sqrt(dx * dx + dy * dy),
          cheb: Math.max(Math.abs(dx), Math.abs(dy)),
        };
      })
      .sort((a, b) => a.dist - b.dist || b.points - a.points)
      .slice(0, 300);
  }, [data, origin?.x, origin?.y, source, onlyPositive]);

  return (
    <div>
      <PageHeader
        title="Najbliži poeni"
        description="Unesi koordinate i dobij listu meta sortiranu od najbližih ka najdaljim — iz Highscore liste i iz Piratskih poena saveza."
      />

      <div className="pirate-card rounded-2xl p-4 mb-4 flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="sm:w-56">
          <Label htmlFor="origin" className="text-xs uppercase tracking-widest text-muted-foreground">
            Moje koordinate (N:N)
          </Label>
          <Input
            id="origin"
            placeholder="npr. 42:57"
            value={coords}
            onChange={(e) => setCoords(e.target.value)}
            className="mt-1"
          />
          {coords.trim() !== "" && !origin && (
            <div className="text-[11px] text-destructive mt-1">
              Format mora biti N:N (1–99).
            </div>
          )}
        </div>
        <div className="sm:w-56">
          <Label className="text-xs uppercase tracking-widest text-muted-foreground">
            Izvor
          </Label>
          <Select value={source} onValueChange={(v) => setSource(v as any)}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Sve mete</SelectItem>
              <SelectItem value="highscore">Highscore lista</SelectItem>
              <SelectItem value="alliance">Piratski poeni saveza</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground pb-2">
          <input
            type="checkbox"
            checked={onlyPositive}
            onChange={(e) => setOnlyPositive(e.target.checked)}
            className="accent-[hsl(var(--gold,45_90%_55%))]"
          />
          Samo mete sa poenima
        </label>
      </div>

      {!origin ? (
        <div className="pirate-card rounded-2xl p-10 text-center text-sm text-muted-foreground">
          <Compass className="size-6 mx-auto mb-3 text-gold/70" />
          Unesi koordinate da vidiš najbliže mete.
        </div>
      ) : isLoading ? (
        <div className="pirate-card rounded-2xl p-6 text-sm text-muted-foreground">
          Učitavam...
        </div>
      ) : rows.length === 0 ? (
        <div className="pirate-card rounded-2xl p-10 text-center text-sm text-muted-foreground">
          Nema meta sa validnim koordinatama za ovaj filter.
        </div>
      ) : (
        <div className="pirate-card rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border text-xs text-muted-foreground">
            Polazna tačka: <span className="text-gold tabular-nums">{coords.trim()}</span> ·{" "}
            {rows.length} meta prikazano
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-muted-foreground bg-card/30">
                <tr>
                  <th className="text-left py-2.5 pl-4 pr-2">Udaljenost</th>
                  <th className="text-left py-2.5 px-2">Koordinate</th>
                  <th className="text-left py-2.5 px-2">Username</th>
                  <th className="text-right py-2.5 px-2">Poeni</th>
                  <th className="text-left py-2.5 px-2">Savez</th>
                  <th className="text-left py-2.5 px-2">Grad</th>
                  <th className="text-right py-2.5 px-2">Rank</th>
                  <th className="text-left py-2.5 pr-4 pl-2">Izvor</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-t border-border hover:bg-card/60">
                    <td className="py-2 pl-4 pr-2">
                      <span className="font-display text-gold tabular-nums">
                        {r.dist.toFixed(1)}
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-1.5">
                        (±{r.cheb})
                      </span>
                    </td>
                    <td className="py-2 px-2">
                      <CoordsLink coords={r.coordinates} />
                    </td>
                    <td className="py-2 px-2 font-medium truncate max-w-[16rem]">
                      {r.username}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {r.points.toLocaleString("bs-BA")}
                    </td>
                    <td className="py-2 px-2">
                      <AllianceBadge
                        tag={r.alliance_tag}
                        relation={relationOf(relations, r.alliance_tag)}
                      />
                    </td>
                    <td className="py-2 px-2 text-muted-foreground truncate max-w-[12rem]">
                      {r.city_name ?? "—"}
                    </td>
                    <td className="py-2 px-2 text-right text-muted-foreground tabular-nums">
                      {r.rank ? `#${r.rank}` : "—"}
                    </td>
                    <td className="py-2 pr-4 pl-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                      {r.source === "alliance" ? "Savez" : "Highscore"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

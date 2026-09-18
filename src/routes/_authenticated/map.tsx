import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, Map as MapIcon, ZoomIn, ZoomOut, SlidersHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CoordsLink } from "@/components/coords-link";
import {
  AllianceBadge,
  StatusBadge,
  useEffectiveRelation,
  RELATION_LABEL,
  type RelationType,
} from "@/components/alliance-badge";
import { statusOf, useTargetStatusMap, effectivePoints } from "@/hooks/use-target-status";
import { getCurrentPeriod, getPreviousPeriod, type Period } from "@/lib/period";

export const Route = createFileRoute("/_authenticated/map")({
  component: PirateMapPage,
  head: () => ({
    meta: [
      { title: "Piratska mapa · BAUN Pirate Tracker" },
      {
        name: "description",
        content:
          "Interaktivna 100x100 mapa Ikariam koordinata sa hotspotovima piratskih poena saveza BAUN.",
      },
      { property: "og:title", content: "Piratska mapa · BAUN Pirate Tracker" },
      {
        property: "og:description",
        content: "Vizuelna heatmap mapa piratskih poena po Ikariam koordinatama.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

/* ------------------------------ podaci ------------------------------ */

interface Entry {
  rank: number;
  ikariam_username: string;
  pirate_points: number;
  alliance_tag: string | null;
  coordinates: string | null;
  city_name: string | null;
}

function useMapEntries(period: Period) {
  return useQuery({
    queryKey: ["highscore", "map", period.start.toISOString()],
    queryFn: async (): Promise<Entry[]> => {
      const PAGE = 1000;
      let from = 0;
      const all: Entry[] = [];
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
        all.push(...(data as unknown as Entry[]));
        if (data.length < PAGE) break;
        from += PAGE;
      }
      const seen = new Set<string>();
      const out: Entry[] = [];
      for (const e of all) {
        const k = e.ikariam_username.trim().toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(e);
      }
      return out;
    },
  });
}

/* ------------------------------ agregacija ------------------------------ */

type RelKey = RelationType | "other";

const REL_COLOR: Record<RelKey, string> = {
  our_alliance: "var(--gold)",
  deal: "var(--success)",
  protected: "var(--destructive)",
  other: "var(--muted-foreground)",
};

const REL_LABEL: Record<RelKey, string> = {
  ...RELATION_LABEL,
  other: "Ostali",
};

interface MapPlayer {
  username: string;
  points: number;
  alliance_tag: string | null;
  city_name: string | null;
  relation: RelationType | null;
  fromPlayer: boolean;
  relKey: RelKey;
  status: string;
  assigned_pirate_name: string | null;
}

interface Cell {
  key: string;
  x: number;
  y: number;
  total: number;
  players: MapPlayer[];
  byRelation: Record<RelKey, number>;
  dominant: RelKey;
  ready: number;
  en_route: number;
  collected: number;
}

function parseCoords(c: string | null): { x: number; y: number } | null {
  if (!c) return null;
  const m = /^(\d{1,3}):(\d{1,3})$/.exec(c.trim());
  if (!m) return null;
  const x = Number(m[1]);
  const y = Number(m[2]);
  if (x < 1 || x > 100 || y < 1 || y > 100) return null;
  return { x, y };
}

/* ------------------------------ stranica ------------------------------ */

function PirateMapPage() {
  const cur = getCurrentPeriod();
  const prev = getPreviousPeriod();

  return (
    <div>
      <PageHeader
        title="Piratska mapa"
        description="Vizuelni prikaz 100x100 Ikariam koordinatnog prostora — hotspotovi piratskih poena, odnosi i statusi meta."
      />
      <Tabs defaultValue="current">
        <TabsList className="mb-4">
          <TabsTrigger value="current">Trenutna lista</TabsTrigger>
          <TabsTrigger value="previous">Prethodna lista</TabsTrigger>
        </TabsList>
        <TabsContent value="current">
          <MapView period={cur} label="Trenutni period" />
        </TabsContent>
        <TabsContent value="previous">
          <MapView period={prev} label="Prethodni period" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const SIZE = 1000; // interni SVG koordinatni prostor
const PAD = 40;

function MapView({ period, label }: { period: Period; label: string }) {
  const { data, isLoading } = useMapEntries(period);
  const { map: statuses } = useTargetStatusMap();
  const effRelation = useEffectiveRelation();

  const [search, setSearch] = useState("");
  const [relFilter, setRelFilter] = useState("all");
  const [allianceFilter, setAllianceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [minPoints, setMinPoints] = useState("");
  const [zoom, setZoom] = useState(1);
  const [showFilters, setShowFilters] = useState(true);
  const [hover, setHover] = useState<{ cell: Cell; left: number; top: number } | null>(null);
  const [selected, setSelected] = useState<Cell | null>(null);

  // raw entries -> relation resolution -> filter -> group -> totals
  const { cells, maxTotal, allianceTags, visibleCount } = useMemo(() => {
    const players: (MapPlayer & { x: number; y: number })[] = [];
    const tags = new Set<string>();

    const q = search.trim().toLowerCase();
    const min = Number(minPoints);

    for (const e of data ?? []) {
      const pos = parseCoords(e.coordinates);
      if (!pos) continue;
      if (e.alliance_tag) tags.add(e.alliance_tag);

      const eff = effRelation(e.ikariam_username, e.alliance_tag);
      const relKey: RelKey = eff.relation ?? "other";
      const st = statusOf(statuses, e.ikariam_username);
      const status = st?.status ?? "ready";
      const points = effectivePoints(statuses, e.ikariam_username, e.pirate_points);

      if (q && !e.ikariam_username.toLowerCase().includes(q)) continue;
      if (relFilter !== "all" && relKey !== relFilter) continue;
      if (allianceFilter !== "all" && (e.alliance_tag ?? "") !== allianceFilter) continue;
      if (statusFilter !== "all" && status !== statusFilter) continue;
      if (minPoints && Number.isFinite(min) && points < min) continue;

      players.push({
        username: e.ikariam_username,
        points,
        alliance_tag: e.alliance_tag,
        city_name: e.city_name,
        relation: eff.relation,
        fromPlayer: eff.fromPlayer,
        relKey,
        status,
        assigned_pirate_name: st?.assigned_pirate_name ?? null,
        x: pos.x,
        y: pos.y,
      });
    }

    const byCell = new Map<string, Cell>();
    for (const p of players) {
      const key = `${p.x}:${p.y}`;
      let c = byCell.get(key);
      if (!c) {
        c = {
          key,
          x: p.x,
          y: p.y,
          total: 0,
          players: [],
          byRelation: { our_alliance: 0, deal: 0, protected: 0, other: 0 },
          dominant: "other",
          ready: 0,
          en_route: 0,
          collected: 0,
        };
        byCell.set(key, c);
      }
      c.total += p.points;
      c.byRelation[p.relKey] += p.points;
      c.players.push(p);
      if (p.status === "en_route") c.en_route += 1;
      else if (p.status === "collected") c.collected += 1;
      else c.ready += 1;
    }

    let max = 0;
    for (const c of byCell.values()) {
      c.players.sort((a, b) => b.points - a.points);
      // dominantni odnos = najviše poena; pri nuli fallback na najčešći
      let best: RelKey = "other";
      let bestVal = -1;
      for (const k of ["our_alliance", "deal", "protected", "other"] as RelKey[]) {
        if (c.byRelation[k] > bestVal) {
          bestVal = c.byRelation[k];
          best = k;
        }
      }
      if (bestVal <= 0) {
        const counts = new Map<RelKey, number>();
        for (const p of c.players) counts.set(p.relKey, (counts.get(p.relKey) ?? 0) + 1);
        let cb: RelKey = "other";
        let cv = -1;
        for (const [k, v] of counts) if (v > cv) ((cv = v), (cb = k));
        best = cb;
      }
      c.dominant = best;
      if (c.total > max) max = c.total;
    }

    return {
      cells: Array.from(byCell.values()).sort((a, b) => a.total - b.total),
      maxTotal: max,
      allianceTags: Array.from(tags).sort((a, b) => a.localeCompare(b)),
      visibleCount: players.length,
    };
  }, [data, statuses, effRelation, search, relFilter, allianceFilter, statusFilter, minPoints]);

  // sqrt/log skala intenziteta (0..1)
  const intensity = (total: number) => {
    if (maxTotal <= 0 || total <= 0) return 0.12;
    const v = Math.log10(1 + total) / Math.log10(1 + maxTotal);
    return Math.min(1, Math.max(0.12, v));
  };

  const px = (x: number) => PAD + ((x - 1) / 99) * (SIZE - 2 * PAD);
  const py = (y: number) => PAD + ((y - 1) / 99) * (SIZE - 2 * PAD);

  const hasCoords = (data ?? []).some((e) => parseCoords(e.coordinates));

  return (
    <div>
      <div className="text-xs text-muted-foreground mb-3">
        {label}: {period.start.toLocaleString("bs-BA")} → {period.end.toLocaleString("bs-BA")}
        {" · "}
        {visibleCount.toLocaleString("bs-BA")} igrača na {cells.length.toLocaleString("bs-BA")}{" "}
        koordinata
      </div>

      {/* filteri */}
      <div className="pirate-card rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between lg:hidden mb-3">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Filteri</div>
          <Button variant="outline" size="sm" onClick={() => setShowFilters((s) => !s)}>
            <SlidersHorizontal className="size-4 mr-2" />
            {showFilters ? "Sakrij" : "Prikaži"}
          </Button>
        </div>
        <div
          className={
            (showFilters ? "flex" : "hidden lg:flex") + " flex-col lg:flex-row gap-3"
          }
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Pretraži username..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={relFilter} onValueChange={setRelFilter}>
            <SelectTrigger className="lg:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Svi odnosi</SelectItem>
              <SelectItem value="our_alliance">Naš savez</SelectItem>
              <SelectItem value="deal">Dogovor</SelectItem>
              <SelectItem value="protected">Zaštićeni</SelectItem>
              <SelectItem value="other">Ostali</SelectItem>
            </SelectContent>
          </Select>
          <Select value={allianceFilter} onValueChange={setAllianceFilter}>
            <SelectTrigger className="lg:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Svi savezi</SelectItem>
              {allianceTags.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="lg:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Svi statusi</SelectItem>
              <SelectItem value="ready">READY</SelectItem>
              <SelectItem value="en_route">EN ROUTE</SelectItem>
              <SelectItem value="collected">POKUPLJENO</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            placeholder="Min poeni"
            value={minPoints}
            onChange={(e) => setMinPoints(e.target.value)}
            className="lg:w-32"
          />
        </div>
      </div>

      {/* legenda + zoom */}
      <div className="pirate-card rounded-2xl p-4 mb-4 flex flex-wrap items-center gap-4 justify-between">
        <div className="flex flex-wrap items-center gap-4">
          {(["our_alliance", "deal", "protected", "other"] as RelKey[]).map((k) => (
            <div key={k} className="flex items-center gap-2 text-xs">
              <span
                className="size-3 rounded-full"
                style={{ background: REL_COLOR[k], boxShadow: `0 0 8px ${REL_COLOR[k]}` }}
              />
              {REL_LABEL[k]}
            </div>
          ))}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-2 rounded-full bg-muted-foreground/40" />
            manje poena
            <span className="w-8 h-2 rounded-full bg-gradient-to-r from-muted-foreground/30 to-gold" />
            <span className="size-3.5 rounded-full bg-gold" />
            više poena
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(1)))}
          >
            <ZoomOut className="size-4" />
          </Button>
          <div className="text-xs tabular-nums w-10 text-center">{zoom.toFixed(1)}x</div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setZoom((z) => Math.min(4, +(z + 0.5).toFixed(1)))}
          >
            <ZoomIn className="size-4" />
          </Button>
        </div>
      </div>

      {/* mapa */}
      <div className="pirate-card rounded-2xl p-3">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Učitavam mapu...</div>
        ) : !hasCoords ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nema dovoljno podataka sa koordinatama za prikaz mape.
          </div>
        ) : cells.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nema igrača koji odgovaraju odabranim filterima.
          </div>
        ) : (
          <div className="relative overflow-auto">
            <div
              className="relative mx-auto"
              style={{ width: `${zoom * 100}%`, maxWidth: zoom === 1 ? "900px" : "none" }}
              onMouseLeave={() => setHover(null)}
            >
              <svg
                viewBox={`0 0 ${SIZE} ${SIZE}`}
                className="w-full h-auto select-none touch-pan-y"
                style={{ aspectRatio: "1 / 1" }}
              >
                <defs>
                  <filter id="pm-glow" x="-80%" y="-80%" width="260%" height="260%">
                    <feGaussianBlur stdDeviation="10" result="b" />
                    <feMerge>
                      <feMergeNode in="b" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                <rect
                  x={PAD}
                  y={PAD}
                  width={SIZE - 2 * PAD}
                  height={SIZE - 2 * PAD}
                  fill="var(--background)"
                  fillOpacity={0.55}
                  stroke="var(--border)"
                />

                {/* grid + labele */}
                {Array.from({ length: 11 }, (_, i) => i * 10).map((v) => {
                  const c = Math.max(1, v);
                  const gx = px(c);
                  const gy = py(c);
                  return (
                    <g key={v}>
                      <line
                        x1={gx}
                        y1={PAD}
                        x2={gx}
                        y2={SIZE - PAD}
                        stroke="var(--border)"
                        strokeOpacity={v % 20 === 0 ? 0.55 : 0.28}
                      />
                      <line
                        x1={PAD}
                        y1={gy}
                        x2={SIZE - PAD}
                        y2={gy}
                        stroke="var(--border)"
                        strokeOpacity={v % 20 === 0 ? 0.55 : 0.28}
                      />
                      <text
                        x={gx}
                        y={PAD - 12}
                        fill="var(--muted-foreground)"
                        fontSize={18}
                        textAnchor="middle"
                      >
                        {c}
                      </text>
                      <text
                        x={PAD - 10}
                        y={gy + 6}
                        fill="var(--muted-foreground)"
                        fontSize={18}
                        textAnchor="end"
                      >
                        {c}
                      </text>
                    </g>
                  );
                })}

                {/* hotspotovi */}
                {cells.map((c) => {
                  const t = intensity(c.total);
                  const color = REL_COLOR[c.dominant];
                  const r = 5 + t * 16;
                  const faded = c.collected === c.players.length;
                  return (
                    <g
                      key={c.key}
                      style={{ cursor: "pointer" }}
                      opacity={faded ? 0.45 : 1}
                      onMouseEnter={(ev) => {
                        const host = (ev.currentTarget.ownerSVGElement?.parentElement ??
                          null) as HTMLElement | null;
                        const box = host?.getBoundingClientRect();
                        setHover({
                          cell: c,
                          left: box ? ev.clientX - box.left : 0,
                          top: box ? ev.clientY - box.top : 0,
                        });
                      }}
                      onMouseMove={(ev) => {
                        const host = (ev.currentTarget.ownerSVGElement?.parentElement ??
                          null) as HTMLElement | null;
                        const box = host?.getBoundingClientRect();
                        setHover((h) =>
                          h && h.cell.key === c.key
                            ? {
                                cell: c,
                                left: box ? ev.clientX - box.left : 0,
                                top: box ? ev.clientY - box.top : 0,
                              }
                            : h,
                        );
                      }}
                      onClick={() => setSelected(c)}
                    >
                      <circle
                        cx={px(c.x)}
                        cy={py(c.y)}
                        r={r * 2.4}
                        fill={color}
                        opacity={0.1 + t * 0.22}
                        filter="url(#pm-glow)"
                      />
                      <circle
                        cx={px(c.x)}
                        cy={py(c.y)}
                        r={r}
                        fill={color}
                        opacity={0.35 + t * 0.6}
                      />
                      <circle
                        cx={px(c.x)}
                        cy={py(c.y)}
                        r={r}
                        fill="none"
                        stroke={color}
                        strokeOpacity={0.9}
                        strokeWidth={1.5}
                      />
                      {/* multi-relation prsten */}
                      {Object.values(c.byRelation).filter((v) => v > 0).length > 1 && (
                        <circle
                          cx={px(c.x)}
                          cy={py(c.y)}
                          r={r + 4}
                          fill="none"
                          stroke="var(--foreground)"
                          strokeOpacity={0.5}
                          strokeDasharray="4 4"
                          strokeWidth={1}
                        />
                      )}
                      {c.en_route > 0 && (
                        <circle
                          cx={px(c.x) + r + 3}
                          cy={py(c.y) - r - 3}
                          r={4}
                          fill="var(--gold)"
                          stroke="var(--background)"
                        />
                      )}
                      {c.collected > 0 && (
                        <text
                          x={px(c.x) - r - 5}
                          y={py(c.y) - r - 2}
                          fontSize={16}
                          fill="var(--muted-foreground)"
                          textAnchor="middle"
                        >
                          ✓
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>

              {hover && (
                <div
                  className="pointer-events-none absolute z-20 w-64 max-h-64 overflow-hidden rounded-xl border border-gold/30 bg-popover/95 p-3 text-xs shadow-xl"
                  style={{
                    left: Math.max(4, hover.left + 12),
                    top: Math.max(4, hover.top + 12),
                  }}
                >
                  <div className="font-display text-gold text-sm">{hover.cell.key}</div>
                  <div className="text-muted-foreground mb-2">
                    {hover.cell.total.toLocaleString("bs-BA")} ukupno ·{" "}
                    {hover.cell.players.length} igrača
                  </div>
                  <div className="space-y-1.5">
                    {hover.cell.players.slice(0, 6).map((p) => (
                      <div key={p.username} className="border-t border-border pt-1.5">
                        <div className="flex justify-between gap-2">
                          <span className="truncate font-medium">{p.username}</span>
                          <span className="tabular-nums">
                            {p.points.toLocaleString("bs-BA")}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {p.alliance_tag ?? "—"} · {REL_LABEL[p.relKey]} ·{" "}
                          {p.status === "en_route"
                            ? `EN ROUTE · ${p.assigned_pirate_name ?? "—"}`
                            : p.status === "collected"
                              ? "POKUPLJENO"
                              : "READY"}
                        </div>
                      </div>
                    ))}
                    {hover.cell.players.length > 6 && (
                      <div className="text-[10px] text-muted-foreground pt-1">
                        + još {hover.cell.players.length - 6} — klikni za detalje
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <CellDialog cell={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function CellDialog({ cell, onClose }: { cell: Cell | null; onClose: () => void }) {
  return (
    <Dialog open={!!cell} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapIcon className="size-4 text-gold" />
            Koordinate {cell?.key}
          </DialogTitle>
        </DialogHeader>
        {cell && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4 text-sm">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Ukupno poena
                </div>
                <div className="font-display text-gold text-lg tabular-nums">
                  {cell.total.toLocaleString("bs-BA")}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Igrača
                </div>
                <div className="font-display text-lg tabular-nums">{cell.players.length}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Statusi
                </div>
                <div className="text-sm">
                  {cell.ready} ready · {cell.en_route} en route · {cell.collected} pokupljeno
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Ikariam
                </div>
                <CoordsLink coords={cell.key} />
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                Poeni po odnosu
              </div>
              <div className="flex flex-wrap gap-3 text-xs">
                {(["our_alliance", "deal", "protected", "other"] as RelKey[])
                  .filter((k) => cell.byRelation[k] > 0)
                  .map((k) => (
                    <span key={k} className="flex items-center gap-1.5">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ background: REL_COLOR[k] }}
                      />
                      {REL_LABEL[k]}: {cell.byRelation[k].toLocaleString("bs-BA")}
                      {cell.dominant === k ? " (dominantno)" : ""}
                    </span>
                  ))}
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-widest text-muted-foreground bg-card/40">
                  <tr>
                    <th className="text-left py-2 px-3">Username</th>
                    <th className="text-right py-2 px-2">Poeni</th>
                    <th className="text-left py-2 px-2">Savez / odnos</th>
                    <th className="text-left py-2 px-2">Grad</th>
                    <th className="text-left py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {cell.players.map((p) => (
                    <tr key={p.username} className="border-t border-border">
                      <td className="py-2 px-3 font-medium truncate max-w-[12rem]">
                        {p.username}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {p.points.toLocaleString("bs-BA")}
                      </td>
                      <td className="py-2 px-2">
                        <AllianceBadge
                          tag={p.alliance_tag}
                          relation={p.relation}
                          fromPlayer={p.fromPlayer}
                        />
                      </td>
                      <td className="py-2 px-2 text-muted-foreground truncate max-w-[10rem]">
                        {p.city_name ?? "—"}
                      </td>
                      <td className="py-2 px-3">
                        <StatusBadge status={p.status} />
                        {p.status === "en_route" && (
                          <div className="text-[10px] text-muted-foreground">
                            {p.assigned_pirate_name ?? "—"}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

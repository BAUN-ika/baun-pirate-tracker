import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Search,
  Map as MapIcon,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
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
  RELATION_LABEL,
  type RelationType,
} from "@/components/alliance-badge";
import { TargetActions } from "@/components/target-actions";
import { useTargetActions, useTargetStatusMap } from "@/hooks/use-target-status";
import {
  useCurrentTargets,
  type CurrentPirateTarget,
} from "@/hooks/use-current-targets";
import { getCurrentPeriod, getPreviousPeriod, type Period } from "@/lib/period";
import { useRegions, type PirateRegion } from "@/hooks/use-regions";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";

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

const REL_KEYS: RelKey[] = ["our_alliance", "deal", "protected", "other"];

interface Cell {
  key: string;
  x: number;
  y: number;
  total: number;
  players: CurrentPirateTarget[];
  byRelation: Record<RelKey, number>;
  dominant: RelKey;
  ready: number;
  en_route: number;
  collected: number;
}

const relKeyOf = (t: CurrentPirateTarget): RelKey => t.effective_relation ?? "other";

/* svijet: 100x100 polja, jedno polje = 10 world jedinica */
const CELL = 10;
const WORLD = 100 * CELL;
const MIN_ZOOM = 1;
const MAX_ZOOM = 7;

const wx = (x: number) => (x - 0.5) * CELL;
const wy = (y: number) => (y - 0.5) * CELL;

function PirateMapPage() {
  const cur = getCurrentPeriod();
  const prev = getPreviousPeriod();

  return (
    <div>
      <PageHeader
        title="Piratska mapa"
        description="Vizuelni prikaz 100x100 Ikariam koordinatnog prostora — hotspotovi piratskih poena, odnosi i statusi meta iz centralnog modela meta."
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

function MapView({ period, label }: { period: Period; label: string }) {
  const { targets, isLoading } = useCurrentTargets(period);
  const { map: statusMap } = useTargetStatusMap();
  const actions = useTargetActions("map");

  const [search, setSearch] = useState("");
  const [relFilter, setRelFilter] = useState("all");
  const [allianceFilter, setAllianceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [minPoints, setMinPoints] = useState("");
  const [showFilters, setShowFilters] = useState(true);
  const [hover, setHover] = useState<{ cell: Cell; left: number; top: number } | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  /* kamera: viewBox nad world prostorom */
  const [zoom, setZoom] = useState(1);
  const [cam, setCam] = useState({ x: 0, y: 0 });
  const hostRef = useRef<HTMLDivElement>(null);
  const camRef = useRef({ zoom: 1, x: 0, y: 0 });
  camRef.current = { zoom, x: cam.x, y: cam.y };

  const view = WORLD / zoom;
  const clamp = (v: number, span: number) => Math.min(Math.max(0, v), WORLD - span);

  const applyZoom = useCallback((next: number, anchor?: { fx: number; fy: number }) => {
    const c = camRef.current;
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    const oldSpan = WORLD / c.zoom;
    const newSpan = WORLD / z;
    const fx = anchor?.fx ?? 0.5;
    const fy = anchor?.fy ?? 0.5;
    const worldX = c.x + fx * oldSpan;
    const worldY = c.y + fy * oldSpan;
    const nx = Math.min(Math.max(0, worldX - fx * newSpan), WORLD - newSpan);
    const ny = Math.min(Math.max(0, worldY - fy * newSpan), WORLD - newSpan);
    setZoom(z);
    setCam({ x: nx, y: ny });
  }, []);

  /* wheel / pinch zoom — non-passive listener */
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const fx = (e.clientX - rect.left) / rect.width;
      const fy = (e.clientY - rect.top) / rect.height;
      const rawDy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const dy = Math.max(-80, Math.min(80, rawDy));
      applyZoom(camRef.current.zoom * Math.exp(-dy * 0.0009), { fx, fy });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  /* pan (drag) + pinch (dva pointera) */
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const pinch = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchDist = useRef<number | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current.size === 1) {
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    } else {
      drag.current = null;
      pinchDist.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const el = hostRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (pinch.current.has(e.pointerId))
      pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinch.current.size >= 2) {
      const [a, b] = Array.from(pinch.current.values());
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist.current != null && pinchDist.current > 0) {
        const fx = ((a.x + b.x) / 2 - rect.left) / rect.width;
        const fy = ((a.y + b.y) / 2 - rect.top) / rect.height;
        applyZoom(camRef.current.zoom * (d / pinchDist.current), { fx, fy });
      }
      pinchDist.current = d;
      return;
    }

    const d0 = drag.current;
    if (!d0 || d0.id !== e.pointerId) return;
    const span = WORLD / camRef.current.zoom;
    const dx = ((e.clientX - d0.x) / rect.width) * span;
    const dy = ((e.clientY - d0.y) / rect.height) * span;
    drag.current = { id: d0.id, x: e.clientX, y: e.clientY };
    setCam((c) => ({
      x: Math.min(Math.max(0, c.x - dx), WORLD - span),
      y: Math.min(Math.max(0, c.y - dy), WORLD - span),
    }));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pinch.current.delete(e.pointerId);
    if (drag.current?.id === e.pointerId) drag.current = null;
    if (pinch.current.size < 2) pinchDist.current = null;
  };

  /* merged targets -> filter -> group by coordinates */
  const { cells, maxTotal, allianceTags, visibleCount, coordCount } = useMemo(() => {
    const tags = new Set<string>();
    const q = search.trim().toLowerCase();
    const min = Number(minPoints);
    const withCoords = targets.filter(
      (t) => t.x != null && t.y != null && t.current_pirate_points > 0,
    );
    for (const t of withCoords) if (t.alliance_tag) tags.add(t.alliance_tag);

    const visible = withCoords.filter((t) => {
      const relKey = relKeyOf(t);
      if (q && !t.username.toLowerCase().includes(q)) return false;
      if (relFilter !== "all" && relKey !== relFilter) return false;
      if (allianceFilter !== "all" && (t.alliance_tag ?? "") !== allianceFilter) return false;
      if (statusFilter !== "all" && t.target_status !== statusFilter) return false;
      if (sourceFilter !== "all" && t.source !== sourceFilter) return false;
      if (minPoints && Number.isFinite(min) && t.current_pirate_points < min) return false;
      return true;
    });

    const byCell = new Map<string, Cell>();
    for (const t of visible) {
      const key = `${t.x}:${t.y}`;
      let c = byCell.get(key);
      if (!c) {
        c = {
          key,
          x: t.x as number,
          y: t.y as number,
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
      c.total += t.current_pirate_points;
      c.byRelation[relKeyOf(t)] += t.current_pirate_points;
      c.players.push(t);
      if (t.target_status === "en_route") c.en_route += 1;
      else if (t.target_status === "collected") c.collected += 1;
      else c.ready += 1;
    }

    let max = 0;
    for (const c of byCell.values()) {
      c.players.sort((a, b) => b.current_pirate_points - a.current_pirate_points);
      let best: RelKey = "other";
      let bestVal = -1;
      for (const k of REL_KEYS) {
        if (c.byRelation[k] > bestVal) {
          bestVal = c.byRelation[k];
          best = k;
        }
      }
      if (bestVal <= 0) {
        const counts = new Map<RelKey, number>();
        for (const p of c.players)
          counts.set(relKeyOf(p), (counts.get(relKeyOf(p)) ?? 0) + 1);
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
      visibleCount: visible.length,
      coordCount: withCoords.length,
    };
  }, [targets, search, relFilter, allianceFilter, statusFilter, sourceFilter, minPoints]);

  const selected = selectedKey ? (cells.find((c) => c.key === selectedKey) ?? null) : null;

  const intensity = (total: number) => {
    if (maxTotal <= 0 || total <= 0) return 0.1;
    const v = Math.log10(1 + total) / Math.log10(1 + maxTotal);
    return Math.min(1, Math.max(0.1, v));
  };

  /* screen-space veličine: world = screen / zoom */
  const s = (screenUnits: number) => screenUnits / zoom;
  const labelStep = zoom >= 5.5 ? 1 : zoom >= 3.5 ? 2 : zoom >= 1.8 ? 5 : 10;

  const xGridLines: number[] = [];
  const yGridLines: number[] = [];
  const startI = Math.max(1, Math.floor(cam.x / CELL) - 1);
  const endI = Math.min(100, Math.ceil((cam.x + view) / CELL) + 1);
  const startJ = Math.max(1, Math.floor(cam.y / CELL) - 1);
  const endJ = Math.min(100, Math.ceil((cam.y + view) / CELL) + 1);
  for (let i = Math.max(0, startI - 1); i <= endI; i++) xGridLines.push(i);
  for (let j = Math.max(0, startJ - 1); j <= endJ; j++) yGridLines.push(j);

  const xLabels: number[] = [];
  for (let i = startI; i <= endI; i++) if (i % labelStep === 0 || i === 1) xLabels.push(i);
  const yLabels: number[] = [];
  for (let j = startJ; j <= endJ; j++) if (j % labelStep === 0 || j === 1) yLabels.push(j);

  return (
    <div>
      <div className="text-xs text-muted-foreground mb-3">
        {label}: {period.start.toLocaleString("bs-BA")} → {period.end.toLocaleString("bs-BA")}
        {" · "}
        {visibleCount.toLocaleString("bs-BA")} / {coordCount.toLocaleString("bs-BA")} meta sa
        koordinatama na {cells.length.toLocaleString("bs-BA")} lokacija
      </div>

      {/* filteri */}
      <div className="pirate-card rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between lg:hidden mb-3">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Filteri</div>
          <Button variant="outline" size="sm" onClick={() => setShowFilters((v) => !v)}>
            <SlidersHorizontal className="size-4 mr-2" />
            {showFilters ? "Sakrij" : "Prikaži"}
          </Button>
        </div>
        <div
          className={(showFilters ? "flex" : "hidden lg:flex") + " flex-col lg:flex-row gap-3"}
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
            <SelectTrigger className="lg:w-40">
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
            <SelectTrigger className="lg:w-36">
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
            <SelectTrigger className="lg:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Svi statusi</SelectItem>
              <SelectItem value="ready">READY</SelectItem>
              <SelectItem value="en_route">EN ROUTE</SelectItem>
              <SelectItem value="collected">POKUPLJENO</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="lg:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Svi izvori</SelectItem>
              <SelectItem value="alliance">Savezni nalog</SelectItem>
              <SelectItem value="highscore">Highscore</SelectItem>
              <SelectItem value="both">Oba izvora</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            placeholder="Min poeni"
            value={minPoints}
            onChange={(e) => setMinPoints(e.target.value)}
            className="lg:w-28"
          />
        </div>
      </div>

      {/* legenda + zoom */}
      <div className="pirate-card rounded-2xl p-4 mb-4 flex flex-wrap items-center gap-4 justify-between">
        <div className="flex flex-wrap items-center gap-4">
          {REL_KEYS.map((k) => (
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
            onClick={() => applyZoom(camRef.current.zoom / 1.5)}
          >
            <ZoomOut className="size-4" />
          </Button>
          <div className="text-xs tabular-nums w-12 text-center">{zoom.toFixed(1)}x</div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => applyZoom(camRef.current.zoom * 1.5)}
          >
            <ZoomIn className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setZoom(1);
              setCam({ x: 0, y: 0 });
            }}
          >
            <RotateCcw className="size-4 mr-1.5" />
            Reset
          </Button>
        </div>
      </div>

      {/* mapa */}
      <div className="pirate-card rounded-2xl p-3">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Učitavam mapu...</div>
        ) : coordCount === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nema dovoljno podataka sa koordinatama za prikaz mape.
          </div>
        ) : cells.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nema igrača koji odgovaraju odabranim filterima.
          </div>
        ) : (
          <div
            ref={hostRef}
            className="relative mx-auto max-w-[900px] touch-none select-none overflow-hidden rounded-xl border border-border"
            style={{ aspectRatio: "1 / 1", cursor: "grab" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onMouseLeave={() => setHover(null)}
          >
            <svg
              viewBox={`${cam.x} ${cam.y} ${view} ${view}`}
              className="w-full h-full"
              style={{ background: "color-mix(in oklab, var(--background) 70%, transparent)" }}
            >
              {/* grid */}
               {xGridLines.map((i) => (
                <line
                  key={`v${i}`}
                  x1={i * CELL}
                  y1={cam.y}
                  x2={i * CELL}
                  y2={cam.y + view}
                  stroke="var(--border)"
                    strokeOpacity={i % 10 === 0 ? 0.82 : i % 5 === 0 ? 0.6 : 0.42}
                    strokeWidth={s(i % 10 === 0 ? 1.35 : i % 5 === 0 ? 1 : 0.75)}
                />
              ))}
               {yGridLines.map((j) => (
                <line
                  key={`h${j}`}
                  x1={cam.x}
                  y1={j * CELL}
                  x2={cam.x + view}
                  y2={j * CELL}
                  stroke="var(--border)"
                    strokeOpacity={j % 10 === 0 ? 0.82 : j % 5 === 0 ? 0.6 : 0.42}
                    strokeWidth={s(j % 10 === 0 ? 1.35 : j % 5 === 0 ? 1 : 0.75)}
                />
              ))}

              {/* heat/glow sloj — ne prima klikove */}
              <g pointerEvents="none">
                {cells.map((c) => {
                  const t = intensity(c.total);
                  return (
                    <circle
                      key={`g-${c.key}`}
                      cx={wx(c.x)}
                      cy={wy(c.y)}
                      r={s(10 + t * 22)}
                      fill={REL_COLOR[c.dominant]}
                      opacity={(0.08 + t * 0.2) * (c.collected === c.players.length ? 0.4 : 1)}
                      style={{ filter: "blur(6px)" }}
                    />
                  );
                })}
              </g>

              {/* markeri — poeni i broj igrača određuju veličinu; jaki hotspotovi smiju preći polje */}
              {cells.map((c) => {
                const t = intensity(c.total);
                const color = REL_COLOR[c.dominant];
                const multi = c.players.length > 1;
                const playerWeight = Math.min(1, Math.log2(c.players.length) / 3);
                const zoomProgress = (zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM);
                const screenRadius = 3 + t * 5 + playerWeight * 3;
                const fieldRadius = 2.4 + t * 6.1 + playerWeight * 3.4;
                const r = Math.min(
                  CELL * 1.2,
                  s(screenRadius) * (1 - zoomProgress) + fieldRadius * zoomProgress,
                );
                const hitRadius = Math.max(r, s(7));
                const faded = c.collected === c.players.length;
                const onEnter = (ev: React.MouseEvent) => {
                  const box = hostRef.current?.getBoundingClientRect();
                  setHover({
                    cell: c,
                    left: box ? ev.clientX - box.left : 0,
                    top: box ? ev.clientY - box.top : 0,
                  });
                };
                return (
                  <g
                    key={c.key}
                    opacity={faded ? 0.45 : 1}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={onEnter}
                    onMouseMove={onEnter}
                    onClick={() => setSelectedKey(c.key)}
                  >
                    {/* precizna klik zona vezana za polje */}
                    <rect
                      x={wx(c.x) - hitRadius}
                      y={wy(c.y) - hitRadius}
                      width={hitRadius * 2}
                      height={hitRadius * 2}
                      fill="transparent"
                    />
                    <circle
                      cx={wx(c.x)}
                      cy={wy(c.y)}
                      r={r}
                      fill={color}
                      opacity={0.4 + t * 0.6}
                      stroke={color}
                      strokeWidth={s(1)}
                    />
                    {multi && (
                      <>
                        <circle
                          cx={wx(c.x)}
                          cy={wy(c.y)}
                          r={r + s(2.5)}
                          fill="none"
                          stroke={color}
                          strokeOpacity={0.8}
                          strokeWidth={s(0.8)}
                        />
                        <text
                          x={wx(c.x) + r + s(5.5)}
                          y={wy(c.y) - r - s(3)}
                          fontSize={s(10)}
                          fill="var(--foreground)"
                          fontWeight={800}
                          textAnchor="middle"
                          dominantBaseline="central"
                          style={{ paintOrder: "stroke" }}
                          stroke="var(--background)"
                          strokeWidth={s(2.5)}
                        >
                          {c.players.length}
                        </text>
                      </>
                    )}
                    {c.en_route > 0 && (
                      <circle
                        cx={wx(c.x) - r - s(2)}
                        cy={wy(c.y) - r - s(2)}
                        r={s(2)}
                        fill="var(--gold)"
                        stroke="var(--background)"
                        strokeWidth={s(0.6)}
                      />
                    )}
                  </g>
                );
              })}

              {/* axis labele — konstantna screen veličina, unutar viewporta */}
              <g pointerEvents="none">
                {xLabels.map((i) => (
                  <text
                    key={`xl${i}`}
                    x={wx(i)}
                    y={cam.y + s(12)}
                    fontSize={s(11)}
                    fontWeight={700}
                    fill="var(--foreground)"
                    stroke="var(--background)"
                    strokeWidth={s(2.2)}
                    style={{ paintOrder: "stroke" }}
                    textAnchor="middle"
                  >
                    {i}
                  </text>
                ))}
                {yLabels.map((j) => (
                  <text
                    key={`yl${j}`}
                    x={cam.x + s(4)}
                    y={wy(j) + s(3)}
                    fontSize={s(11)}
                    fontWeight={700}
                    fill="var(--foreground)"
                    stroke="var(--background)"
                    strokeWidth={s(2.2)}
                    style={{ paintOrder: "stroke" }}
                  >
                    {j}
                  </text>
                ))}
              </g>
            </svg>

            {hover && (
              <div
                className="pointer-events-none absolute z-20 w-64 max-h-64 overflow-hidden rounded-xl border border-gold/30 bg-popover/95 p-3 text-xs shadow-xl"
                style={{
                  left: Math.min(
                    Math.max(4, hover.left + 12),
                    Math.max(4, (hostRef.current?.clientWidth ?? 264) - 260),
                  ),
                  top:
                    hover.top + 268 <= (hostRef.current?.clientHeight ?? 272)
                      ? hover.top + 12
                      : Math.max(4, hover.top - 268),
                }}
              >
                <div className="font-display text-gold text-sm">{hover.cell.key}</div>
                <div className="mb-2 flex items-baseline gap-1.5">
                  <span className="text-base font-bold tabular-nums text-foreground">
                    {hover.cell.total.toLocaleString("bs-BA")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ukupno · {hover.cell.players.length} igrača
                  </span>
                </div>
                <div className="space-y-1.5">
                  {hover.cell.players.slice(0, 6).map((p) => (
                    <div key={p.canonical_player_key} className="border-t border-border pt-1.5">
                      <div className="flex justify-between gap-2">
                        <span className="truncate font-medium">{p.username}</span>
                        <span className="tabular-nums">
                          {p.current_pirate_points.toLocaleString("bs-BA")}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {p.alliance_tag ?? "—"} · {REL_LABEL[relKeyOf(p)]} ·{" "}
                        {p.target_status === "en_route"
                          ? `EN ROUTE · ${p.assigned_pirate_name ?? "—"}`
                          : p.target_status === "collected"
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
        )}
      </div>

      <CellDialog
        cell={selected}
        onClose={() => setSelectedKey(null)}
        statusMap={statusMap}
        actions={actions}
      />
    </div>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  alliance: "Savezni nalog",
  highscore: "Highscore",
  both: "Oba izvora",
};

function CellDialog({
  cell,
  onClose,
  statusMap,
  actions,
}: {
  cell: Cell | null;
  onClose: () => void;
  statusMap: ReturnType<typeof useTargetStatusMap>["map"];
  actions: ReturnType<typeof useTargetActions>;
}) {
  return (
    <Dialog open={!!cell} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
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
                {REL_KEYS.filter((k) => cell.byRelation[k] > 0).map((k) => (
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

            <div className="max-h-80 overflow-y-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-widest text-muted-foreground bg-card/40">
                  <tr>
                    <th className="text-left py-2 px-3">Username</th>
                    <th className="text-right py-2 px-2">Poeni</th>
                    <th className="text-left py-2 px-2">Savez / odnos</th>
                    <th className="text-left py-2 px-2">Grad</th>
                    <th className="text-left py-2 px-2">Izvor</th>
                    <th className="text-left py-2 px-2">Status</th>
                    <th className="text-right py-2 px-3">Akcija</th>
                  </tr>
                </thead>
                <tbody>
                  {cell.players.map((p) => (
                    <tr key={p.canonical_player_key} className="border-t border-border">
                      <td className="py-2 px-3 font-medium truncate max-w-[11rem]">
                        {p.username}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {p.current_pirate_points.toLocaleString("bs-BA")}
                      </td>
                      <td className="py-2 px-2">
                        <AllianceBadge
                          tag={p.alliance_tag}
                          relation={p.effective_relation}
                          fromPlayer={p.relation_from_player}
                        />
                      </td>
                      <td className="py-2 px-2 text-muted-foreground truncate max-w-[9rem]">
                        {p.city_name ?? "—"}
                      </td>
                      <td className="py-2 px-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                        {SOURCE_LABEL[p.source]}
                      </td>
                      <td className="py-2 px-2">
                        <StatusBadge status={p.target_status} />
                        {p.target_status === "en_route" && (
                          <div className="text-[10px] text-muted-foreground">
                            {p.assigned_pirate_name ?? "—"}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <TargetActions
                          target={{
                            ikariam_username: p.username,
                            coordinates: p.coordinates,
                            alliance_tag: p.alliance_tag,
                            rank: p.rank,
                            pirate_points: p.current_pirate_points,
                          }}
                          relation={p.effective_relation}
                          map={statusMap}
                          actions={actions}
                        />
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

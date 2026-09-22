import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronDown,
  ChevronRight,
  MapPinned,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  REGION_PALETTE,
  regionCells,
  suggestColor,
  useRegions,
  usePirateCandidates,
  type PirateRegion,
  type RegionItem,
} from "@/hooks/use-regions";
import { saveRegion, deleteRegion } from "@/lib/regions.functions";
import { AssignmentsSection } from "@/components/assignments-import";

export const Route = createFileRoute("/_authenticated/regions")({
  component: RegionsPage,
  head: () => ({
    meta: [
      { title: "Rejoni pirata · BAUN Pirate Tracker" },
      {
        name: "description",
        content:
          "Definisanje i pregled geografskih rejona pirata — koordinate i opsezi ostrva za koje je pirat zadužen.",
      },
      { property: "og:title", content: "Rejoni pirata · BAUN Pirate Tracker" },
      {
        property: "og:description",
        content: "Rejoni pirata na 100x100 Ikariam mapi — pojedinačne koordinate i opsezi.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type DraftItem = Omit<RegionItem, "id">;

const ROLE_LABEL: Record<string, string> = {
  admin: "admin",
  glavni_pirat: "glavni pirat",
  pirat: "pirat",
};

const rankOf = (roles: string[]) =>
  roles.includes("glavni_pirat")
    ? ROLE_LABEL.glavni_pirat
    : roles.includes("pirat")
      ? ROLE_LABEL.pirat
      : "—";

function RegionsPage() {
  const { data: regions = [], isLoading } = useRegions();
  const { isAdmin, data: me } = useCurrentUser();
  const canManage = isAdmin || !!me?.roles.includes("glavni_pirat");

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PirateRegion | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const qc = useQueryClient();
  const delFn = useServerFn(deleteRegion);
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Rejon obrisan.");
      qc.invalidateQueries({ queryKey: ["pirate-regions"] });
    },
    onError: (e: any) => toast.error("Greška", { description: e?.message }),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return regions;
    return regions.filter(
      (r) =>
        r.pirate_username.toLowerCase().includes(q) ||
        (r.name ?? "").toLowerCase().includes(q),
    );
  }, [regions, search]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div>
      <PageHeader
        title="Rejoni pirata"
        description="Geografski rejoni — skup Ikariam koordinata i opsega ostrva za koje je pirat zadužen. Rejoni su trajna konfiguracija i ne resetuju se sa pirate round-om ni dnevnim periodima."
      />

      <AssignmentsSection canManage={canManage} />

      <div className="pirate-card rounded-2xl p-4 mb-4 flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Traži pirata ili naziv rejona..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="size-4 mr-2" />
            Dodaj rejon
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="pirate-card rounded-2xl p-6 text-sm text-muted-foreground">
          Učitavam rejone...
        </div>
      ) : filtered.length === 0 ? (
        <div className="pirate-card rounded-2xl p-10 text-center text-sm text-muted-foreground">
          Još nema definisanih rejona.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const isOpen = expanded.has(r.id);
            return (
              <div key={r.id} className="pirate-card rounded-2xl p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className="flex items-center gap-2 text-left flex-1 min-w-[12rem]"
                    onClick={() => toggle(r.id)}
                  >
                    {isOpen ? (
                      <ChevronDown className="size-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-4 text-muted-foreground" />
                    )}
                    <span
                      className="size-4 rounded border"
                      style={{ background: r.color, borderColor: r.color }}
                    />
                    <span>
                      <span className="font-display text-gold">{r.pirate_username}</span>
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground ml-2">
                        {rankOf(r.pirate_roles)}
                      </span>
                      <div className="text-xs text-muted-foreground">
                        {r.name || "Bez naziva"}
                      </div>
                    </span>
                  </button>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {r.points.length} koordinata · {r.rectangles.length} opsega ·{" "}
                    {regionCells(r).length} polja
                  </div>
                  {canManage && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditing(r);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="size-4 mr-1.5" />
                        Uredi
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Obrisati rejon pirata ${r.pirate_username}?`))
                            del.mutate(r.id);
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>

                {isOpen && (
                  <div className="mt-3 grid gap-4 sm:grid-cols-2 border-t border-border pt-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
                        Pojedinačne koordinate
                      </div>
                      {r.points.length === 0 ? (
                        <div className="text-xs text-muted-foreground">—</div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {r.points.map((p) => (
                            <span
                              key={p.id}
                              className="rounded-md border border-border px-2 py-0.5 text-xs tabular-nums"
                            >
                              {p.x_start}:{p.y_start}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
                        Opsezi
                      </div>
                      {r.rectangles.length === 0 ? (
                        <div className="text-xs text-muted-foreground">—</div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {r.rectangles.map((p) => (
                            <span
                              key={p.id}
                              className="rounded-md border border-border px-2 py-0.5 text-xs tabular-nums"
                            >
                              X {p.x_start}-{p.x_end} / Y {p.y_start}-{p.y_end}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="sm:col-span-2">
                      <MiniPreview items={r.items} color={r.color} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canManage && (
        <RegionDialog
          open={open}
          onOpenChange={setOpen}
          region={editing}
          regions={regions}
        />
      )}
    </div>
  );
}

/* ------------------------------ mini 100x100 preview ------------------------------ */

function MiniPreview({ items, color }: { items: DraftItem[] | RegionItem[]; color: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
        Preview (100x100)
      </div>
      <svg
        viewBox="0 0 100 100"
        className="w-full max-w-[260px] rounded-lg border border-border bg-background/60"
      >
        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((v) => (
          <g key={v}>
            <line x1={v} y1={0} x2={v} y2={100} stroke="var(--border)" strokeWidth={0.2} />
            <line x1={0} y1={v} x2={100} y2={v} stroke="var(--border)" strokeWidth={0.2} />
          </g>
        ))}
        {items.map((i, idx) => (
          <rect
            key={idx}
            x={i.x_start - 1}
            y={i.y_start - 1}
            width={i.x_end - i.x_start + 1}
            height={i.y_end - i.y_start + 1}
            fill={color}
            fillOpacity={0.25}
            stroke={color}
            strokeOpacity={0.8}
            strokeWidth={0.35}
          />
        ))}
      </svg>
    </div>
  );
}

/* ------------------------------ forma ------------------------------ */

function RegionDialog({
  open,
  onOpenChange,
  region,
  regions,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  region: PirateRegion | null;
  regions: PirateRegion[];
}) {
  const { data: candidates = [] } = usePirateCandidates();
  const qc = useQueryClient();
  const saveFn = useServerFn(saveRegion);

  const [pirateId, setPirateId] = useState(region?.pirate_user_id ?? "");
  const [name, setName] = useState(region?.name ?? "");
  const [color, setColor] = useState(region?.color ?? REGION_PALETTE[0]);
  const [items, setItems] = useState<DraftItem[]>(
    region?.items.map(({ item_type, x_start, x_end, y_start, y_end }) => ({
      item_type,
      x_start,
      x_end,
      y_start,
      y_end,
    })) ?? [],
  );
  const [coordInput, setCoordInput] = useState("");
  const [rx1, setRx1] = useState("");
  const [rx2, setRx2] = useState("");
  const [ry1, setRy1] = useState("");
  const [ry2, setRy2] = useState("");
  const [key, setKey] = useState(region?.id ?? "new");

  /* reset stanja kada se otvori drugi rejon */
  const wantKey = region?.id ?? "new";
  if (open && wantKey !== key) {
    setKey(wantKey);
    setPirateId(region?.pirate_user_id ?? "");
    setName(region?.name ?? "");
    setColor(region?.color ?? REGION_PALETTE[0]);
    setItems(
      region?.items.map(({ item_type, x_start, x_end, y_start, y_end }) => ({
        item_type,
        x_start,
        x_end,
        y_start,
        y_end,
      })) ?? [],
    );
    setCoordInput("");
    setRx1("");
    setRx2("");
    setRy1("");
    setRy2("");
  }

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          id: region?.id,
          pirate_user_id: pirateId,
          name: name.trim() || null,
          color,
          items,
        },
      }),
    onSuccess: () => {
      toast.success(region ? "Rejon ažuriran." : "Rejon sačuvan.");
      qc.invalidateQueries({ queryKey: ["pirate-regions"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error("Greška", { description: e?.message }),
  });

  const valid = (v: number) => Number.isInteger(v) && v >= 1 && v <= 100;

  const addPoint = () => {
    const m = coordInput.trim().match(/^(\d{1,3})\s*:\s*(\d{1,3})$/);
    if (!m) return toast.error("Format koordinate je x:y (npr. 25:2).");
    const x = Number(m[1]);
    const y = Number(m[2]);
    if (!valid(x) || !valid(y)) return toast.error("Koordinate moraju biti između 1 i 100.");
    setItems((prev) =>
      prev.some(
        (i) =>
          i.item_type === "point" && i.x_start === x && i.y_start === y,
      )
        ? prev
        : [...prev, { item_type: "point", x_start: x, x_end: x, y_start: y, y_end: y }],
    );
    setCoordInput("");
  };

  const addRect = () => {
    const nums = [rx1, rx2, ry1, ry2].map((v) => Number(v));
    if (nums.some((n) => !valid(n)))
      return toast.error("Svi opsezi moraju biti cijeli brojevi 1-100.");
    const [xa, xb, ya, yb] = nums;
    setItems((prev) => [
      ...prev,
      {
        item_type: "rectangle",
        x_start: Math.min(xa, xb),
        x_end: Math.max(xa, xb),
        y_start: Math.min(ya, yb),
        y_end: Math.max(ya, yb),
      },
    ]);
    setRx1("");
    setRx2("");
    setRy1("");
    setRy2("");
  };

  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const points = items.map((i, idx) => ({ i, idx })).filter((r) => r.i.item_type === "point");
  const rects = items.map((i, idx) => ({ i, idx })).filter((r) => r.i.item_type === "rectangle");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPinned className="size-4 text-gold" />
            {region ? "Uredi rejon" : "Dodaj rejon"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block">Pirat</Label>
              <Select
                value={pirateId}
                onValueChange={(v) => {
                  setPirateId(v);
                  if (!region) setColor(suggestColor(v, regions));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Odaberi pirata" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.username} · {rankOf(c.roles)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {candidates.length === 0 && (
                <div className="text-[10px] text-muted-foreground mt-1">
                  Nema korisnika sa rankom pirat ili glavni pirat.
                </div>
              )}
            </div>
            <div>
              <Label className="mb-1.5 block">Naziv rejona (opciono)</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="npr. Sjeverni sektor"
                maxLength={80}
              />
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block">Boja</Label>
            <div className="flex flex-wrap items-center gap-2">
              {REGION_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={
                    "size-7 rounded-md border-2 transition " +
                    (c.toLowerCase() === color.toLowerCase()
                      ? "border-foreground scale-110"
                      : "border-transparent")
                  }
                  style={{ background: c }}
                  aria-label={c}
                />
              ))}
              <Input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-28"
              />
            </div>
          </div>

          <div className="rounded-xl border border-border p-3">
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
              Pojedinačne koordinate
            </div>
            <div className="flex gap-2">
              <Input
                value={coordInput}
                onChange={(e) => setCoordInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPoint())}
                placeholder="25:2"
                className="w-32"
              />
              <Button type="button" variant="outline" onClick={addPoint}>
                Dodaj
              </Button>
            </div>
            {points.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {points.map(({ i, idx }) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="rounded-md border border-border px-2 py-0.5 text-xs tabular-nums hover:border-destructive"
                  >
                    {i.x_start}:{i.y_start} ×
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border p-3">
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
              Opseg
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label className="text-[10px]">X od</Label>
                <Input value={rx1} onChange={(e) => setRx1(e.target.value)} className="w-20" />
              </div>
              <div>
                <Label className="text-[10px]">X do</Label>
                <Input value={rx2} onChange={(e) => setRx2(e.target.value)} className="w-20" />
              </div>
              <div>
                <Label className="text-[10px]">Y od</Label>
                <Input value={ry1} onChange={(e) => setRy1(e.target.value)} className="w-20" />
              </div>
              <div>
                <Label className="text-[10px]">Y do</Label>
                <Input value={ry2} onChange={(e) => setRy2(e.target.value)} className="w-20" />
              </div>
              <Button type="button" variant="outline" onClick={addRect}>
                Dodaj opseg
              </Button>
            </div>
            {rects.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {rects.map(({ i, idx }) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="rounded-md border border-border px-2 py-0.5 text-xs tabular-nums hover:border-destructive"
                  >
                    X {i.x_start}-{i.x_end} / Y {i.y_start}-{i.y_end} ×
                  </button>
                ))}
              </div>
            )}
          </div>

          {items.length > 0 && <MiniPreview items={items} color={color} />}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Odustani
          </Button>
          <Button
            onClick={() => {
              if (!pirateId) return toast.error("Odaberi pirata.");
              if (items.length === 0)
                return toast.error("Dodaj najmanje jednu koordinatu ili opseg.");
              save.mutate();
            }}
            disabled={save.isPending}
          >
            {save.isPending ? "Čuvam..." : "Sačuvaj rejon"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePirateCandidates, type PirateRegion } from "@/hooks/use-regions";
import {
  downloadTemplateSinglePirate,
  downloadTemplateWithPirate,
  parseAssignmentsFile,
  type ExcelFormat,
  type ParsedRow,
} from "@/lib/excel-assignments";
import { importRegionPlayers } from "@/lib/regions.functions";

/** Excel je samo masovni način unosa player assignment-a u postojeći rejon. */
export function RegionImportDialog({
  open,
  onOpenChange,
  regions,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  regions: PirateRegion[];
}) {
  const { data: candidates = [] } = usePirateCandidates();
  const qc = useQueryClient();
  const importFn = useServerFn(importRegionPlayers);

  const [pirateId, setPirateId] = useState("");
  const [regionId, setRegionId] = useState("");
  const [format, setFormat] = useState<ExcelFormat | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState<"add" | "replace">("add");
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedName = candidates.find((c) => c.id === pirateId)?.username ?? null;
  const pirateRegions = useMemo(
    () => regions.filter((r) => r.pirate_user_id === pirateId),
    [regions, pirateId],
  );

  const reparse = async (file: File, pirateName: string | null) => {
    try {
      const res = await parseAssignmentsFile(file, pirateName);
      setFormat(res.format);
      setRows(res.rows);
    } catch (e: any) {
      setFormat(null);
      setRows([]);
      toast.error("Greška pri čitanju fajla", { description: e?.message });
    }
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    await reparse(file, selectedName);
  };

  const onPirateChange = async (id: string) => {
    setPirateId(id);
    const list = regions.filter((r) => r.pirate_user_id === id);
    setRegionId(list.length === 1 ? list[0].id : "");
    const name = candidates.find((c) => c.id === id)?.username ?? null;
    const file = fileRef.current?.files?.[0];
    if (file) await reparse(file, name);
  };

  const validRows = rows.filter((r) => r.valid && r.coordinates);

  const run = useMutation({
    mutationFn: () =>
      importFn({
        data: {
          region_id: regionId || null,
          pirate_user_id: pirateId || null,
          mode,
          rows: validRows.map((r) => ({
            pirate_username: format === "A" ? r.pirate_username : null,
            coordinates: r.coordinates!,
            player: r.player,
          })),
        },
      }),
    onSuccess: (res: any) => {
      toast.success(
        `Import završen — dodano ${res.inserted}${res.deleted ? `, obrisano ${res.deleted}` : ""}.`,
      );
      qc.invalidateQueries({ queryKey: ["pirate-regions"] });
      onOpenChange(false);
      setRows([]);
      setFormat(null);
      setFileName("");
      setPirateId("");
      setRegionId("");
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (e: any) => toast.error("Greška", { description: e?.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-4 text-gold" />
            Excel import igrača u rejon
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={downloadTemplateSinglePirate}>
              <Download className="size-4 mr-1.5" />
              Template za jednog pirata
            </Button>
            <Button variant="outline" size="sm" onClick={downloadTemplateWithPirate}>
              <Download className="size-4 mr-1.5" />
              Template sa Pirate kolonom
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block">Pirat</Label>
              <Select value={pirateId} onValueChange={onPirateChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Odaberi pirata" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">Rejon</Label>
              <Select value={regionId} onValueChange={setRegionId} disabled={!pirateId}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      pirateRegions.length === 0 ? "Novi rejon (automatski)" : "Odaberi rejon"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {pirateRegions.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name || "Bez naziva"} · {r.points.length + r.rectangles.length} definicija
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {pirateId && pirateRegions.length === 0 && (
                <div className="text-[10px] text-muted-foreground mt-1">
                  Ovaj pirat još nema rejon — biće kreiran tokom importa.
                </div>
              )}
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block">Excel fajl (Coordinates | Player)</Label>
            <Input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
            {fileName && (
              <div className="text-[10px] text-muted-foreground mt-1">
                {fileName}
                {format && ` · prepoznat FORMAT ${format}`}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border p-3">
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
              Način importa
            </div>
            <div className="flex flex-col gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={mode === "add"} onChange={() => setMode("add")} />
                Dodaj na postojeće
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={mode === "replace"}
                  onChange={() => setMode("replace")}
                />
                Zamijeni igrače u rejonu
              </label>
            </div>
          </div>

          {rows.length > 0 && (
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
                Preview · {validRows.length} validnih od {rows.length} redova
              </div>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-1.5">Pirate</th>
                      <th className="text-left px-3 py-1.5">Coordinates</th>
                      <th className="text-left px-3 py-1.5">Player</th>
                      <th className="text-left px-3 py-1.5">Status</th>
                      <th className="text-left px-3 py-1.5">Napomena</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-t border-border/60">
                        <td className="px-3 py-1.5">{r.pirate_username ?? "—"}</td>
                        <td className="px-3 py-1.5 tabular-nums">{r.coordinates ?? "—"}</td>
                        <td className="px-3 py-1.5">{r.player || "—"}</td>
                        <td
                          className={
                            "px-3 py-1.5 font-medium " +
                            (r.valid && r.coordinates ? "text-emerald-400" : "text-destructive")
                          }
                        >
                          {r.valid && r.coordinates ? "VALID" : "INVALID"}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">
                          {r.coordinates ? r.note : "Koordinate su obavezne."}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Odustani
          </Button>
          <Button
            onClick={() => {
              if (!pirateId) return toast.error("Odaberi pirata.");
              if (pirateRegions.length > 1 && !regionId)
                return toast.error("Ovaj pirat ima više rejona — odaberi rejon.");
              if (validRows.length === 0) return toast.error("Nema validnih redova za import.");
              run.mutate();
            }}
            disabled={run.isPending || rows.length === 0}
          >
            {run.isPending ? "Importujem..." : `Importuj ${validRows.length} redova`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

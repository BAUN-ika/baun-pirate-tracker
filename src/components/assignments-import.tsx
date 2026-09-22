import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileSpreadsheet, Trash2, Upload } from "lucide-react";
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
import { usePirateCandidates } from "@/hooks/use-regions";
import { usePlayerAssignments } from "@/hooks/use-player-assignments";
import {
  downloadTemplateSinglePirate,
  downloadTemplateWithPirate,
  parseAssignmentsFile,
  type ExcelFormat,
  type ParsedRow,
} from "@/lib/excel-assignments";
import { deletePlayerAssignment, importPlayerAssignments } from "@/lib/assignments.functions";

export function AssignmentsSection({ canManage }: { canManage: boolean }) {
  const { data: assignments = [], isLoading } = usePlayerAssignments();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const delFn = useServerFn(deletePlayerAssignment);
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Dodjela obrisana.");
      qc.invalidateQueries({ queryKey: ["player-assignments"] });
    },
    onError: (e: any) => toast.error("Greška", { description: e?.message }),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, typeof assignments>();
    for (const a of assignments) {
      const list = map.get(a.pirate_username) ?? [];
      list.push(a);
      map.set(a.pirate_username, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [assignments]);

  return (
    <div className="pirate-card rounded-2xl p-4 mb-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <div className="font-display text-gold flex items-center gap-2">
            <FileSpreadsheet className="size-4" />
            Dodjela igrača piratima (Excel import)
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Pirata biraš u aplikaciji prije importa — Excel može sadržavati samo Coordinates i
            Player.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={downloadTemplateSinglePirate}>
            <Download className="size-4 mr-1.5" />
            Template za jednog pirata
          </Button>
          <Button variant="outline" size="sm" onClick={downloadTemplateWithPirate}>
            <Download className="size-4 mr-1.5" />
            Template sa Pirate kolonom
          </Button>
          {canManage && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Upload className="size-4 mr-1.5" />
              Importuj Excel
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground mt-4">Učitavam dodjele...</div>
      ) : grouped.length === 0 ? (
        <div className="text-sm text-muted-foreground mt-4">
          Još nema importovanih dodjela igrača.
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {grouped.map(([pirate, list]) => (
            <div key={pirate} className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-display text-gold">{pirate}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {list.length} igrača
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {list.map((a) => (
                  <span
                    key={a.id}
                    className="rounded-md border border-border px-2 py-0.5 text-xs flex items-center gap-1.5"
                  >
                    {a.coordinates && (
                      <span className="tabular-nums text-muted-foreground">{a.coordinates}</span>
                    )}
                    {a.ikariam_username}
                    {canManage && (
                      <button
                        type="button"
                        aria-label="Obriši dodjelu"
                        onClick={() => del.mutate(a.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {canManage && <ImportDialog open={open} onOpenChange={setOpen} />}
    </div>
  );
}

function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: candidates = [] } = usePirateCandidates();
  const qc = useQueryClient();
  const importFn = useServerFn(importPlayerAssignments);

  const [pirateId, setPirateId] = useState("");
  const [format, setFormat] = useState<ExcelFormat | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState<"add" | "replace">("add");
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedName = candidates.find((c) => c.id === pirateId)?.username ?? null;

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
    const name = candidates.find((c) => c.id === id)?.username ?? null;
    const file = fileRef.current?.files?.[0];
    if (file) await reparse(file, name);
  };

  const validRows = rows.filter((r) => r.valid);

  const run = useMutation({
    mutationFn: () =>
      importFn({
        data: {
          pirate_user_id: format === "B" ? pirateId : (pirateId || null),
          mode: format === "B" ? mode : "add",
          rows: validRows.map((r) => ({
            pirate_username: format === "A" ? r.pirate_username : null,
            coordinates: r.coordinates,
            player: r.player,
          })),
        },
      }),
    onSuccess: (res: any) => {
      toast.success(
        `Import završen — dodano ${res.inserted}${res.deleted ? `, obrisano ${res.deleted}` : ""}.`,
      );
      qc.invalidateQueries({ queryKey: ["player-assignments"] });
      onOpenChange(false);
      setRows([]);
      setFormat(null);
      setFileName("");
      setPirateId("");
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
            Excel import dodjela igrača
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block">Za kojeg pirata importuješ ovaj fajl?</Label>
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
              <Label className="mb-1.5 block">Izaberi Excel fajl</Label>
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
          </div>

          {format === "B" && (
            <div className="rounded-xl border border-border p-3">
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
                Način importa
              </div>
              <div className="flex flex-col gap-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={mode === "add"}
                    onChange={() => setMode("add")}
                  />
                  Dodaj na postojeće
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={mode === "replace"}
                    onChange={() => setMode("replace")}
                  />
                  Zamijeni player assignment-e ovog pirata
                </label>
              </div>
            </div>
          )}

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
                            (r.valid ? "text-emerald-400" : "text-destructive")
                          }
                        >
                          {r.valid ? "VALID" : "INVALID"}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.note}</td>
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
              if (format === "B" && !pirateId)
                return toast.error("Odaberi pirata za kojeg importuješ ovaj fajl.");
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

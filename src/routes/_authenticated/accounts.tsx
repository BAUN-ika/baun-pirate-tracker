import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Anchor, MapPin, Pencil, Plus, Ship, Timer, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  addAccount,
  deleteAccount,
  updateAccountCoordinates,
  updateAccountPoints,
} from "@/lib/accounts.functions";
import {
  cancelMission,
  completeDueMissions,
  startMission,
} from "@/lib/missions.functions";
import { COORDS_RE, CoordsLink, validCoords } from "@/components/coords-link";


export const Route = createFileRoute("/_authenticated/accounts")({
  component: AccountsPage,
});




function AccountsPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const addFn = useServerFn(addAccount);
  const updPtsFn = useServerFn(updateAccountPoints);
  const updCoordsFn = useServerFn(updateAccountCoordinates);
  const delFn = useServerFn(deleteAccount);
  const startMissionFn = useServerFn(startMission);
  const cancelMissionFn = useServerFn(cancelMission);
  const completeDueFn = useServerFn(completeDueMissions);

  // Best-effort auto-completion of due missions whenever this page is opened.
  useEffect(() => {
    completeDueFn({})
      .then((r) => {
        if (r.completed > 0) {
          qc.invalidateQueries({ queryKey: ["my-accounts"] });
          qc.invalidateQueries({ queryKey: ["all-accounts"] });
          qc.invalidateQueries({ queryKey: ["my-missions"] });
          qc.invalidateQueries({ queryKey: ["all-missions"] });
        }
      })
      .catch(() => undefined);
  }, [completeDueFn, qc]);

  const accounts = useQuery({
    queryKey: ["my-accounts", me?.user.id],
    enabled: !!me?.user.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ikariam_accounts")
        .select("*")
        .eq("owner_user_id", me!.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const missions = useQuery({
    queryKey: ["my-missions", me?.user.id],
    enabled: !!me?.user.id,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pirate_missions")
        .select("*")
        .eq("user_id", me!.user.id)
        .eq("status", "pending")
        .order("completes_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPts, setNewPts] = useState("0");
  const [newCoords, setNewCoords] = useState("");

  const addMut = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          ikariam_username: newName,
          current_pirate_points: Number(newPts) || 0,
          fortress_coordinates: newCoords.trim(),
        },
      }),
    onSuccess: () => {
      toast.success("Nalog dodan.");
      setAddOpen(false);
      setNewName("");
      setNewPts("0");
      setNewCoords("");
      qc.invalidateQueries({ queryKey: ["my-accounts"] });
      qc.invalidateQueries({ queryKey: ["all-accounts"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: any) => toast.error("Greška", { description: e?.message }),
  });

  const startMut = useMutation({
    mutationFn: (vars: { account_id: string; mission_type: "mission_8h" | "mission_16h" }) =>
      startMissionFn({ data: vars }),
    onSuccess: () => {
      toast.success("Misija pokrenuta.");
      qc.invalidateQueries({ queryKey: ["my-missions"] });
      qc.invalidateQueries({ queryKey: ["all-missions"] });
    },
    onError: (e: any) => toast.error("Greška", { description: e?.message }),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelMissionFn({ data: { mission_id: id } }),
    onSuccess: () => {
      toast.success("Misija otkazana.");
      qc.invalidateQueries({ queryKey: ["my-missions"] });
      qc.invalidateQueries({ queryKey: ["all-missions"] });
    },
    onError: (e: any) => toast.error("Greška", { description: e?.message }),
  });

  const missionsByAccount = new Map<string, any[]>();
  for (const m of missions.data ?? []) {
    const arr = missionsByAccount.get(m.ikariam_account_id) ?? [];
    arr.push(m);
    missionsByAccount.set(m.ikariam_account_id, arr);
  }

  const coordsValid = newCoords.trim() === "" ? false : validCoords(newCoords.trim());

  return (
    <div>
      <PageHeader
        title="Moji nalozi"
        description="Tvoji Ikariam nalozi, koordinate tvrđave i piratski poeni."
        actions={
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4 mr-2" />
                Dodaj nalog
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novi Ikariam nalog</DialogTitle>
                <DialogDescription>
                  Unesi tačno korisničko ime kako stoji u igri.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Ikariam username</Label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    maxLength={60}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Koordinate tvrđave (npr. 14:28)</Label>
                  <Input
                    value={newCoords}
                    onChange={(e) => setNewCoords(e.target.value)}
                    placeholder="14:28"
                    maxLength={5}
                  />
                  {newCoords.trim() !== "" && !coordsValid && (
                    <p className="text-xs text-destructive">
                      Format mora biti N:N, oba broja između 1 i 99.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Početni pirate poeni</Label>
                  <Input
                    type="number"
                    min={0}
                    value={newPts}
                    onChange={(e) => setNewPts(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => addMut.mutate()}
                  disabled={!newName.trim() || !coordsValid || addMut.isPending}
                >
                  {addMut.isPending ? "Dodajem..." : "Dodaj"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {accounts.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="pirate-card rounded-2xl p-6 animate-pulse h-40" />
          ))}
        </div>
      ) : (accounts.data ?? []).length === 0 ? (
        <div className="pirate-card rounded-2xl p-12 text-center">
          <Anchor className="size-10 mx-auto text-gold mb-3" />
          <h3 className="font-display text-xl">Još nemaš naloga</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Dodaj svoj prvi Ikariam nalog da počneš pratiti pirate poene.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.data!.map((a) => (
            <AccountCard
              key={a.id}
              account={a}
              missions={missionsByAccount.get(a.id) ?? []}
              onUpdatePts={async (pts) => {
                await updPtsFn({ data: { account_id: a.id, points: pts } });
                toast.success("Poeni ažurirani.");
                qc.invalidateQueries({ queryKey: ["my-accounts"] });
                qc.invalidateQueries({ queryKey: ["all-accounts"] });
                qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
              }}
              onUpdateCoords={async (coords) => {
                await updCoordsFn({
                  data: { account_id: a.id, fortress_coordinates: coords },
                });
                toast.success("Koordinate ažurirane.");
                qc.invalidateQueries({ queryKey: ["my-accounts"] });
                qc.invalidateQueries({ queryKey: ["all-accounts"] });
              }}
              onDelete={async () => {
                await delFn({ data: { account_id: a.id } });
                toast.success("Nalog obrisan.");
                qc.invalidateQueries({ queryKey: ["my-accounts"] });
                qc.invalidateQueries({ queryKey: ["all-accounts"] });
                qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
              }}
              onStartMission={(type) =>
                startMut.mutate({ account_id: a.id, mission_type: type })
              }
              onCancelMission={(id) => cancelMut.mutate(id)}
              startBusy={startMut.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AccountCard({
  account,
  missions,
  onUpdatePts,
  onUpdateCoords,
  onDelete,
  onStartMission,
  onCancelMission,
  startBusy,
}: {
  account: any;
  missions: any[];
  onUpdatePts: (pts: number) => Promise<void>;
  onUpdateCoords: (coords: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onStartMission: (type: "mission_8h" | "mission_16h") => void;
  onCancelMission: (id: string) => void;
  startBusy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [pts, setPts] = useState(String(account.current_pirate_points));
  const [coords, setCoords] = useState(account.fortress_coordinates ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const n = Number(pts);
    if (!Number.isInteger(n) || n < 0) {
      toast.error("Unesi cijeli pozitivan broj.");
      return;
    }
    if (!validCoords(coords)) {
      toast.error("Koordinate moraju biti N:N (1-99).");
      return;
    }
    setSaving(true);
    try {
      if (n !== account.current_pirate_points) await onUpdatePts(n);
      if (coords !== (account.fortress_coordinates ?? "")) await onUpdateCoords(coords);
      setEditing(false);
    } catch (e: any) {
      toast.error("Greška", { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pirate-card rounded-2xl p-6 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            Ikariam nalog
          </div>
          <div className="font-display text-xl truncate mt-0.5">
            {account.ikariam_username}
          </div>
          {account.fortress_coordinates && (
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <MapPin className="size-3 text-gold" />
              <CoordsLink coords={account.fortress_coordinates} />
            </div>
          )}
        </div>
        <Anchor className="size-5 text-gold shrink-0" />
      </div>

      <div className="rounded-xl bg-background/40 border border-border p-4">
        <div className="text-xs text-muted-foreground">Pirate poeni</div>
        {editing ? (
          <div className="mt-2 space-y-2">
            <Input
              type="number"
              min={0}
              value={pts}
              onChange={(e) => setPts(e.target.value)}
              className="text-lg"
            />
            <Input
              value={coords}
              onChange={(e) => setCoords(e.target.value)}
              placeholder="Koordinate npr. 14:28"
              maxLength={5}
            />
            <div className="flex gap-2">
              <Button onClick={save} disabled={saving} size="sm">
                {saving ? "..." : "Sačuvaj"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPts(String(account.current_pirate_points));
                  setCoords(account.fortress_coordinates ?? "");
                  setEditing(false);
                }}
              >
                Otkaži
              </Button>
            </div>
          </div>
        ) : (
          <div className="font-display text-3xl text-gold mt-1">
            {Number(account.current_pirate_points).toLocaleString("bs-BA")}
          </div>
        )}
      </div>

      {missions.length > 0 && (
        <div className="space-y-2">
          {missions.map((m) => (
            <MissionProgressInline
              key={m.id}
              mission={m}
              onCancel={() => onCancelMission(m.id)}
            />
          ))}
        </div>
      )}

      <div className="text-xs text-muted-foreground space-y-0.5">
        <div>
          Zadnji update:{" "}
          {new Date(account.last_updated_at).toLocaleString("bs-BA")}
        </div>
        {account.last_collected_at && (
          <div>
            Zadnje skupljanje:{" "}
            {new Date(account.last_collected_at).toLocaleString("bs-BA")}
          </div>
        )}
      </div>

      {!editing && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-3.5 mr-1.5" /> Uredi
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive">
                  <Trash2 className="size-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Obrisati nalog?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Brisanje naloga <b>{account.ikariam_username}</b> je trajno.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Otkaži</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      onDelete().catch((e: any) =>
                        toast.error("Greška", { description: e?.message }),
                      )
                    }
                  >
                    Obriši
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={startBusy}
              onClick={() => onStartMission("mission_16h")}
            >
              <Ship className="size-3.5 mr-1.5" /> 16h misija
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={startBusy}
              onClick={() => onStartMission("mission_8h")}
            >
              <Ship className="size-3.5 mr-1.5" /> 8h misija
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function CoordsLink({ coords }: { coords: string }) {
  if (!coords || !COORDS_RE.test(coords)) {
    return <span className="text-muted-foreground">—</span>;
  }
  const [a, b] = coords.split(":");
  const islandId = `${a}${b}`;
  const url = `https://s70-en.ikariam.gameforge.com/?view=island&islandId=${islandId}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-gold hover:underline tabular-nums"
    >
      {coords}
    </a>
  );
}

function MissionProgressInline({
  mission,
  onCancel,
}: {
  mission: any;
  onCancel: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const start = new Date(mission.started_at).getTime();
  const end = new Date(mission.completes_at).getTime();
  const total = Math.max(1, end - start);
  const elapsed = Math.min(total, Math.max(0, now - start));
  const pct = Math.round((elapsed / total) * 100);
  const remainingMs = Math.max(0, end - now);
  const remH = Math.floor(remainingMs / 3_600_000);
  const remM = Math.floor((remainingMs % 3_600_000) / 60_000);
  const label =
    mission.mission_type === "mission_16h" ? "16h misija" : "8h misija";

  return (
    <div className="rounded-xl border border-border bg-background/30 p-3">
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="flex items-center gap-1.5">
          <Timer className="size-3.5 text-gold" />
          <span className="font-medium">{label}</span>
          <span className="text-muted-foreground">
            · ostalo {remH}h {remM}m
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-success">+{mission.reward_points}</span>
          <button
            onClick={onCancel}
            className="text-muted-foreground hover:text-destructive"
            aria-label="Otkaži misiju"
          >
            <X className="size-3.5" />
          </button>
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  );
}

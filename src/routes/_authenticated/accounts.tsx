import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Anchor, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  updateAccountPoints,
} from "@/lib/accounts.functions";

export const Route = createFileRoute("/_authenticated/accounts")({
  component: AccountsPage,
});

function AccountsPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const addFn = useServerFn(addAccount);
  const updFn = useServerFn(updateAccountPoints);
  const delFn = useServerFn(deleteAccount);

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

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPts, setNewPts] = useState("0");

  const addMut = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          ikariam_username: newName,
          current_pirate_points: Number(newPts) || 0,
        },
      }),
    onSuccess: () => {
      toast.success("Nalog dodan.");
      setAddOpen(false);
      setNewName("");
      setNewPts("0");
      qc.invalidateQueries({ queryKey: ["my-accounts"] });
      qc.invalidateQueries({ queryKey: ["all-accounts"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: any) => toast.error("Greška", { description: e?.message }),
  });

  return (
    <div>
      <PageHeader
        title="Moji nalozi"
        description="Tvoji Ikariam nalozi i trenutni piratski poeni."
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
                  disabled={!newName.trim() || addMut.isPending}
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
              onUpdate={async (pts) => {
                await updFn({ data: { account_id: a.id, points: pts } });
                toast.success("Poeni ažurirani.");
                qc.invalidateQueries({ queryKey: ["my-accounts"] });
                qc.invalidateQueries({ queryKey: ["all-accounts"] });
                qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
              }}
              onDelete={async () => {
                await delFn({ data: { account_id: a.id } });
                toast.success("Nalog obrisan.");
                qc.invalidateQueries({ queryKey: ["my-accounts"] });
                qc.invalidateQueries({ queryKey: ["all-accounts"] });
                qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AccountCard({
  account,
  onUpdate,
  onDelete,
}: {
  account: any;
  onUpdate: (pts: number) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [pts, setPts] = useState(String(account.current_pirate_points));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const n = Number(pts);
    if (!Number.isInteger(n) || n < 0) {
      toast.error("Unesi cijeli pozitivan broj.");
      return;
    }
    setSaving(true);
    try {
      await onUpdate(n);
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
        </div>
        <Anchor className="size-5 text-gold shrink-0" />
      </div>

      <div className="rounded-xl bg-background/40 border border-border p-4">
        <div className="text-xs text-muted-foreground">Pirate poeni</div>
        {editing ? (
          <div className="mt-2 flex gap-2">
            <Input
              type="number"
              min={0}
              value={pts}
              onChange={(e) => setPts(e.target.value)}
              className="text-lg"
            />
            <Button onClick={save} disabled={saving} size="sm">
              {saving ? "..." : "Sačuvaj"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPts(String(account.current_pirate_points));
                setEditing(false);
              }}
            >
              Otkaži
            </Button>
          </div>
        ) : (
          <div className="font-display text-3xl text-gold mt-1">
            {Number(account.current_pirate_points).toLocaleString("bs-BA")}
          </div>
        )}
      </div>

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
      )}
    </div>
  );
}

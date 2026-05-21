import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  assignRole,
  deleteUser,
  removeRole,
  setBaunPasscode,
  setUserActive,
} from "@/lib/admin.functions";
import { useCurrentUser, type AppRole } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.session.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roles) throw redirect({ to: "/dashboard" });
  },
  component: AdminPage,
});

function AdminPage() {
  return (
    <div>
      <PageHeader
        title="Admin panel"
        description="Upravljanje passcode-om, ulogama i korisnicima."
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PasscodeCard />
        <div />
      </div>
      <UsersTable />
    </div>
  );
}

function PasscodeCard() {
  const fn = useServerFn(setBaunPasscode);
  const [val, setVal] = useState("");
  const mut = useMutation({
    mutationFn: () => fn({ data: { new_passcode: val } }),
    onSuccess: () => {
      toast.success("BAUN passcode promijenjen.");
      setVal("");
    },
    onError: (e: any) => toast.error("Greška", { description: e?.message }),
  });
  return (
    <div className="pirate-card rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-1">
        <KeyRound className="size-4 text-gold" />
        <h2 className="font-display text-lg">BAUN passcode</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Passcode koji savez koristi tokom registracije. Promijeni i podijeli sa
        pirateima.
      </p>
      <div className="space-y-3">
        <Label>Novi passcode</Label>
        <Input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="Min. 4 znaka"
          minLength={4}
        />
        <Button
          disabled={val.length < 4 || mut.isPending}
          onClick={() => mut.mutate()}
        >
          {mut.isPending ? "Snimam..." : "Sačuvaj passcode"}
        </Button>
      </div>
    </div>
  );
}

function UsersTable() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const assign = useServerFn(assignRole);
  const remove = useServerFn(removeRole);
  const setActive = useServerFn(setUserActive);
  const del = useServerFn(deleteUser);

  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      const { data: roles } = await supabase.from("user_roles").select("*");
      const rm = new Map<string, AppRole[]>();
      (roles ?? []).forEach((r) => {
        const list = rm.get(r.user_id) ?? [];
        list.push(r.role as AppRole);
        rm.set(r.user_id, list);
      });
      return (profiles ?? []).map((p) => ({ ...p, roles: rm.get(p.id) ?? [] }));
    },
  });

  return (
    <div className="pirate-card rounded-2xl p-6 mt-6">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck className="size-4 text-gold" />
        <h2 className="font-display text-lg">Korisnici</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-background/40">
            <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground">
              <th className="px-3 py-2">Username</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Aktivan</th>
              <th className="px-3 py-2 text-right">Akcije</th>
            </tr>
          </thead>
          <tbody>
            {users.isLoading ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  Učitavam...
                </td>
              </tr>
            ) : (
              users.data!.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-3 py-3 font-medium">{u.username}</td>
                  <td className="px-3 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => (
                        <span
                          key={r}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-widest rounded-full bg-gold/10 border border-gold/30 text-gold"
                        >
                          {r.replace("_", " ")}
                          {!(u.id === me?.user.id && r === "admin") && (
                            <button
                              className="ml-1 text-destructive hover:opacity-80"
                              onClick={async () => {
                                try {
                                  await remove({
                                    data: { target_user_id: u.id, role: r },
                                  });
                                  toast.success("Rola oduzeta.");
                                  qc.invalidateQueries({ queryKey: ["admin-users"] });
                                } catch (e: any) {
                                  toast.error("Greška", { description: e?.message });
                                }
                              }}
                            >
                              ×
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                    <div className="mt-2">
                      <Select
                        onValueChange={async (v) => {
                          try {
                            await assign({
                              data: { target_user_id: u.id, role: v as AppRole },
                            });
                            toast.success("Rola dodijeljena.");
                            qc.invalidateQueries({ queryKey: ["admin-users"] });
                          } catch (e: any) {
                            toast.error("Greška", { description: e?.message });
                          }
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs w-40">
                          <SelectValue placeholder="+ Dodaj rolu" />
                        </SelectTrigger>
                        <SelectContent>
                          {(["admin", "glavni_pirat", "korisnik"] as AppRole[])
                            .filter((r) => !u.roles.includes(r))
                            .map((r) => (
                              <SelectItem key={r} value={r}>
                                {r.replace("_", " ")}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <Switch
                      checked={u.is_active}
                      disabled={u.id === me?.user.id}
                      onCheckedChange={async (v) => {
                        try {
                          await setActive({
                            data: { target_user_id: u.id, is_active: v },
                          });
                          toast.success(v ? "Aktiviran." : "Deaktiviran.");
                          qc.invalidateQueries({ queryKey: ["admin-users"] });
                        } catch (e: any) {
                          toast.error("Greška", { description: e?.message });
                        }
                      }}
                    />
                  </td>
                  <td className="px-3 py-3 text-right">
                    {u.id !== me?.user.id && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="text-destructive">
                            <Trash2 className="size-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Obrisati korisnika?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Brisanje korisnika <b>{u.username}</b> obrisaće i sve
                              njegove naloge i unose. Akcija je nepovratna.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Otkaži</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={async () => {
                                try {
                                  await del({ data: { target_user_id: u.id } });
                                  toast.success("Obrisan.");
                                  qc.invalidateQueries({ queryKey: ["admin-users"] });
                                } catch (e: any) {
                                  toast.error("Greška", { description: e?.message });
                                }
                              }}
                            >
                              Obriši
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

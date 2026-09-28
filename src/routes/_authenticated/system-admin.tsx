import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTenant } from "@/hooks/use-tenant";
import {
  sysAddMembership,
  sysOverview,
  sysSaveAlliance,
  sysSaveWorld,
  sysSetAllianceVisibility,
  sysSetMembershipRoles,
  sysSetUserVisibility,
} from "@/lib/system-admin.functions";

export const Route = createFileRoute("/_authenticated/system-admin")({
  component: SystemAdminPage,
  head: () => ({
    meta: [
      { title: "System Admin | Pirate Tracker" },
      { name: "description", content: "Upravljanje svjetovima, savezima, članstvima i vidljivošću." },
      { property: "og:title", content: "System Admin | Pirate Tracker" },
      { property: "og:description", content: "Globalna administracija Pirate Trackera." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const ROLES = ["admin", "glavni_pirat", "pirat", "ide_na_plasman", "korisnik"] as const;
const PERMS = [
  ["can_view_global_highscore", "Highscore"],
  ["can_view_global_clusters", "Klasteri"],
  ["can_view_global_nearest_points", "Najbliži"],
  ["can_view_global_map", "Mapa"],
] as const;
type PermKey = (typeof PERMS)[number][0];

function err(e: any) {
  toast.error("Greška", { description: e?.message ?? String(e) });
}

function SystemAdminPage() {
  const { isSystemAdmin, loading } = useCurrentUser();
  const fetchOverview = useServerFn(sysOverview);
  const q = useQuery({
    queryKey: ["sys-overview"],
    enabled: isSystemAdmin,
    queryFn: () => fetchOverview(),
  });
  if (loading) return <div className="text-sm text-muted-foreground">Učitavam...</div>;
  if (!isSystemAdmin)
    return <div className="text-sm text-muted-foreground">Nemaš pristup ovoj stranici.</div>;
  const d = q.data;
  return (
    <div>
      <PageHeader title="System Admin" description="Svjetovi, savezi, članstva, view-as i globalna vidljivost." />
      {!d ? (
        <div className="text-sm text-muted-foreground">Učitavam...</div>
      ) : (
        <Tabs defaultValue="worlds">
          <TabsList className="mb-4 flex-wrap h-auto">
            <TabsTrigger value="worlds">Svjetovi</TabsTrigger>
            <TabsTrigger value="alliances">Savezi</TabsTrigger>
            <TabsTrigger value="members">Članstva</TabsTrigger>
            <TabsTrigger value="viewas">Gledaj kao</TabsTrigger>
            <TabsTrigger value="visibility">Globalna vidljivost</TabsTrigger>
          </TabsList>
          <TabsContent value="worlds"><Worlds d={d} /></TabsContent>
          <TabsContent value="alliances"><Alliances d={d} /></TabsContent>
          <TabsContent value="members"><Members d={d} /></TabsContent>
          <TabsContent value="viewas"><ViewAs d={d} /></TabsContent>
          <TabsContent value="visibility"><Visibility d={d} /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}

type Overview = Awaited<ReturnType<typeof sysOverview>>;

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["sys-overview"] });
    qc.invalidateQueries({ queryKey: ["tenant-context"] });
  };
}

function Worlds({ d }: { d: Overview }) {
  const save = useServerFn(sysSaveWorld);
  const refresh = useRefresh();
  const [form, setForm] = useState({ id: "", name: "", country_code: "", country_name: "", flag_emoji: "" });
  const submit = async () => {
    try {
      await save({ data: { ...form, id: form.id || undefined } });
      toast.success("Svijet sačuvan.");
      setForm({ id: "", name: "", country_code: "", country_name: "", flag_emoji: "" });
      refresh();
    } catch (e) { err(e); }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="pirate-card rounded-2xl p-4 space-y-2">
        {d.worlds.map((w: any) => (
          <div key={w.id} className="flex items-center justify-between border-b border-border py-2 text-sm">
            <span>{w.flag_emoji} {w.name} <span className="text-muted-foreground">· {w.country_name ?? "—"}</span></span>
            <Button size="sm" variant="ghost" onClick={() => setForm({ id: w.id, name: w.name, country_code: w.country_code ?? "", country_name: w.country_name ?? "", flag_emoji: w.flag_emoji ?? "" })}>Uredi</Button>
          </div>
        ))}
      </div>
      <div className="pirate-card rounded-2xl p-4 space-y-3">
        <h3 className="font-display">{form.id ? "Uredi svijet" : "Novi svijet"}</h3>
        {(["name", "country_code", "country_name", "flag_emoji"] as const).map((k) => (
          <div key={k} className="space-y-1">
            <Label>{{ name: "Naziv", country_code: "Kod države (npr. GB)", country_name: "Država", flag_emoji: "Zastava (emoji)" }[k]}</Label>
            <Input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
          </div>
        ))}
        <div className="flex gap-2">
          <Button onClick={submit} disabled={!form.name.trim()}>Sačuvaj</Button>
          {form.id && <Button variant="outline" onClick={() => setForm({ id: "", name: "", country_code: "", country_name: "", flag_emoji: "" })}>Otkaži</Button>}
        </div>
      </div>
    </div>
  );
}

function Alliances({ d }: { d: Overview }) {
  const save = useServerFn(sysSaveAlliance);
  const refresh = useRefresh();
  const empty = { id: "", world_id: d.worlds[0]?.id ?? "", name: "", tag: "", passcode: "", is_active: true };
  const [form, setForm] = useState(empty);
  const submit = async () => {
    try {
      await save({ data: { ...form, id: form.id || undefined, passcode: form.passcode || null } });
      toast.success("Savez sačuvan.");
      setForm(empty);
      refresh();
    } catch (e) { err(e); }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="pirate-card rounded-2xl p-4 space-y-4">
        {d.worlds.map((w: any) => (
          <div key={w.id}>
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{w.flag_emoji} {w.name}</div>
            {d.alliances.filter((a: any) => a.world_id === w.id).map((a: any) => (
              <div key={a.id} className="flex items-center justify-between border-b border-border py-2 text-sm">
                <span>
                  <span className="font-display text-gold">{a.tag}</span> {a.name}
                  {!a.is_active && <span className="ml-2 text-destructive text-xs">neaktivan</span>}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {d.memberships.filter((m: any) => m.alliance_id === a.id).length} članova
                  </span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => setForm({ id: a.id, world_id: a.world_id, name: a.name, tag: a.tag, passcode: "", is_active: a.is_active })}>Uredi</Button>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="pirate-card rounded-2xl p-4 space-y-3">
        <h3 className="font-display">{form.id ? "Uredi savez" : "Novi savez"}</h3>
        <div className="space-y-1">
          <Label>Svijet</Label>
          <Select value={form.world_id} onValueChange={(v) => setForm({ ...form, world_id: v })}>
            <SelectTrigger><SelectValue placeholder="Odaberi svijet" /></SelectTrigger>
            <SelectContent>
              {d.worlds.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.flag_emoji} {w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label>Naziv</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="space-y-1"><Label>Tag</Label><Input value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} /></div>
        <div className="space-y-1">
          <Label>{form.id ? "Novi passcode (ostavi prazno da ostane isti)" : "Passcode"}</Label>
          <Input value={form.passcode} onChange={(e) => setForm({ ...form, passcode: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /> Aktivan
        </label>
        <div className="flex gap-2">
          <Button onClick={submit} disabled={!form.name.trim() || !form.tag.trim() || !form.world_id}>Sačuvaj</Button>
          {form.id && <Button variant="outline" onClick={() => setForm(empty)}>Otkaži</Button>}
        </div>
      </div>
    </div>
  );
}

function Members({ d }: { d: Overview }) {
  const add = useServerFn(sysAddMembership);
  const setRoles = useServerFn(sysSetMembershipRoles);
  const refresh = useRefresh();
  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState("");
  const [allianceId, setAllianceId] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("korisnik");
  const alName = (id: string) => {
    const a = d.alliances.find((x: any) => x.id === id) as any;
    const w = d.worlds.find((x: any) => x.id === a?.world_id) as any;
    return a ? `${w?.flag_emoji ?? ""} ${w?.name ?? ""} / ${a.tag}` : id;
  };
  const users = useMemo(() => {
    const s = search.trim().toLowerCase();
    return d.profiles.filter((p: any) => !s || p.username.toLowerCase().includes(s) || p.email.toLowerCase().includes(s));
  }, [d.profiles, search]);

  const toggleRole = async (m: any, r: string, on: boolean) => {
    const cur = d.roles.filter((x: any) => x.user_id === m.user_id && x.alliance_id === m.alliance_id).map((x: any) => x.role);
    const next = on ? [...new Set([...cur, r])] : cur.filter((x: string) => x !== r);
    try {
      await setRoles({ data: { user_id: m.user_id, alliance_id: m.alliance_id, roles: next as any, is_active: m.is_active } });
      refresh();
    } catch (e) { err(e); }
  };
  const toggleActive = async (m: any, on: boolean) => {
    const cur = d.roles.filter((x: any) => x.user_id === m.user_id && x.alliance_id === m.alliance_id).map((x: any) => x.role);
    try {
      await setRoles({ data: { user_id: m.user_id, alliance_id: m.alliance_id, roles: cur as any, is_active: on } });
      refresh();
    } catch (e) { err(e); }
  };

  return (
    <div className="space-y-4">
      <div className="pirate-card rounded-2xl p-4 grid gap-3 md:grid-cols-4 items-end">
        <div className="space-y-1">
          <Label>Korisnik</Label>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger><SelectValue placeholder="Odaberi korisnika" /></SelectTrigger>
            <SelectContent>
              {d.profiles.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.username}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Svijet / savez</Label>
          <Select value={allianceId} onValueChange={setAllianceId}>
            <SelectTrigger><SelectValue placeholder="Odaberi savez" /></SelectTrigger>
            <SelectContent>
              {d.alliances.map((a: any) => <SelectItem key={a.id} value={a.id}>{alName(a.id)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Rola</Label>
          <Select value={role} onValueChange={(v) => setRole(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r.replaceAll("_", " ")}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button
          disabled={!userId || !allianceId}
          onClick={async () => {
            try {
              await add({ data: { user_id: userId, alliance_id: allianceId, role } });
              toast.success("Članstvo dodano.");
              refresh();
            } catch (e) { err(e); }
          }}
        >Dodaj članstvo</Button>
      </div>

      <Input placeholder="Pretraži korisnika (ime ili email)..." value={search} onChange={(e) => setSearch(e.target.value)} />

      <div className="pirate-card rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-muted-foreground bg-card/30">
            <tr><th className="text-left p-3">Korisnik</th><th className="text-left p-3">Članstvo</th><th className="text-left p-3">Role</th><th className="text-left p-3">Aktivno</th></tr>
          </thead>
          <tbody>
            {users.flatMap((p: any) => {
              const ms = d.memberships.filter((m: any) => m.user_id === p.id);
              if (ms.length === 0)
                return [<tr key={p.id} className="border-t border-border"><td className="p-3">{p.username}</td><td className="p-3 text-muted-foreground" colSpan={3}>Bez članstva</td></tr>];
              return ms.map((m: any) => {
                const rs = d.roles.filter((x: any) => x.user_id === m.user_id && x.alliance_id === m.alliance_id).map((x: any) => x.role);
                return (
                  <tr key={m.id} className="border-t border-border">
                    <td className="p-3">{p.username}<div className="text-xs text-muted-foreground">{p.email}</div></td>
                    <td className="p-3">{alName(m.alliance_id)}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-3">
                        {ROLES.map((r) => (
                          <label key={r} className="flex items-center gap-1 text-xs">
                            <Checkbox checked={rs.includes(r)} onCheckedChange={(v) => toggleRole(m, r, !!v)} />
                            {r.replaceAll("_", " ")}
                          </label>
                        ))}
                      </div>
                    </td>
                    <td className="p-3"><Switch checked={m.is_active} onCheckedChange={(v) => toggleActive(m, v)} /></td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ViewAs({ d }: { d: Overview }) {
  const { tenant, switchTo } = useTenant();
  const [worldId, setWorldId] = useState(tenant?.activeWorld?.id ?? d.worlds[0]?.id ?? "");
  const [allianceId, setAllianceId] = useState("");
  const list = d.alliances.filter((a: any) => a.world_id === worldId);
  return (
    <div className="pirate-card rounded-2xl p-4 space-y-3 max-w-lg">
      <div className="text-sm text-muted-foreground">
        Trenutno: {tenant?.activeWorld?.flag_emoji} {tenant?.activeWorld?.name} / {tenant?.activeAlliance?.tag}
      </div>
      <div className="space-y-1">
        <Label>Svijet</Label>
        <Select value={worldId} onValueChange={(v) => { setWorldId(v); setAllianceId(""); }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{d.worlds.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.flag_emoji} {w.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Savez</Label>
        <Select value={allianceId} onValueChange={setAllianceId}>
          <SelectTrigger><SelectValue placeholder="Odaberi savez" /></SelectTrigger>
          <SelectContent>{list.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.tag} · {a.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Button
        disabled={!allianceId}
        onClick={async () => {
          try { await switchTo(allianceId); toast.success("Kontekst aktiviran."); } catch (e) { err(e); }
        }}
      >Aktiviraj kontekst</Button>
    </div>
  );
}

function Visibility({ d }: { d: Overview }) {
  const setA = useServerFn(sysSetAllianceVisibility);
  const setU = useServerFn(sysSetUserVisibility);
  const refresh = useRefresh();
  const [worldId, setWorldId] = useState(d.worlds[0]?.id ?? "");
  const alliances = d.alliances.filter((a: any) => a.world_id === worldId);
  const memberIds = new Set(d.memberships.filter((m: any) => m.world_id === worldId).map((m: any) => m.user_id));
  const users = d.profiles.filter((p: any) => memberIds.has(p.id));

  const aPerm = (id: string) => (d.allianceVisibility.find((x: any) => x.alliance_id === id) ?? {}) as any;
  const uPerm = (id: string) => (d.userVisibility.find((x: any) => x.user_id === id && x.world_id === worldId) ?? {}) as any;

  const updA = async (id: string, k: PermKey, v: boolean) => {
    const cur = aPerm(id);
    const next = Object.fromEntries(PERMS.map(([p]) => [p, p === k ? v : !!cur[p]])) as Record<PermKey, boolean>;
    try { await setA({ data: { alliance_id: id, ...next } }); refresh(); } catch (e) { err(e); }
  };
  const updU = async (id: string, k: PermKey, v: string) => {
    const cur = uPerm(id);
    const val = (x: any) => (x === true ? true : x === false ? false : null);
    const next = Object.fromEntries(
      PERMS.map(([p]) => [p, p === k ? (v === "on" ? true : v === "off" ? false : null) : val(cur[p])]),
    ) as Record<PermKey, boolean | null>;
    try { await setU({ data: { user_id: id, world_id: worldId, ...next } }); refresh(); } catch (e) { err(e); }
  };

  return (
    <div className="space-y-4">
      <Select value={worldId} onValueChange={setWorldId}>
        <SelectTrigger className="w-60"><SelectValue /></SelectTrigger>
        <SelectContent>{d.worlds.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.flag_emoji} {w.name}</SelectItem>)}</SelectContent>
      </Select>
      <div className="pirate-card rounded-2xl overflow-x-auto">
        <div className="p-3 font-display">Po savezu (default isključeno)</div>
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-muted-foreground"><tr><th className="text-left p-3">Savez</th>{PERMS.map(([k, l]) => <th key={k} className="p-3">{l}</th>)}</tr></thead>
          <tbody>
            {alliances.map((a: any) => (
              <tr key={a.id} className="border-t border-border">
                <td className="p-3">{a.tag}</td>
                {PERMS.map(([k]) => (
                  <td key={k} className="p-3 text-center"><Switch checked={!!aPerm(a.id)[k]} onCheckedChange={(v) => updA(a.id, k, v)} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pirate-card rounded-2xl overflow-x-auto">
        <div className="p-3 font-display">Po korisniku (ima prednost nad savezom)</div>
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-muted-foreground"><tr><th className="text-left p-3">Korisnik</th>{PERMS.map(([k, l]) => <th key={k} className="p-3">{l}</th>)}</tr></thead>
          <tbody>
            {users.map((u: any) => (
              <tr key={u.id} className="border-t border-border">
                <td className="p-3">{u.username}</td>
                {PERMS.map(([k]) => {
                  const v = uPerm(u.id)[k];
                  return (
                    <td key={k} className="p-2">
                      <Select value={v === true ? "on" : v === false ? "off" : "inherit"} onValueChange={(x) => updU(u.id, k, x)}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inherit">Kao savez</SelectItem>
                          <SelectItem value="on">Uključeno</SelectItem>
                          <SelectItem value="off">Isključeno</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

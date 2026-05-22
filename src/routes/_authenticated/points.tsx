import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Coins, Search, Timer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { collectPoints } from "@/lib/accounts.functions";
import { completeDueMissions } from "@/lib/missions.functions";
import { CoordsLink } from "@/routes/_authenticated/accounts";

export const Route = createFileRoute("/_authenticated/points")({
  component: PointsPage,
});

type SortKey = "points" | "username" | "updated";

function PointsPage() {
  const qc = useQueryClient();
  const { isPirate } = useCurrentUser();
  const collectFn = useServerFn(collectPoints);
  const completeDueFn = useServerFn(completeDueMissions);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("points");
  const [onlyPositive, setOnlyPositive] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState<string>("all");

  useEffect(() => {
    completeDueFn({})
      .then((r) => {
        if (r.completed > 0) {
          qc.invalidateQueries({ queryKey: ["all-accounts"] });
          qc.invalidateQueries({ queryKey: ["my-accounts"] });
          qc.invalidateQueries({ queryKey: ["all-missions"] });
          qc.invalidateQueries({ queryKey: ["my-missions"] });
        }
      })
      .catch(() => undefined);
  }, [completeDueFn, qc]);

  const all = useQuery({
    queryKey: ["all-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ikariam_accounts")
        .select("*")
        .order("current_pirate_points", { ascending: false });
      if (error) throw error;
      const ownerIds = Array.from(new Set(data.map((r) => r.owner_user_id)));
      const collectorIds = Array.from(
        new Set(data.map((r) => r.collected_by_user_id).filter(Boolean)),
      ) as string[];
      const allIds = Array.from(new Set([...ownerIds, ...collectorIds]));
      const profiles =
        allIds.length > 0
          ? (await supabase.from("profiles").select("id, username").in("id", allIds))
              .data ?? []
          : [];
      const m = new Map(profiles.map((p) => [p.id, p.username]));
      return data.map((r) => ({
        ...r,
        owner_username: m.get(r.owner_user_id) ?? "—",
        collected_by_username: r.collected_by_user_id
          ? m.get(r.collected_by_user_id) ?? "—"
          : null,
      }));
    },
  });

  const missions = useQuery({
    queryKey: ["all-missions"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pirate_missions")
        .select("*")
        .eq("status", "pending")
        .order("completes_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const missionsByAccount = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const x of missions.data ?? []) {
      const arr = m.get(x.ikariam_account_id) ?? [];
      arr.push(x);
      m.set(x.ikariam_account_id, arr);
    }
    return m;
  }, [missions.data]);

  const owners = useMemo(() => {
    const map = new Map<string, string>();
    (all.data ?? []).forEach((r) => map.set(r.owner_user_id, r.owner_username));
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [all.data]);

  const rows = useMemo(() => {
    let xs = all.data ?? [];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      xs = xs.filter((r) => r.ikariam_username.toLowerCase().includes(q));
    }
    if (onlyPositive) xs = xs.filter((r) => r.current_pirate_points > 0);
    if (ownerFilter !== "all") xs = xs.filter((r) => r.owner_user_id === ownerFilter);
    const sorted = [...xs];
    if (sort === "points")
      sorted.sort((a, b) => b.current_pirate_points - a.current_pirate_points);
    if (sort === "username")
      sorted.sort((a, b) => a.ikariam_username.localeCompare(b.ikariam_username));
    if (sort === "updated")
      sorted.sort(
        (a, b) =>
          new Date(b.last_updated_at).getTime() -
          new Date(a.last_updated_at).getTime(),
      );
    return sorted;
  }, [all.data, search, sort, onlyPositive, ownerFilter]);

  const totalPoints = useMemo(
    () => rows.reduce((sum, r) => sum + (r.current_pirate_points ?? 0), 0),
    [rows],
  );

  const collectMut = useMutation({
    mutationFn: (id: string) => collectFn({ data: { account_id: id } }),
    onSuccess: () => {
      toast.success("Poeni su uspješno pokupljeni.");
      qc.invalidateQueries({ queryKey: ["all-accounts"] });
      qc.invalidateQueries({ queryKey: ["my-accounts"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: any) => toast.error("Greška", { description: e?.message }),
  });

  return (
    <div>
      <PageHeader
        title="Piratski poeni saveza"
        description="Sumarna lista svih naloga i njihovih trenutnih poena."
      />

      <div className="pirate-card rounded-2xl p-4 mb-4 flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Pretraži po username-u..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="lg:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="points">Sort: Poeni</SelectItem>
            <SelectItem value="username">Sort: Username</SelectItem>
            <SelectItem value="updated">Sort: Update</SelectItem>
          </SelectContent>
        </Select>
        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
          <SelectTrigger className="lg:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Svi vlasnici</SelectItem>
            {owners.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={onlyPositive ? "default" : "outline"}
          onClick={() => setOnlyPositive((v) => !v)}
        >
          Samo &gt;0
        </Button>
      </div>

      <div className="pirate-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-background/40 sticky top-0">
              <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground">
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Koordinate</th>
                <th className="px-4 py-3 text-right">Poeni</th>
                <th className="px-4 py-3">Misije</th>
                <th className="px-4 py-3">Vlasnik</th>
                <th className="px-4 py-3">Update</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Akcija</th>
              </tr>
            </thead>
            <tbody>
              {all.isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                    Učitavam...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    Nema naloga koji odgovaraju filteru.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const ready = r.current_pirate_points > 0;
                  const accMissions = missionsByAccount.get(r.id) ?? [];
                  return (
                    <tr
                      key={r.id}
                      className="border-t border-border hover:bg-accent/30 align-top"
                    >
                      <td className="px-4 py-3 font-medium">{r.ikariam_username}</td>
                      <td className="px-4 py-3">
                        <CoordsLink coords={r.fortress_coordinates ?? ""} />
                      </td>
                      <td className="px-4 py-3 text-right font-display text-gold">
                        {Number(r.current_pirate_points).toLocaleString("bs-BA")}
                      </td>
                      <td className="px-4 py-3 min-w-[12rem]">
                        {accMissions.length === 0 ? (
                          <span className="text-muted-foreground text-xs">—</span>
                        ) : (
                          <div className="space-y-1.5">
                            {accMissions.map((m) => (
                              <MissionRowBar key={m.id} mission={m} />
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.owner_username}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(r.last_updated_at).toLocaleString("bs-BA")}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-widest border " +
                            (ready
                              ? "border-success/40 text-success bg-success/10"
                              : "border-border text-muted-foreground")
                          }
                        >
                          <span
                            className={
                              "size-1.5 rounded-full " +
                              (ready ? "bg-success" : "bg-muted-foreground")
                            }
                          />
                          {ready ? "READY" : "EMPTY"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <CollectButton
                          ready={ready}
                          isPirate={isPirate}
                          loading={collectMut.isPending}
                          username={r.ikariam_username}
                          pts={r.current_pirate_points}
                          onConfirm={() => collectMut.mutate(r.id)}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gold/40 bg-background/40 font-display">
                  <td className="px-4 py-3 uppercase tracking-widest text-xs text-muted-foreground">
                    TOTAL
                  </td>
                  <td />
                  <td className="px-4 py-3 text-right text-gold text-lg">
                    {totalPoints.toLocaleString("bs-BA")}
                  </td>
                  <td colSpan={5} className="px-4 py-3 text-xs text-muted-foreground">
                    {rows.length} naloga prikazano
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

function MissionRowBar({ mission }: { mission: any }) {
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
  const totalH = mission.mission_type === "mission_16h" ? 16 : 8;
  const elapsedH = Math.floor(elapsed / 3_600_000);
  const elapsedM = Math.floor((elapsed % 3_600_000) / 60_000);
  const label = mission.mission_type === "mission_16h" ? "16h" : "8h";
  return (
    <div className="space-y-1">
      <div className="text-[11px] flex items-center gap-1.5">
        <Timer className="size-3 text-gold" />
        <span className="font-medium">{label} misija</span>
        <span className="text-muted-foreground">
          {elapsedH}h {elapsedM}m / {totalH}h
        </span>
        <span className="text-success">· +{mission.reward_points}</span>
      </div>
      <Progress value={pct} className="h-1" />
      <div className="text-[10px] text-muted-foreground">
        ostalo {remH}h {remM}m
      </div>
    </div>
  );
}

function CollectButton({
  ready,
  isPirate,
  loading,
  username,
  pts,
  onConfirm,
}: {
  ready: boolean;
  isPirate: boolean;
  loading: boolean;
  username: string;
  pts: number;
  onConfirm: () => void;
}) {
  if (!isPirate) {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button size="sm" variant="outline" disabled>
                <Coins className="size-3.5 mr-1.5" /> Pokupi
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            Samo glavni pirati mogu označiti poene kao pokupljene.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" disabled={!ready || loading}>
          <Coins className="size-3.5 mr-1.5" />
          Pokupi
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Pokupiti poene?</AlertDialogTitle>
          <AlertDialogDescription>
            Resetuje poene naloga <b>{username}</b> sa{" "}
            <b>{pts.toLocaleString("bs-BA")}</b> na <b>0</b>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Otkaži</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Pokupi</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

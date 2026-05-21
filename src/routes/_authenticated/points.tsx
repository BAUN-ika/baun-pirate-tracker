import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Coins, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export const Route = createFileRoute("/_authenticated/points")({
  component: PointsPage,
});

type SortKey = "points" | "username" | "updated";

function PointsPage() {
  const qc = useQueryClient();
  const { isPirate } = useCurrentUser();
  const collectFn = useServerFn(collectPoints);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("points");
  const [onlyPositive, setOnlyPositive] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState<string>("all");

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
        title="Piratski poeni"
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
                <th className="px-4 py-3 text-right">Poeni</th>
                <th className="px-4 py-3">Vlasnik</th>
                <th className="px-4 py-3">Update</th>
                <th className="px-4 py-3">Pokupljeno</th>
                <th className="px-4 py-3">Ko</th>
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
                  return (
                    <tr
                      key={r.id}
                      className="border-t border-border hover:bg-accent/30"
                    >
                      <td className="px-4 py-3 font-medium">{r.ikariam_username}</td>
                      <td className="px-4 py-3 text-right font-display text-gold">
                        {Number(r.current_pirate_points).toLocaleString("bs-BA")}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.owner_username}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(r.last_updated_at).toLocaleString("bs-BA")}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {r.last_collected_at
                          ? new Date(r.last_collected_at).toLocaleString("bs-BA")
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.collected_by_username ?? "—"}
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
          </table>
        </div>
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

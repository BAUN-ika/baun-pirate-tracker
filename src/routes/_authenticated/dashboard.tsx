import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Anchor,
  Coins,
  Flame,
  ListOrdered,
  TimerReset,
  Activity,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  formatCountdown,
  getCurrentPeriod,
  msUntilNextReset,
} from "@/lib/period";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Stat({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
}) {
  return (
    <div className={"pirate-card rounded-2xl p-5 " + (accent ? "pirate-card-glow" : "")}>
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        <Icon className={"size-4 " + (accent ? "text-gold" : "text-muted-foreground")} />
      </div>
      <div className={"mt-3 font-display text-2xl " + (accent ? "text-gold" : "")}>
        {value}
      </div>
    </div>
  );
}

function Dashboard() {
  const { data: me } = useCurrentUser();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [accountsRes, entriesRes, lastUpdRes] = await Promise.all([
        supabase
          .from("ikariam_accounts")
          .select("id, current_pirate_points"),
        supabase
          .from("highscore_entries")
          .select("id", { count: "exact", head: true })
          .gte("period_start", getCurrentPeriod().start.toISOString()),
        supabase
          .from("ikariam_accounts")
          .select("last_updated_at")
          .order("last_updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const accs = accountsRes.data ?? [];
      const total = accs.length;
      const sum = accs.reduce((a, r) => a + (r.current_pirate_points ?? 0), 0);
      const withPoints = accs.filter((r) => (r.current_pirate_points ?? 0) > 0).length;
      return {
        total,
        sum,
        withPoints,
        lastUpdate: lastUpdRes.data?.last_updated_at ?? null,
        highscoreCount: entriesRes.count ?? 0,
      };
    },
  });

  const activity = useQuery({
    queryKey: ["dashboard-activity"],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_logs")
        .select("id, action, metadata, created_at, user_id")
        .order("created_at", { ascending: false })
        .limit(10);
      const ids = Array.from(new Set((data ?? []).map((r) => r.user_id).filter(Boolean)));
      const profiles =
        ids.length > 0
          ? (await supabase.from("profiles").select("id, username").in("id", ids))
              .data ?? []
          : [];
      const nameMap = new Map(profiles.map((p) => [p.id, p.username]));
      return (data ?? []).map((r) => ({
        ...r,
        username: r.user_id ? nameMap.get(r.user_id) ?? "—" : "sistem",
      }));
    },
  });

  return (
    <div>
      <PageHeader
        title={`Pozdrav, ${me?.profile?.username ?? "pirat"}`}
        description="Pregled stanja saveza i piratskih operacija."
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Stat label="Naloga" value={stats.data?.total ?? "—"} icon={Anchor} />
        <Stat
          label="Ukupno poena"
          value={(stats.data?.sum ?? 0).toLocaleString("bs-BA")}
          icon={Coins}
          accent
        />
        <Stat label="Naloga >0" value={stats.data?.withPoints ?? "—"} icon={Flame} />
        <Stat
          label="Zadnji update"
          value={
            stats.data?.lastUpdate
              ? new Date(stats.data.lastUpdate).toLocaleString("bs-BA")
              : "—"
          }
          icon={Activity}
        />
        <Stat
          label="Highscore unosa (danas)"
          value={stats.data?.highscoreCount ?? "—"}
          icon={ListOrdered}
        />
        <Stat
          label="Highscore reset"
          value={formatCountdown(msUntilNextReset(new Date(now)))}
          icon={TimerReset}
          accent
        />
      </div>

      <div className="mt-8 pirate-card rounded-2xl p-6">
        <h2 className="font-display text-lg mb-4">Posljednje aktivnosti</h2>
        {activity.isLoading ? (
          <div className="text-sm text-muted-foreground">Učitavam...</div>
        ) : (activity.data ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">Još nema aktivnosti.</div>
        ) : (
          <ul className="divide-y divide-border">
            {activity.data!.map((r) => (
              <li key={r.id} className="py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm">
                    <span className="text-gold">{r.username}</span>{" "}
                    <span className="text-muted-foreground">·</span>{" "}
                    <span className="font-medium">
                      {prettifyAction(r.action)}
                    </span>
                  </div>
                  {r.metadata && (
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {summarizeMeta(r.metadata)}
                    </div>
                  )}
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString("bs-BA")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function prettifyAction(a: string): string {
  const map: Record<string, string> = {
    add_account: "dodao nalog",
    update_points: "ažurirao poene",
    delete_account: "obrisao nalog",
    collect_points: "pokupio poene",
    submit_highscore: "poslao highscore",
    change_passcode: "promijenio passcode",
    assign_role: "dodijelio rolu",
    remove_role: "oduzeo rolu",
    activate_user: "aktivirao korisnika",
    deactivate_user: "deaktivirao korisnika",
    delete_user: "obrisao korisnika",
  };
  return map[a] ?? a;
}
function summarizeMeta(m: any): string {
  if (!m || typeof m !== "object") return "";
  if (m.ikariam_username) return `${m.ikariam_username}${m.points != null ? ` → ${m.points}` : ""}${m.collected != null ? ` (skup. ${m.collected})` : ""}`;
  if (m.count != null) return `${m.count} unosa`;
  if (m.role) return `rola: ${m.role}`;
  return "";
}

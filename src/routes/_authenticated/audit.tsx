import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/audit")({
  component: AuditPage,
});

const ACTION_LABEL: Record<string, string> = {
  add_account: "Dodavanje naloga",
  update_points: "Update poena",
  delete_account: "Brisanje naloga",
  collect_points: "Pokupljeni poeni",
  submit_highscore: "Highscore unos",
  change_passcode: "Promjena passcode-a",
  assign_role: "Dodjela role",
  remove_role: "Oduzimanje role",
  activate_user: "Aktivacija korisnika",
  deactivate_user: "Deaktivacija korisnika",
  delete_user: "Brisanje korisnika",
};

function AuditPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["audit-log"],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);
      const ids = Array.from(
        new Set(
          (data ?? [])
            .map((r) => r.user_id)
            .filter((v): v is string => typeof v === "string"),
        ),
      );
      const profiles =
        ids.length > 0
          ? (await supabase.from("profiles").select("id, username").in("id", ids))
              .data ?? []
          : [];
      const m = new Map(profiles.map((p) => [p.id, p.username]));
      return (data ?? []).map((r) => ({
        ...r,
        username: r.user_id ? m.get(r.user_id) ?? "—" : "sistem",
      }));
    },
  });

  return (
    <div>
      <PageHeader title="Audit log" description="Sve važne akcije u sistemu." />
      <div className="pirate-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-background/40">
              <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground">
                <th className="px-4 py-3">Vrijeme</th>
                <th className="px-4 py-3">Korisnik</th>
                <th className="px-4 py-3">Akcija</th>
                <th className="px-4 py-3">Entitet</th>
                <th className="px-4 py-3">Detalji</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    Učitavam...
                  </td>
                </tr>
              ) : (data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    Nema zapisa.
                  </td>
                </tr>
              ) : (
                data!.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString("bs-BA")}
                    </td>
                    <td className="px-4 py-2.5 text-gold">{r.username}</td>
                    <td className="px-4 py-2.5">
                      {ACTION_LABEL[r.action] ?? r.action}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {r.entity_type ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-md truncate">
                      {r.metadata ? JSON.stringify(r.metadata) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

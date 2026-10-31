import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({ meta: [{"title": "Audit log | Pirate Tracker"}, {"name": "description", "content": "Istorija akcija u aktivnom savezu."}, {"property": "og:title", "content": "Audit log | Pirate Tracker"}, {"property": "og:description", "content": "Istorija akcija u aktivnom savezu."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
  component: AuditPage,
});

const ACTION_LABEL: Record<string, string> = {
  add_account: "Dodavanje naloga",
  update_points: "Update poena",
  update_coordinates: "Update koordinata",
  delete_account: "Brisanje naloga",
  collect_points: "Pokupljeni poeni",
  submit_highscore: "Highscore unos",
  highscore_manual_submission_created: "Highscore unos (ručni)",
  highscore_scanner_submission_created: "Highscore unos (skener)",
  highscore_mixed_submission_created: "Highscore unos (miješani)",
  current_player_points_submission_created: "Unos vlastitih poena",
  highscore_points_synced_to_account: "Poeni sinhronizovani sa liste",
  highscore_points_sync_skipped: "Preskočena sinhronizacija poena",
  current_player_points_synced_to_account: "Vlastiti poeni ažurirani",
  current_player_points_sync_no_matching_account: "Vlastiti poeni bez naloga",
  mission_start_1h: "Misija pokrenuta (1h)",
  mission_start_2h: "Misija pokrenuta (2h)",
  mission_start_4h: "Misija pokrenuta (4h)",
  mission_start_8h: "Misija pokrenuta (8h)",
  mission_start_16h: "Misija pokrenuta (16h)",
  bulk_mission_started: "Masovna misija pokrenuta",
  mission_cancelled: "Misija otkazana",
  pirate_target_en_route: "Krenuo po poene",
  pirate_target_en_route_cancelled: "Otkazano kretanje",
  pirate_target_collected: "Meta pokupljena",
  pirate_cluster_en_route: "Klaster — krenuo",
  pirate_cluster_en_route_cancelled: "Klaster — otkazano",
  pirate_cluster_collected: "Klaster pokupljen",
  change_passcode: "Promjena passcode-a",
  assign_role: "Dodjela role",
  remove_role: "Oduzimanje role",
  activate_user: "Aktivacija korisnika",
  deactivate_user: "Deaktivacija korisnika",
  delete_user: "Brisanje korisnika",
  total_reset_pirate_points: "Totalni reset poena",
  pirate_round_created: "Piratska runda kreirana",
  pirate_round_end_changed: "Kraj runde promijenjen",
  pirate_region_created: "Rejon kreiran",
  pirate_region_updated: "Rejon ažuriran",
  pirate_region_deleted: "Rejon obrisan",
  pirate_region_players_imported: "Igrači importovani u rejon",
  sys_world_created: "Svijet kreiran",
  sys_world_updated: "Svijet ažuriran",
  sys_alliance_created: "Savez kreiran",
  sys_alliance_updated: "Savez ažuriran",
};

const SOURCE_LABEL: Record<string, string> = {
  manual: "ručno",
  scanner: "Pirate Scanner",
  current_player: "vlastiti unos",
  mixed: "miješano",
};

type Meta = Record<string, unknown> | null;

interface AuditRow {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Meta;
  created_at: string;
  world_id: string | null;
  alliance_id: string | null;
  username: string;
  world_name: string | null;
  alliance_name: string | null;
}

function num(v: unknown): string {
  return typeof v === "number" ? v.toLocaleString("bs-BA") : String(v ?? "—");
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Human-readable one-liner: ko je šta uradio, kome, kada. */
function describeAudit(r: AuditRow): string {
  const m = (r.metadata ?? {}) as Record<string, unknown>;
  const who = str(m.ikariam_username) ?? (r.entity_type === "highscore_target" ? r.entity_id : null);
  switch (r.action) {
    case "add_account":
      return `Dodao nalog ${who ?? ""} ${str(m.fortress_coordinates) ? `(${m.fortress_coordinates})` : ""}`.trim();
    case "update_points":
      return `Postavio ${num(m.points)} poena za ${who ?? "nalog"}${m.previous_points != null ? ` (bilo: ${num(m.previous_points)})` : ""}`;
    case "update_coordinates":
      return `Promijenio koordinate za ${who ?? "nalog"} na ${str(m.fortress_coordinates) ?? "—"}`;
    case "delete_account":
      return `Obrisao nalog ${who ?? ""}`.trim();
    case "collect_points":
      return `Pokupio ${num(m.collected)} poena od ${who ?? "naloga"}`;
    case "highscore_manual_submission_created":
    case "highscore_scanner_submission_created":
    case "highscore_mixed_submission_created":
    case "current_player_points_submission_created":
      return `Uveo highscore listu (${SOURCE_LABEL[str(m.source) ?? ""] ?? str(m.source) ?? "?"}) — ${num(m.valid_count)} igrača${typeof m.invalid_count === "number" && m.invalid_count > 0 ? `, ${num(m.invalid_count)} nevažećih redova` : ""}`;
    case "highscore_points_synced_to_account":
      return `Lista je ažurirala poene za ${who ?? "nalog"} na ${num(m.highscore_points)}`;
    case "highscore_points_sync_skipped":
      return `Preskočeno ažuriranje poena za ${who ?? "nalog"} (noviji unos nakon 18:00)`;
    case "current_player_points_synced_to_account":
      return `Vlastiti poeni ažurirani na ${num(m.points ?? m.highscore_points)}`;
    case "mission_cancelled":
      return `Otkazao misiju${who ? ` za ${who}` : ""}`;
    case "bulk_mission_started":
      return `Pokrenuo masovnu misiju za ${num(m.number_of_accounts)} naloga (+${num(m.reward_points)} poena svaki)`;
    case "pirate_target_en_route":
      return `${str(m.assigned_pirate_name) ?? "Pirat"} krenuo po ${who ?? "metu"}`;
    case "pirate_target_en_route_cancelled":
      return `Otkazano kretanje po ${who ?? "metu"} (bio: ${str(m.assigned_pirate_name) ?? "—"})`;
    case "pirate_target_collected":
      return `Pokupljena meta ${who ?? ""}`.trim();
    case "pirate_cluster_en_route":
      return `${str(m.assigned_pirate_name) ?? "Pirat"} krenuo na klaster ${str(m.cluster_key) ?? r.entity_id ?? ""}`;
    case "pirate_cluster_en_route_cancelled":
      return `Otkazano kretanje na klaster ${str(m.cluster_key) ?? r.entity_id ?? ""}`;
    case "pirate_cluster_collected":
      return `Pokupljen klaster ${str(m.cluster_key) ?? r.entity_id ?? ""}`;
    case "assign_role":
      return `Dodijelio rolu ${str(m.role) ?? ""}`.trim();
    case "remove_role":
      return `Oduzeo rolu ${str(m.role) ?? ""}`.trim();
    case "total_reset_pirate_points":
      return "Izvršio totalni reset piratskih poena";
    case "pirate_region_players_imported":
      return `Importovao igrače u rejon${str(m.region_name) ? ` ${m.region_name}` : ""}`;
    default:
      if (r.action.startsWith("mission_start_")) {
        return `Pokrenuo misiju${who ? ` za ${who}` : ""} (+${num(m.reward_points)} poena)`;
      }
      return "";
  }
}

function formatMetaValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number") return v.toLocaleString("bs-BA");
  if (typeof v === "boolean") return v ? "da" : "ne";
  if (typeof v === "string") {
    const d = new Date(v);
    if (/^\d{4}-\d{2}-\d{2}T/.test(v) && !isNaN(d.getTime())) {
      return d.toLocaleString("bs-BA");
    }
    return v;
  }
  if (Array.isArray(v)) return v.map(formatMetaValue).join(", ");
  return JSON.stringify(v);
}

const SENSITIVE_KEYS = /passcode|password|token|secret|hash/i;

function AuditPage() {
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-log"],
    queryFn: async (): Promise<AuditRow[]> => {
      const { data } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);
      const rows = data ?? [];
      const userIds = Array.from(
        new Set(rows.map((r) => r.user_id).filter((v): v is string => typeof v === "string")),
      );
      const worldIds = Array.from(
        new Set(rows.map((r) => r.world_id).filter((v): v is string => typeof v === "string")),
      );
      const allianceIds = Array.from(
        new Set(rows.map((r) => r.alliance_id).filter((v): v is string => typeof v === "string")),
      );
      const [profiles, worlds, alliances] = await Promise.all([
        userIds.length
          ? supabase.from("profiles").select("id, username").in("id", userIds)
          : Promise.resolve({ data: [] }),
        worldIds.length
          ? supabase.from("worlds").select("id, name").in("id", worldIds)
          : Promise.resolve({ data: [] }),
        allianceIds.length
          ? supabase.from("alliances").select("id, name, tag").in("id", allianceIds)
          : Promise.resolve({ data: [] }),
      ]);
      const pm = new Map((profiles.data ?? []).map((p) => [p.id, p.username]));
      const wm = new Map((worlds.data ?? []).map((w) => [w.id, w.name]));
      const am = new Map(
        (alliances.data ?? []).map((a) => [a.id, a.tag ? `${a.name} (${a.tag})` : a.name]),
      );
      return rows.map((r) => ({
        ...r,
        metadata: (r.metadata as Meta) ?? null,
        username: r.user_id ? (pm.get(r.user_id) ?? "—") : "sistem",
        world_name: r.world_id ? (wm.get(r.world_id) ?? null) : null,
        alliance_name: r.alliance_id ? (am.get(r.alliance_id) ?? null) : null,
      }));
    },
  });

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Sve važne akcije u sistemu. Klikni na red za potpune detalje."
      />
      <div className="pirate-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-background/40">
              <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground">
                <th className="px-4 py-3">Vrijeme</th>
                <th className="px-4 py-3">Korisnik</th>
                <th className="px-4 py-3">Akcija</th>
                <th className="px-4 py-3">Opis</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    Učitavam...
                  </td>
                </tr>
              ) : (data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    Nema zapisa.
                  </td>
                </tr>
              ) : (
                data!.map((r) => {
                  const desc = describeAudit(r);
                  return (
                    <tr
                      key={r.id}
                      className="border-t border-border cursor-pointer hover:bg-background/30 transition-colors"
                      onClick={() => setSelected(r)}
                      onDoubleClick={() => setSelected(r)}
                      title="Klikni za detalje"
                    >
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString("bs-BA")}
                      </td>
                      <td className="px-4 py-2.5 text-gold whitespace-nowrap">{r.username}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {ACTION_LABEL[r.action] ?? r.action}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-md truncate">
                        {desc || (r.entity_type ?? "—")}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ScrollText className="size-5 text-gold" />
                  {ACTION_LABEL[selected.action] ?? selected.action}
                </DialogTitle>
                <DialogDescription>
                  {new Date(selected.created_at).toLocaleString("bs-BA")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                {describeAudit(selected) && (
                  <p className="text-foreground">{describeAudit(selected)}</p>
                )}
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                  <dt className="text-muted-foreground">Korisnik</dt>
                  <dd className="text-gold">{selected.username}</dd>
                  <dt className="text-muted-foreground">Akcija</dt>
                  <dd>{selected.action}</dd>
                  {selected.entity_type && (
                    <>
                      <dt className="text-muted-foreground">Entitet</dt>
                      <dd className="break-all">
                        {selected.entity_type}
                        {selected.entity_id ? ` · ${selected.entity_id}` : ""}
                      </dd>
                    </>
                  )}
                  {selected.world_name && (
                    <>
                      <dt className="text-muted-foreground">Svijet</dt>
                      <dd>{selected.world_name}</dd>
                    </>
                  )}
                  {selected.alliance_name && (
                    <>
                      <dt className="text-muted-foreground">Savez</dt>
                      <dd>{selected.alliance_name}</dd>
                    </>
                  )}
                </dl>
                {selected.metadata &&
                  Object.keys(selected.metadata).filter((k) => !SENSITIVE_KEYS.test(k)).length >
                    0 && (
                    <div>
                      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1.5">
                        Detalji
                      </div>
                      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl border border-border bg-background/40 p-3 text-xs">
                        {Object.entries(selected.metadata)
                          .filter(([k]) => !SENSITIVE_KEYS.test(k))
                          .map(([k, v]) => (
                            <div key={k} className="contents">
                              <dt className="text-muted-foreground break-all">{k}</dt>
                              <dd className="break-words">{formatMetaValue(v)}</dd>
                            </div>
                          ))}
                      </dl>
                    </div>
                  )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

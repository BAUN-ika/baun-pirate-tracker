import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { parseHighscoreText, type ParsedRow } from "@/lib/parser";
import { submitHighscore } from "@/lib/highscore.functions";
import { getCurrentPeriod } from "@/lib/period";
import { useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/highscore/submit")({
  component: HighscoreSubmitPage,
});

interface AccountInfo {
  id: string;
  ikariam_username: string;
  owner_user_id: string;
}

function useAccountsLookup() {
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  useEffect(() => {
    supabase
      .from("ikariam_accounts")
      .select("id, ikariam_username, owner_user_id")
      .then(({ data }) => setAccounts(data ?? []));
  }, []);
  return accounts;
}

function HighscoreSubmitPage() {
  const [text, setText] = useState("");
  const parsed = useMemo(() => parseHighscoreText(text), [text]);
  const valid = parsed.filter((r) => r.valid);
  const invalid = parsed.filter((r) => !r.valid);
  const period = getCurrentPeriod();
  const qc = useQueryClient();
  const nav = useNavigate();
  const submit = useServerFn(submitHighscore);
  const accounts = useAccountsLookup();
  const { data: me, isAdmin } = useCurrentUser();

  const cpNote = (uname: string): { label: string; tone: "ok" | "warn" | "err" } => {
    const match = accounts.find(
      (a) => a.ikariam_username.trim().toLowerCase() === uname.trim().toLowerCase(),
    );
    if (!match) return { label: "Nije pronađen odgovarajući nalog za update", tone: "warn" };
    if (!isAdmin && me?.user.id && match.owner_user_id !== me.user.id) {
      return { label: "Nalog postoji, ali nije vaš nalog.", tone: "err" };
    }
    return { label: "Ažurira postojeći nalog", tone: "ok" };
  };

  const mut = useMutation({
    mutationFn: () => submit({ data: { raw_text: text } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error("Snimanje nije uspjelo", { description: res.error });
        return;
      }
      const entries = res.entries_count ?? 0;
      const cp = res.current_player;

      if (entries > 0 && cp?.status === "updated") {
        toast.success("Highscore podaci su sačuvani, a tvoji piratski poeni su ažurirani.");
      } else if (entries > 0) {
        toast.success(`Highscore podaci su uspješno sačuvani (${entries} unosa).`);
      } else if (cp?.status === "updated") {
        toast.success("Tvoji piratski poeni su ažurirani.");
      }
      if (cp?.status === "no_match") {
        toast.warning("Nije pronađen tvoj nalog sa tim username-om.");
      } else if (cp?.status === "not_owned") {
        toast.error("CURRENT_PLAYER nalog ne pripada tebi — preskočeno.");
      }

      qc.invalidateQueries({ queryKey: ["highscore"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      setText("");
      if (entries > 0) nav({ to: "/highscore" });
    },
    onError: (e: any) => toast.error("Greška", { description: e?.message }),
  });

  return (
    <div>
      <PageHeader
        title="Highscore unos"
        description={`Aktuelni period: ${period.start.toLocaleString("bs-BA")} → ${period.end.toLocaleString("bs-BA")}`}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="pirate-card rounded-2xl p-5">
          <h2 className="font-display text-lg mb-2">Zalijepi podatke</h2>
          <p className="text-xs text-muted-foreground mb-3">
            Textarea podržava 3 formata u istom tekstu:
            <br />• <span className="text-foreground">Ručni unos:</span>{" "}
            <code className="text-gold">196 . 10,399 Capture Points Linkinpark88</code>
            <br />• <span className="text-foreground">Pirate Scanner highscore:</span>{" "}
            <code className="text-gold">50. 29,656 points Lundin (-I-) en 40:84, City</code>
            <br />• <span className="text-foreground">CURRENT_PLAYER:</span>{" "}
            <code className="text-gold">CURRENT_PLAYER 37070 points Fire Fly</code>
            <br />
            <span className="text-muted-foreground">
              Prva CURRENT_PLAYER linija ažurira tvoj nalog u "Moji nalozi" i
              "Piratski poeni saveza" (ne snima se kao highscore entry).
            </span>
          </p>

          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={18}
            className="font-mono text-xs"
            placeholder={`CURRENT_PLAYER 37070 points Fire Fly\n50. 29,656 points Lundin (-I-) en 40:84, Lundingeluptus\n196 . 10,399 Capture Points Linkinpark88`}
          />
          <div className="mt-4 flex items-center justify-between gap-2 flex-wrap">
            <div className="text-xs text-muted-foreground">
              Validnih: <span className="text-success">{valid.length}</span> · Nevalidnih:{" "}
              <span className="text-destructive">{invalid.length}</span>
            </div>
            <Button
              disabled={valid.length === 0 || mut.isPending}
              onClick={() => mut.mutate()}
            >
              {mut.isPending ? "Snimam..." : "Sačuvaj highscore unos"}
            </Button>
          </div>
        </div>

        <div className="pirate-card rounded-2xl p-5">
          <h2 className="font-display text-lg mb-3">Pregled</h2>
          {parsed.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Zalijepi tekst da vidiš pregled redova.
            </div>
          ) : (
            <div className="overflow-auto max-h-[32rem]">
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  <tr>
                    <th className="text-left py-1.5 pr-2">St.</th>
                    <th className="text-left py-1.5 pr-2">Type</th>
                    <th className="text-right py-1.5 pr-2">Rank</th>
                    <th className="text-left py-1.5 pr-2">Username</th>
                    <th className="text-right py-1.5 pr-2">Poeni</th>
                    <th className="text-left py-1.5 pr-2">Savez</th>
                    <th className="text-left py-1.5 pr-2">Koord</th>
                    <th className="text-left py-1.5 pr-2">Grad</th>
                    <th className="text-left py-1.5 pr-2">Source</th>
                    <th className="text-left py-1.5">Napomena</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((r, i) => (
                    <PreviewRow key={i} row={r} cpNote={cpNote} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewRow({
  row,
  cpNote,
}: {
  row: ParsedRow;
  cpNote: (u: string) => { label: string; tone: "ok" | "warn" | "err" };
}) {
  if (!row.valid) {
    return (
      <tr className="border-t border-border">
        <td className="py-1.5 pr-2">
          <XCircle className="size-4 text-destructive" />
        </td>
        <td className="py-1.5 pr-2 text-destructive">INVALID</td>
        <td className="py-1.5 pr-2 text-right">—</td>
        <td className="py-1.5 pr-2 italic text-muted-foreground truncate max-w-[14rem]">
          {row.raw}
        </td>
        <td className="py-1.5 pr-2 text-right">—</td>
        <td className="py-1.5 pr-2">—</td>
        <td className="py-1.5 pr-2">—</td>
        <td className="py-1.5 pr-2">—</td>
        <td className="py-1.5 pr-2">—</td>
        <td className="py-1.5 text-destructive">{row.reason ?? "—"}</td>
      </tr>
    );
  }

  const isCp = row.kind === "current_player";
  const type = isCp ? "Current player" : "Highscore";
  const source = row.kind!;
  const note = isCp ? cpNote(row.ikariamUsername!) : null;

  return (
    <tr className="border-t border-border">
      <td className="py-1.5 pr-2">
        <CheckCircle2 className="size-4 text-success" />
      </td>
      <td className="py-1.5 pr-2">
        <span
          className={
            isCp ? "text-gold font-medium" : "text-foreground"
          }
        >
          {type}
        </span>
      </td>
      <td className="py-1.5 pr-2 text-right tabular-nums">{row.rank ?? "—"}</td>
      <td className="py-1.5 pr-2 truncate max-w-[12rem]">
        {row.ikariamUsername}
      </td>
      <td className="py-1.5 pr-2 text-right font-medium tabular-nums">
        {row.piratePoints?.toLocaleString("bs-BA")}
      </td>
      <td className="py-1.5 pr-2">{row.allianceTag ?? "—"}</td>
      <td className="py-1.5 pr-2 tabular-nums text-gold">
        {row.coordinates ?? "—"}
      </td>
      <td className="py-1.5 pr-2 truncate max-w-[10rem]">
        {row.cityName ?? "—"}
      </td>
      <td className="py-1.5 pr-2 text-muted-foreground">{source}</td>
      <td
        className={
          "py-1.5 " +
          (note?.tone === "ok"
            ? "text-success"
            : note?.tone === "warn"
              ? "text-warn"
              : note?.tone === "err"
                ? "text-destructive"
                : "text-muted-foreground")
        }
      >
        {note?.label ?? "—"}
      </td>
    </tr>
  );
}

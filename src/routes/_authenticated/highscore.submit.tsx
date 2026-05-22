import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { parseHighscoreText } from "@/lib/parser";
import { submitHighscore } from "@/lib/highscore.functions";
import { getCurrentPeriod } from "@/lib/period";

export const Route = createFileRoute("/_authenticated/highscore/submit")({
  component: HighscoreSubmitPage,
});

function HighscoreSubmitPage() {
  const [text, setText] = useState("");
  const parsed = useMemo(() => parseHighscoreText(text), [text]);
  const valid = parsed.filter((r) => r.valid);
  const invalid = parsed.filter((r) => !r.valid);
  const period = getCurrentPeriod();
  const qc = useQueryClient();
  const nav = useNavigate();
  const submit = useServerFn(submitHighscore);

  const mut = useMutation({
    mutationFn: () => submit({ data: { raw_text: text } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error("Snimanje nije uspjelo", { description: res.error });
        return;
      }
      toast.success(`Sačuvano ${res.count} unosa.`);
      qc.invalidateQueries({ queryKey: ["highscore"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setText("");
      nav({ to: "/highscore" });
    },
    onError: (e: any) => toast.error("Greška", { description: e?.message }),
  });

  return (
    <div>
      <PageHeader
        title="Highscore unos"
        description={`Aktuelni period: ${period.start.toLocaleString("bs-BA")} → ${period.end.toLocaleString("bs-BA")}`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="pirate-card rounded-2xl p-5">
          <h2 className="font-display text-lg mb-2">Zalijepi podatke iz igre</h2>
          <p className="text-xs text-muted-foreground mb-3">
            Format reda:{" "}
            <code className="text-gold">
              196 . 10,399 Capture Points Linkinpark88
            </code>
            . Parser podržava različite jezike (npr.{" "}
            <code>113 . 14.828 Освајачки поени DunkelTier</code> ili{" "}
            <code>113 . 14,828 Osvajački bodovi DunkelTier</code>). Username
            može imati razmake.
          </p>

          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={16}
            className="font-mono text-xs"
            placeholder={`196 . 10,399  Capture Points Linkinpark88\n197 . 10,317  Capture Points Petar5\n...`}
          />
          <div className="mt-4 flex items-center justify-between">
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
            <div className="overflow-y-auto max-h-[28rem]">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-widest text-muted-foreground">
                  <tr>
                    <th className="text-left py-1.5">Status</th>
                    <th className="text-right py-1.5">Rank</th>
                    <th className="text-left py-1.5 pl-3">Username</th>
                    <th className="text-right py-1.5">Poeni</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-1.5">
                        {r.valid ? (
                          <CheckCircle2 className="size-4 text-success" />
                        ) : (
                          <span title={r.reason}>
                            <XCircle className="size-4 text-destructive" />
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-right">{r.rank ?? "—"}</td>
                      <td className="py-1.5 pl-3 truncate max-w-[14rem]">
                        {r.ikariamUsername ?? (
                          <span className="text-muted-foreground italic">
                            {r.raw}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-right font-medium">
                        {r.piratePoints?.toLocaleString("bs-BA") ?? "—"}
                      </td>
                    </tr>
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

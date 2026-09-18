import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, TimerReset } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setRoundEnd, checkRoundReset } from "@/lib/rounds.functions";
import { useActiveRound } from "@/hooks/use-target-status";
import {
  formatRoundCountdown,
  formatSarajevo,
  sarajevoLocalToUtc,
  utcToSarajevoInputs,
} from "@/lib/period";

/** Admin: kraj trenutnog piratskog ciklusa (21 dan) + ručna provjera reseta. */
export function RoundSettingsCard() {
  const qc = useQueryClient();
  const round = useActiveRound();
  const setEndFn = useServerFn(setRoundEnd);
  const checkFn = useServerFn(checkRoundReset);

  const [date, setDate] = useState("");
  const [time, setTime] = useState("18:00");

  useEffect(() => {
    if (!round.data) return;
    const v = utcToSarajevoInputs(new Date(round.data.ends_at));
    setDate(v.date);
    setTime(v.time);
  }, [round.data?.ends_at]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["active-round"] });
    qc.invalidateQueries({ queryKey: ["target-status"] });
  };

  const save = useMutation({
    mutationFn: () =>
      setEndFn({ data: { ends_at: sarajevoLocalToUtc(date, time).toISOString() } }),
    onSuccess: () => {
      toast.success("Kraj ciklusa sačuvan.");
      invalidate();
    },
    onError: (e: any) => toast.error("Greška", { description: e?.message }),
  });

  const check = useMutation({
    mutationFn: () => checkFn(),
    onSuccess: (r: any) => {
      toast.success(
        r?.processed > 0
          ? `Reset izvršen · novih ciklusa: ${r.processed}`
          : "Ciklus još nije istekao — nema reseta.",
      );
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error("Greška", { description: e?.message }),
  });

  const endsAt = round.data ? new Date(round.data.ends_at) : null;

  return (
    <div className="pirate-card rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-1">
        <TimerReset className="size-4 text-gold" />
        <h2 className="font-display text-lg">Piratski ciklus (21 dan)</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Kada ciklus istekne, poeni svih naloga se resetuju na 0 i statusi meta se
        vraćaju na READY. Istorija pokupljenih poena se ne briše. Vrijeme je
        Sarajevo (Europe/Sarajevo).
      </p>

      {endsAt && (
        <div className="mb-4 text-sm">
          <div className="text-muted-foreground text-xs uppercase tracking-widest">
            Trenutni kraj ciklusa
          </div>
          <div className="font-display text-gold">{formatSarajevo(endsAt)}</div>
          <div className="text-xs text-muted-foreground">
            {formatRoundCountdown(endsAt.getTime() - Date.now())}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <Label htmlFor="round-date" className="text-xs uppercase tracking-widest text-muted-foreground">
            Datum
          </Label>
          <Input
            id="round-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1"
          />
        </div>
        <div className="sm:w-32">
          <Label htmlFor="round-time" className="text-xs uppercase tracking-widest text-muted-foreground">
            Vrijeme
          </Label>
          <Input
            id="round-time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="mt-1"
          />
        </div>
        <Button onClick={() => save.mutate()} disabled={!date || !time || save.isPending}>
          Sačuvaj
        </Button>
        <Button
          variant="outline"
          onClick={() => check.mutate()}
          disabled={check.isPending}
        >
          <RefreshCw className="size-4 mr-1.5" />
          Provjeri reset
        </Button>
      </div>
    </div>
  );
}

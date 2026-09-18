import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AllianceBadge,
  RELATION_LABEL,
  usePlayerRelations,
  type RelationType,
} from "@/components/alliance-badge";
import { upsertPlayerRelation, deletePlayerRelation } from "@/lib/targets.functions";

/** Odnosi na nivou pojedinačnog igrača — imaju prioritet nad odnosom saveza. */
export function PlayerRelationsCard() {
  const qc = useQueryClient();
  const { data, isLoading } = usePlayerRelations();
  const upsertFn = useServerFn(upsertPlayerRelation);
  const deleteFn = useServerFn(deletePlayerRelation);

  const [username, setUsername] = useState("");
  const [type, setType] = useState<RelationType>("protected");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["player-relations"] });

  const save = useMutation({
    mutationFn: () =>
      upsertFn({ data: { ikariam_username: username.trim(), relation_type: type } }),
    onSuccess: () => {
      toast.success("Odnos za igrača sačuvan.");
      setUsername("");
      invalidate();
    },
    onError: (e: any) => toast.error("Greška", { description: e?.message }),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Odnos obrisan.");
      invalidate();
    },
    onError: (e: any) => toast.error("Greška", { description: e?.message }),
  });

  return (
    <div className="pirate-card rounded-2xl p-5 mt-6">
      <div className="flex items-center gap-2 mb-1">
        <User className="size-4 text-gold" />
        <h2 className="font-display text-lg text-gold">Odnosi po igraču</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Odnos definisan za pojedinačnog igrača ima prioritet nad odnosom njegovog
        saveza — prikazuje se svuda u aplikaciji.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-end mb-5">
        <div className="flex-1">
          <Label
            htmlFor="player-rel-name"
            className="text-xs uppercase tracking-widest text-muted-foreground"
          >
            Username igrača
          </Label>
          <Input
            id="player-rel-name"
            placeholder="npr. CrnaBrada"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1"
          />
        </div>
        <Select value={type} onValueChange={(v) => setType(v as RelationType)}>
          <SelectTrigger className="sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="our_alliance">{RELATION_LABEL.our_alliance}</SelectItem>
            <SelectItem value="deal">{RELATION_LABEL.deal}</SelectItem>
            <SelectItem value="protected">{RELATION_LABEL.protected}</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => save.mutate()} disabled={!username.trim() || save.isPending}>
          Sačuvaj
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Učitavam...</div>
      ) : (data ?? []).length === 0 ? (
        <div className="text-sm text-muted-foreground">Nema definisanih igrača.</div>
      ) : (
        <div className="space-y-2">
          {(data ?? []).map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 border border-border rounded-lg px-3 py-2"
            >
              <AllianceBadge
                tag={r.ikariam_username}
                relation={r.relation_type}
                fromPlayer
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => del.mutate(r.id)}
                disabled={del.isPending}
                aria-label="Obriši odnos"
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

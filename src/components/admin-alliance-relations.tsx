import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Flag, Trash2 } from "lucide-react";
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
  useAllianceRelations,
  type RelationType,
} from "@/components/alliance-badge";
import { upsertAllianceRelation, deleteAllianceRelation } from "@/lib/targets.functions";

export function AllianceRelationsCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useAllianceRelations();
  const upsertFn = useServerFn(upsertAllianceRelation);
  const deleteFn = useServerFn(deleteAllianceRelation);

  const [tag, setTag] = useState("");
  const [type, setType] = useState<RelationType>("deal");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["alliance-relations"] });

  const save = useMutation({
    mutationFn: () =>
      upsertFn({ data: { alliance_tag: tag.trim(), relation_type: type } }),
    onSuccess: () => {
      toast.success("Savez sačuvan.");
      setTag("");
      invalidate();
    },
    onError: (e: any) => toast.error("Greška", { description: e?.message }),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Savez obrisan.");
      invalidate();
    },
    onError: (e: any) => toast.error("Greška", { description: e?.message }),
  });

  return (
    <div className="pirate-card rounded-2xl p-5 mt-6">
      <div className="flex items-center gap-2 mb-1">
        <Flag className="size-4 text-gold" />
        <h2 className="font-display text-lg text-gold">Savezi i odnosi</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Definiši koje saveze ne napadamo. Oznake se prikazuju na Highscore listi i
        Piratskim klasterima.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-end mb-5">
        <div className="flex-1">
          <Label htmlFor="ally-tag" className="text-xs uppercase tracking-widest text-muted-foreground">
            Tag saveza
          </Label>
          <Input
            id="ally-tag"
            placeholder="npr. BAUN"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
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
        <Button
          onClick={() => save.mutate()}
          disabled={!tag.trim() || save.isPending}
        >
          Sačuvaj
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Učitavam...</div>
      ) : (data ?? []).length === 0 ? (
        <div className="text-sm text-muted-foreground">Nema definisanih saveza.</div>
      ) : (
        <div className="space-y-2">
          {(data ?? []).map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 border border-border rounded-lg px-3 py-2"
            >
              <AllianceBadge tag={r.alliance_tag} relation={r.relation_type} />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => del.mutate(r.id)}
                disabled={del.isPending}
                aria-label="Obriši savez"
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

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Handshake, Ban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type RelationType = "our_alliance" | "deal" | "protected";

export interface AllianceRelation {
  id: string;
  alliance_tag: string;
  relation_type: RelationType;
}

export const RELATION_LABEL: Record<RelationType, string> = {
  our_alliance: "Naš savez",
  deal: "Dogovor",
  protected: "Zaštićen",
};

export const RELATION_HINT: Record<RelationType, string> = {
  our_alliance: "Naš savez — ne napadamo.",
  deal: "Savez sa kojim imamo dogovor — ne napadamo.",
  protected: "Zaštićen savez — napad zabranjen.",
};

export function useAllianceRelations() {
  return useQuery({
    queryKey: ["alliance-relations"],
    queryFn: async (): Promise<AllianceRelation[]> => {
      const { data, error } = await supabase
        .from("alliance_relations")
        .select("id, alliance_tag, relation_type")
        .order("alliance_tag");
      if (error) throw error;
      return (data ?? []) as AllianceRelation[];
    },
  });
}

/** Map lowercased alliance tag -> relation type. */
export function useRelationMap() {
  const { data } = useAllianceRelations();
  return useMemo(() => {
    const m = new Map<string, RelationType>();
    for (const r of data ?? []) m.set(r.alliance_tag.trim().toLowerCase(), r.relation_type);
    return m;
  }, [data]);
}

export function relationOf(
  map: Map<string, RelationType>,
  tag: string | null | undefined,
): RelationType | null {
  if (!tag) return null;
  return map.get(tag.trim().toLowerCase()) ?? null;
}

export function AllianceBadge({
  tag,
  relation,
}: {
  tag: string | null | undefined;
  relation: RelationType | null;
}) {
  if (!tag) return <span className="text-muted-foreground">—</span>;
  if (!relation) return <span className="text-muted-foreground">{tag}</span>;

  const cls =
    relation === "our_alliance"
      ? "border-gold/50 text-gold bg-gold/10"
      : relation === "deal"
        ? "border-success/50 text-success bg-success/10"
        : "border-destructive/50 text-destructive bg-destructive/10";

  const Icon =
    relation === "our_alliance" ? ShieldCheck : relation === "deal" ? Handshake : Ban;

  return (
    <span
      title={RELATION_HINT[relation]}
      className={
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-widest " +
        cls
      }
    >
      <Icon className="size-3" />
      {tag} · {RELATION_LABEL[relation]}
    </span>
  );
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = status ?? "ready";
  if (s === "en_route")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-warning/50 text-warning bg-warning/10 text-[10px] uppercase tracking-widest">
        EN ROUTE
      </span>
    );
  if (s === "collected")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-muted-foreground/40 text-muted-foreground text-[10px] uppercase tracking-widest">
        POKUPLJENO
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-success/40 text-success bg-success/10 text-[10px] uppercase tracking-widest">
      READY
    </span>
  );
}

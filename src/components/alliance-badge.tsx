import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Handshake, Ban, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type RelationType = "our_alliance" | "deal" | "protected";

export interface AllianceRelation {
  id: string;
  alliance_tag: string;
  relation_type: RelationType;
}

export interface PlayerRelation {
  id: string;
  ikariam_username: string;
  username_key: string;
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

export function usePlayerRelations() {
  return useQuery({
    queryKey: ["player-relations"],
    queryFn: async (): Promise<PlayerRelation[]> => {
      const { data, error } = await supabase
        .from("player_relations")
        .select("id, ikariam_username, username_key, relation_type")
        .order("ikariam_username");
      if (error) throw error;
      return (data ?? []) as PlayerRelation[];
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

/** Map lowercased username -> relation type (player-level override). */
export function usePlayerRelationMap() {
  const { data } = usePlayerRelations();
  return useMemo(() => {
    const m = new Map<string, RelationType>();
    for (const r of data ?? [])
      m.set((r.username_key || r.ikariam_username).trim().toLowerCase(), r.relation_type);
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

export interface EffectiveRelation {
  relation: RelationType | null;
  /** true kada dolazi sa nivoa igrača (override nad savezom) */
  fromPlayer: boolean;
}

/** Prioritet: player relation → alliance relation → OTHER (null). */
export function effectiveRelation(
  allianceMap: Map<string, RelationType>,
  playerMap: Map<string, RelationType>,
  username: string | null | undefined,
  allianceTag: string | null | undefined,
): EffectiveRelation {
  const p = username ? playerMap.get(username.trim().toLowerCase()) : undefined;
  if (p) return { relation: p, fromPlayer: true };
  return { relation: relationOf(allianceMap, allianceTag), fromPlayer: false };
}

/** Kombinovani hook — vraća funkciju za efektivni odnos. */
export function useEffectiveRelation() {
  const alliance = useRelationMap();
  const player = usePlayerRelationMap();
  return useMemo(
    () =>
      (username: string | null | undefined, allianceTag: string | null | undefined) =>
        effectiveRelation(alliance, player, username, allianceTag),
    [alliance, player],
  );
}

function relClasses(relation: RelationType) {
  return relation === "our_alliance"
    ? "border-gold/50 text-gold bg-gold/10"
    : relation === "deal"
      ? "border-success/50 text-success bg-success/10"
      : "border-destructive/50 text-destructive bg-destructive/10";
}

export function AllianceBadge({
  tag,
  relation,
  fromPlayer,
}: {
  tag: string | null | undefined;
  relation: RelationType | null;
  /** Odnos dolazi sa nivoa igrača, ne saveza. */
  fromPlayer?: boolean;
}) {
  if (!relation) {
    if (!tag) return <span className="text-muted-foreground">—</span>;
    return <span className="text-muted-foreground">{tag}</span>;
  }

  const Icon = fromPlayer
    ? User
    : relation === "our_alliance"
      ? ShieldCheck
      : relation === "deal"
        ? Handshake
        : Ban;

  return (
    <span
      title={
        fromPlayer
          ? `Odnos definisan na nivou igrača: ${RELATION_LABEL[relation]}`
          : RELATION_HINT[relation]
      }
      className={
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-widest " +
        relClasses(relation)
      }
    >
      <Icon className="size-3" />
      {tag ? `${tag} · ` : ""}
      {RELATION_LABEL[relation]}
      {fromPlayer ? " (igrač)" : ""}
    </span>
  );
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = status ?? "ready";
  if (s === "en_route")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-gold/60 text-gold bg-gold/10 text-[10px] uppercase tracking-widest">
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

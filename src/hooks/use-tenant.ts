import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSupabaseSession } from "@/hooks/use-current-user";

export interface TenantAlliance {
  id: string;
  world_id: string;
  name: string;
  tag: string;
  is_active: boolean;
}
export interface TenantWorld {
  id: string;
  name: string;
  country_code: string | null;
  country_name: string | null;
  flag_emoji: string | null;
}

/** Aktivni world/alliance kontekst + dostupni konteksti za korisnika. */
export function useTenant() {
  const { session } = useSupabaseSession();
  const uid = session?.user.id;
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["tenant-context", uid],
    enabled: !!uid,
    staleTime: 60_000,
    queryFn: async () => {
      const [cur, sa, mem, al, w] = await Promise.all([
        supabase.rpc("current_alliance_id"),
        supabase.rpc("is_system_admin", { _user_id: uid! }),
        supabase
          .from("user_memberships")
          .select("alliance_id, world_id, is_active")
          .eq("user_id", uid!)
          .eq("is_active", true),
        supabase.from("alliances").select("id, world_id, name, tag, is_active"),
        supabase.from("worlds").select("id, name, country_code, country_name, flag_emoji"),
      ]);
      const alliances = (al.data ?? []) as TenantAlliance[];
      const worlds = (w.data ?? []) as TenantWorld[];
      const memberIds = new Set((mem.data ?? []).map((m) => m.alliance_id));
      const activeId = (cur.data as string | null) ?? null;
      const active = alliances.find((a) => a.id === activeId) ?? null;
      const activeWorld = worlds.find((x) => x.id === active?.world_id) ?? null;
      const isSystemAdmin = !!sa.data;
      return {
        activeAllianceId: activeId,
        activeAlliance: active,
        activeWorld,
        isSystemAdmin,
        isViewAs: isSystemAdmin && !!activeId && !memberIds.has(activeId),
        memberAlliances: alliances.filter((a) => memberIds.has(a.id) && a.is_active),
        allAlliances: alliances,
        worlds,
      };
    },
  });

  const switchTo = async (allianceId: string) => {
    if (!uid) return;
    const target = q.data?.allAlliances.find((a) => a.id === allianceId);
    const { error } = await supabase.from("user_active_context").upsert({
      user_id: uid,
      alliance_id: allianceId,
      world_id: target?.world_id ?? null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    await qc.resetQueries();
  };

  const exitViewAs = async () => {
    const first = q.data?.memberAlliances[0];
    if (first) await switchTo(first.id);
    else if (uid) {
      await supabase.from("user_active_context").delete().eq("user_id", uid);
      await qc.resetQueries();
    }
  };

  return { ...q, tenant: q.data ?? null, switchTo, exitViewAs };
}

/** Tag aktivnog saveza (fallback "BAUN" dok se kontekst učitava). */
export function useOwnTag(): string {
  const { tenant } = useTenant();
  return tenant?.activeAlliance?.tag ?? "BAUN";
}

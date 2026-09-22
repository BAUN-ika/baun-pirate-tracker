import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PlayerAssignment {
  id: string;
  pirate_user_id: string;
  pirate_username: string;
  ikariam_username: string;
  coordinates: string | null;
  created_at: string;
}

export function usePlayerAssignments() {
  return useQuery({
    queryKey: ["player-assignments"],
    queryFn: async (): Promise<PlayerAssignment[]> => {
      const [{ data, error }, { data: profiles }] = await Promise.all([
        supabase
          .from("pirate_player_assignments")
          .select("id, pirate_user_id, ikariam_username, coordinates, created_at")
          .order("created_at", { ascending: true }),
        supabase.from("profiles").select("id, username"),
      ]);
      if (error) throw new Error(error.message);
      const nameById = new Map((profiles ?? []).map((p: any) => [p.id, p.username as string]));
      return ((data ?? []) as any[]).map((a) => ({
        id: a.id,
        pirate_user_id: a.pirate_user_id,
        pirate_username: nameById.get(a.pirate_user_id) ?? "Nepoznat",
        ikariam_username: a.ikariam_username,
        coordinates: a.coordinates,
        created_at: a.created_at,
      }));
    },
  });
}

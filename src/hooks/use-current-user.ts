import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "glavni_pirat" | "korisnik";

export interface CurrentUserData {
  user: User;
  profile: {
    id: string;
    username: string;
    email: string;
    is_active: boolean;
  } | null;
  roles: AppRole[];
}

export function useSupabaseSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading };
}

export function useCurrentUser() {
  const { session, loading } = useSupabaseSession();
  const userId = session?.user.id;

  const query = useQuery({
    queryKey: ["current-user", userId],
    enabled: !!userId,
    queryFn: async (): Promise<CurrentUserData | null> => {
      if (!session) return null;
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", session.user.id),
      ]);
      return {
        user: session.user,
        profile: profile ?? null,
        roles: ((roles ?? []) as { role: AppRole }[]).map((r) => r.role),
      };
    },
  });

  return {
    session,
    loading: loading || query.isLoading,
    data: query.data ?? null,
    isAdmin: !!query.data?.roles.includes("admin"),
    isPirate:
      !!query.data?.roles.includes("admin") ||
      !!query.data?.roles.includes("glavni_pirat"),
  };
}

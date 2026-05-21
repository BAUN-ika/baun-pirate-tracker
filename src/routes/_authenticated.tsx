import { useEffect, useState } from "react";
import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-current-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: AuthLayout,
});

function AuthLayout() {
  const [open, setOpen] = useState(false);
  const { data, loading } = useCurrentUser();
  const nav = useNavigate();

  useEffect(() => {
    if (!loading && data && data.profile && !data.profile.is_active) {
      toast.error("Tvoj nalog je deaktiviran.");
      supabase.auth.signOut().then(() => nav({ to: "/login" }));
    }
  }, [loading, data, nav]);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Mobile top bar */}
      <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-sidebar">
        <div className="font-display text-gold">BAUN Pirate Tracker</div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen((v) => !v)}
          aria-label="Meni"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </Button>
      </div>

      {/* Sidebar */}
      <div
        className={
          "lg:block " + (open ? "block" : "hidden")
        }
      >
        <AppSidebar onNavigate={() => setOpen(false)} />
      </div>

      <main className="flex-1 min-w-0">
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

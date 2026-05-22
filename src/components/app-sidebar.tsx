import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  Anchor,
  Coins,
  FileClock,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Settings,
  Ship,
  Skull,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useCurrentUser, type AppRole } from "@/hooks/use-current-user";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: AppRole[]; // if set, only these roles see it
}

const NAV: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Moji nalozi", to: "/accounts", icon: Anchor },
  { label: "Piratski poeni saveza", to: "/points", icon: Coins },
  { label: "Highscore unos", to: "/highscore/submit", icon: Upload },
  { label: "Highscore lista", to: "/highscore", icon: ListOrdered },
  { label: "Audit log", to: "/audit", icon: FileClock },
  { label: "Admin panel", to: "/admin", icon: Settings, roles: ["admin"] },
];

// Rute koje koriste samo tačno poređenje (sprječava da "/highscore/submit"
// označi i "/highscore"). Ostale rute koriste prefix-match.
const EXACT_ROUTES = new Set(["/highscore", "/highscore/submit"]);


export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const { data, isAdmin } = useCurrentUser();
  const nav = useNavigate();

  const visible = NAV.filter((n) => {
    if (!n.roles) return true;
    if (n.roles.includes("admin") && isAdmin) return true;
    return n.roles.some((r) => data?.roles.includes(r));
  });

  const logout = async () => {
    await supabase.auth.signOut();
    toast.success("Odjavljen.");
    nav({ to: "/login" });
  };

  const highestRole: AppRole | undefined = data?.roles.includes("admin")
    ? "admin"
    : data?.roles.includes("glavni_pirat")
      ? "glavni_pirat"
      : data?.roles.includes("korisnik")
        ? "korisnik"
        : undefined;

  return (
    <aside className="w-full lg:w-64 lg:min-h-screen bg-sidebar border-r border-sidebar-border flex flex-col">
      <div className="px-5 py-6 flex items-center gap-3 border-b border-sidebar-border">
        <div className="size-10 rounded-full bg-gold/15 border border-gold/40 flex items-center justify-center">
          <Ship className="size-5 text-gold" />
        </div>
        <div>
          <div className="font-display text-lg text-gold leading-none">BAUN</div>
          <div className="text-[10px] text-muted-foreground tracking-widest uppercase">
            Pirate Tracker
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visible.map((item) => {
          const active = EXACT_ROUTES.has(item.to)
            ? pathname === item.to
            : pathname === item.to || pathname.startsWith(item.to + "/");

          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition",
                active
                  ? "bg-sidebar-accent text-gold border border-gold/30"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60",
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="size-9 rounded-full bg-accent flex items-center justify-center">
            <Skull className="size-4 text-gold" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">
              {data?.profile?.username ?? "—"}
            </div>
            {highestRole && (
              <div className="text-[10px] uppercase tracking-wider text-gold/80">
                {highestRole.replace("_", " ")}
              </div>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" className="w-full" onClick={logout}>
          <LogOut className="size-4 mr-2" />
          Odjava
        </Button>
      </div>
    </aside>
  );
}

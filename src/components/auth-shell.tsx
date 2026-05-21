import { Link } from "@tanstack/react-router";
import { Ship } from "lucide-react";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-3 mb-8">
          <div className="size-12 rounded-full bg-gold/15 border border-gold/40 flex items-center justify-center">
            <Ship className="size-6 text-gold" />
          </div>
          <div>
            <div className="font-display text-2xl text-gold leading-none">BAUN</div>
            <div className="text-xs text-muted-foreground tracking-widest uppercase">
              Pirate Tracker
            </div>
          </div>
        </Link>

        <div className="pirate-card pirate-card-glow rounded-2xl p-8">
          <h1 className="font-display text-2xl text-foreground">{title}</h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
          <div className="gold-divider my-6" />
          {children}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Privatna platforma za Balkan Union savez
        </p>
        {footer && <div className="mt-4 text-center text-sm">{footer}</div>}
      </div>
    </div>
  );
}

import { useState } from "react";
import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth-shell";
import { registerWithPasscode } from "@/lib/auth.functions";

export const Route = createFileRoute("/register")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: RegisterPage,
});

function RegisterPage() {
  const nav = useNavigate();
  const register = useServerFn(registerWithPasscode);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passcode, setPasscode] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await register({
        data: { email, username, password, passcode },
      });
      if (!res.ok) {
        toast.error("Registracija nije uspjela", { description: res.error });
        setLoading(false);
        return;
      }
      const { error: sErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (sErr) {
        toast.error("Prijava nakon registracije nije uspjela", {
          description: sErr.message,
        });
        setLoading(false);
        return;
      }
      toast.success("Dobrodošao u BAUN savez!");
      nav({ to: "/dashboard" });
    } catch (err: any) {
      toast.error("Greška", { description: err?.message ?? "Pokušaj ponovo." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Registracija"
      subtitle="Potreban je važeći BAUN passcode dobijen od admina."
      footer={
        <span className="text-muted-foreground">
          Već imaš nalog?{" "}
          <Link to="/login" className="text-gold hover:underline">
            Prijavi se
          </Link>
        </span>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="username">Korisničko ime</Label>
          <Input
            id="username"
            required
            minLength={2}
            maxLength={40}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Lozinka</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="passcode" className="text-gold">
            BAUN passcode
          </Label>
          <Input
            id="passcode"
            required
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Tajni passcode saveza"
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Registrujem..." : "Pridruži se savezu"}
        </Button>
      </form>
    </AuthShell>
  );
}

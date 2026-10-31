import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ikariamServer } from "@/lib/scanner-protocol";

export const Route = createFileRoute("/scanner-connect")({
  component: ScannerConnect,
  head: () => ({ meta: [
    { title: "Poveži Pirate Scanner | Pirate Tracker" },
    { name: "description", content: "Sigurno povezivanje Ikariam skenera sa tvojim savezom." },
    { property: "og:title", content: "Poveži Pirate Scanner | Pirate Tracker" },
    { property: "og:description", content: "Automatski uvoz piratske liste u odgovarajući svijet i savez." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
});

type Alliance = { id: string; tag: string; name: string };
function ScannerConnect() {
  const [status, setStatus] = useState("Povezujem skener...");
  const [login, setLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const [working, setWorking] = useState(false);
  const restart = useRef<(() => Promise<void>) | undefined>(undefined);
  const choose = useRef<((id: string) => void) | undefined>(undefined);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const origin = params.get("origin") ?? "";
    const nonce = params.get("nonce") ?? "";
    let gameUrl: URL;
    try { gameUrl = new URL(origin); } catch { setStatus("Nevažeći Ikariam izvor."); return; }
    const mapping = ikariamServer(gameUrl.hostname);
    if (!mapping || gameUrl.protocol !== "https:" || gameUrl.origin !== origin || !/^[a-f0-9-]{36}$/i.test(nonce) || !window.opener) {
      setStatus("Otvori ovaj prozor preko Pirate Scanner bookmarkleta u Ikariamu."); return;
    }
    const opener: Window = window.opener;
    let disposed = false;
    let selected = "";
    let importing = false;
    let readyMessage: Record<string, unknown> | undefined;
    let userId = "";
    let worldId = "";
    let idleTimer: ReturnType<typeof setTimeout>;
    const send = (type: string, payload: Record<string, unknown> = {}) => {
      if (!disposed) opener.postMessage({ channel: "pirate-scanner", nonce, type, ...payload }, origin);
    };
    const api = async (body: Record<string, unknown>) => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Prijava je istekla. Pokreni skener ponovo i prijavi se.");
      const response = await fetch("/api/public/scanner", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ ...mapping, ...body }),
      });
      const result = await response.json();
      if (!response.ok || result.ok === false) throw new Error(result.error ?? "Uvoz nije uspio.");
      return result;
    };
    choose.current = id => {
      selected = id;
      localStorage.setItem(`scanner-alliance:${userId}:${worldId}`, id);
      setAlliances([]); setStatus("Skener je povezan. Skeniranje je u toku...");
      readyMessage = { alliance_id: id };
      send("ready", readyMessage);
    };
    const start = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) { setLogin(true); setStatus("Prijavi se za povezivanje skenera."); return; }
        userId = data.session.user.id;
        const resolved = await api({ action: "resolve" });
        if (disposed) return;
        worldId = resolved.world.id;
        const choices: Alliance[] = resolved.alliances;
        const saved = localStorage.getItem(`scanner-alliance:${userId}:${worldId}`);
        const match = choices.find(a => a.id === saved);
        if (choices.length === 1) choose.current?.(choices[0].id);
        else if (match) choose.current?.(match.id);
        else { setAlliances(choices); setStatus(`Odaberi savez: ${resolved.world.name}`); }
      } catch (e) { const message = e instanceof Error ? e.message : "Povezivanje nije uspjelo."; setStatus(message); send("error", { error: message }); }
    };
    restart.current = start;
    const receive = async (event: MessageEvent) => {
      if (event.source !== opener || event.origin !== origin || event.data?.channel !== "pirate-scanner" || event.data?.nonce !== nonce) return;
      if (event.data.type === "heartbeat") {
        if (readyMessage && !importing) send("ready", readyMessage);
        clearTimeout(idleTimer); idleTimer = setTimeout(() => { setStatus("Veza sa skenerom je prekinuta."); window.close(); }, 120_000); return;
      }
      if (event.data.type !== "import" || importing || !selected) return;
      if (event.data.request_id !== nonce || typeof event.data.raw_text !== "string" || event.data.raw_text.length > 50_000) {
        send("error", { error: "Nevažeći podaci skeniranja." }); return;
      }
      importing = true; setWorking(true); setStatus("Podaci prikupljeni. Uvoz u toku...");
      try {
        const result = await api({ action: "import", alliance_id: selected, request_id: nonce, raw_text: event.data.raw_text });
        setStatus(`Uvoz završen: ${result.entries_count ?? 0} igrača.`);
        send("success", { entries_count: result.entries_count, invalid_count: result.invalid_count });
        setTimeout(() => window.close(), 1500);
      } catch (e) { const message = e instanceof Error ? e.message : "Uvoz nije uspio."; setStatus(message); send("error", { error: message }); }
      finally { setWorking(false); }
    };
    window.addEventListener("message", receive);
    void start();
    return () => { disposed = true; clearTimeout(idleTimer); window.removeEventListener("message", receive); };
  }, []);

  return <main className="min-h-screen bg-background text-foreground p-6">
    <div className="max-w-md mx-auto space-y-5">
      <h1 className="font-display text-2xl text-gold">Pirate Scanner</h1>
      <p role="status" className="text-sm">{status}</p>
      {login && <form className="space-y-3" onSubmit={async e => {
        e.preventDefault(); setWorking(true);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        setPassword(""); setWorking(false);
        if (error) { setStatus("Prijava nije uspjela."); return; }
        setLogin(false); await restart.current?.();
      }}>
        <div className="space-y-1"><Label htmlFor="scanner-email">Email</Label><Input id="scanner-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="scanner-password">Lozinka</Label><Input id="scanner-password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></div>
        <Button type="submit" disabled={working}>Prijavi se</Button>
      </form>}
      <div className="space-y-2">{alliances.map(a => <Button key={a.id} variant="outline" className="w-full justify-start" onClick={() => choose.current?.(a.id)}><span data-no-i18n>{a.tag} · {a.name}</span></Button>)}</div>
    </div>
  </main>;
}
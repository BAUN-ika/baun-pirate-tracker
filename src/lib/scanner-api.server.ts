import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { eligibleScannerAlliances, ScannerRequestSchema } from "@/lib/scanner-protocol";

export async function scannerRequest(request: Request): Promise<Response> {
  // Only the app-owned bridge calls this API; Ikariam never receives a bearer.
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "Nedozvoljen izvor zahtjeva." }, { status: 403 });
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return Response.json({ error: "Prijavi se u Pirate Tracker." }, { status: 401 });
  try {
    if (Number(request.headers.get("content-length") || 0) > 250_000)
      return Response.json({ error: "Lista je prevelika." }, { status: 413 });
    const input = ScannerRequestSchema.parse(await request.json());
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) throw new Error("Veza sa aplikacijom nije dostupna.");
    const supabase = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: auth, error: authError } = await supabase.auth.getUser(token);
    if (authError || !auth.user) return Response.json({ error: "Prijava je istekla." }, { status: 401 });
    const userId = auth.user.id;
    const { data: profile, error: profileError } = await supabase.from("profiles").select("is_active").eq("id", userId).single();
    if (profileError || !profile?.is_active) return Response.json({ error: "Nalog nije aktivan." }, { status: 403 });
    // Privileged lookup only after authentication; membership is mandatory even for view-as admins.
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: world, error: worldError } = await db.from("worlds")
      .select("id, name").eq("server_number", input.server_number).eq("server_region", input.server_region).maybeSingle();
    if (worldError) throw new Error(worldError.message);
    if (!world) return Response.json({ error: "Ikariam server nije povezan sa svijetom. System Admin treba podesiti broj servera i region." }, { status: 404 });
    const [members, alliances] = await Promise.all([
      db.from("user_memberships").select("alliance_id, world_id, is_active").eq("user_id", userId).eq("world_id", world.id).eq("is_active", true),
      db.from("alliances").select("id, world_id, tag, name, is_active").eq("world_id", world.id).eq("is_active", true),
    ]);
    if (members.error || alliances.error) throw new Error("Provjera članstva nije uspjela.");
    const eligible = eligibleScannerAlliances(world.id, alliances.data ?? [], members.data ?? []);
    if (!eligible.length) return Response.json({ error: "Nemaš aktivno članstvo u ovom Ikariam svijetu." }, { status: 403 });
    if (input.action === "resolve") return Response.json({ world, alliances: eligible.map(a => ({ id: a.id, tag: a.tag, name: a.name })) });
    const alliance = eligible.find(a => a.id === input.alliance_id);
    if (!alliance) return Response.json({ error: "Odaberi svoj savez u ovom svijetu." }, { status: 403 });
    if (!input.raw_text || !input.request_id) return Response.json({ error: "Nedostaju podaci skeniranja." }, { status: 400 });
    const [{ data: role }, { data: systemAdmin }] = await Promise.all([
      supabase.rpc("has_alliance_role", { _user_id: userId, _alliance_id: alliance.id, _role: "admin" }),
      supabase.rpc("is_system_admin", { _user_id: userId }),
    ]);
    const { importHighscore } = await import("@/lib/highscore-import.server");
    const result = await importHighscore({ raw_text: input.raw_text, scanner_request_id: input.request_id }, {
      supabase, userId, allianceId: alliance.id, worldId: world.id, isAdmin: !!role || !!systemAdmin,
    });
    return Response.json(result, { status: result.ok ? 200 : 422 });
  } catch (error) {
    // Never echo submitted text or credentials.
    const message = error instanceof Error ? error.message : "Uvoz nije uspio.";
    return Response.json({ error: message }, { status: 400 });
  }
}
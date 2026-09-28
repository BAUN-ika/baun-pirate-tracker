import { createServerFn } from "@tanstack/react-start";
import { createHash } from "node:crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const RegisterSchema = z.object({
  email: z.string().email().max(255),
  username: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9_\- ]+$/, "Dozvoljena su slova, brojevi, razmak, _ i -"),
  password: z.string().min(8).max(128),
  passcode: z.string().min(1).max(128),
});

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export const registerWithPasscode = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RegisterSchema.parse(input))
  .handler(async ({ data }) => {
    // 1) verify BAUN passcode
    const { data: alliance, error: sErr } = await supabaseAdmin
      .from("alliances")
      .select("id, is_active")
      .eq("passcode_hash", sha256Hex(data.passcode))
      .maybeSingle();
    if (sErr) {
      return { ok: false as const, error: "Sistemski problem. Pokušaj ponovo." };
    }
    if (!alliance || !alliance.is_active) {
      return { ok: false as const, error: "Pogrešan passcode saveza." };
    }

    // 2) ensure username uniqueness
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("username", data.username)
      .maybeSingle();
    if (existing) {
      return { ok: false as const, error: "Korisničko ime je već zauzeto." };
    }

    // 3) create user (trigger creates profile + role)
    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { username: data.username, alliance_id: alliance.id },
    });
    if (cErr || !created.user) {
      const msg = cErr?.message ?? "Registracija nije uspjela.";
      return { ok: false as const, error: msg };
    }

    return { ok: true as const, userId: created.user.id };
  });

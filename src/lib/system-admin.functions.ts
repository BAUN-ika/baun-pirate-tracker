import { createServerFn } from "@tanstack/react-start";
import { createHash } from "node:crypto";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isSystemAdmin } from "@/lib/tenant";
import { safeAuditLog } from "@/lib/audit";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

async function admin(ctx: { supabase: any; userId: string }) {
  if (!(await isSystemAdmin(ctx.supabase, ctx.userId)))
    throw new Error("Samo system admin ima pristup.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const ROLES = ["admin", "glavni_pirat", "pirat", "ide_na_plasman", "korisnik"] as const;

export const sysOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin(context);
    const [w, a, m, r, p, av, uv] = await Promise.all([
      db.from("worlds").select("*").order("created_at"),
      db.from("alliances").select("id, world_id, name, tag, is_active, created_at").order("created_at"),
      db.from("user_memberships").select("*").order("created_at"),
      db.from("user_roles").select("user_id, alliance_id, role"),
      db.from("profiles").select("id, username, email, is_active").order("username"),
      db.from("alliance_visibility_permissions").select("*"),
      db.from("user_visibility_permissions").select("*"),
    ]);
    for (const x of [w, a, m, r, p, av, uv]) if (x.error) throw new Error(x.error.message);
    return {
      worlds: w.data ?? [],
      alliances: a.data ?? [],
      memberships: m.data ?? [],
      roles: r.data ?? [],
      profiles: p.data ?? [],
      allianceVisibility: av.data ?? [],
      userVisibility: uv.data ?? [],
    };
  });

const WorldSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(60),
  country_code: z.string().trim().max(4).optional().nullable(),
  country_name: z.string().trim().max(60).optional().nullable(),
  flag_emoji: z.string().trim().max(16).optional().nullable(),
});

export const sysSaveWorld = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => WorldSchema.parse(i))
  .handler(async ({ data, context }) => {
    const db = await admin(context);
    const row = {
      name: data.name,
      country_code: data.country_code || null,
      country_name: data.country_name || null,
      flag_emoji: data.flag_emoji || null,
    };
    const res = data.id
      ? await db.from("worlds").update(row).eq("id", data.id)
      : await db.from("worlds").insert({ ...row, created_by: context.userId });
    if (res.error) throw new Error(res.error.message);
    await safeAuditLog(context.supabase, {
      user_id: context.userId,
      action: data.id ? "sys_world_updated" : "sys_world_created",
      entity_type: "world",
      metadata: row,
    });
    return { ok: true };
  });

const AllianceSchema = z.object({
  id: z.string().uuid().optional(),
  world_id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  tag: z.string().trim().min(1).max(12),
  passcode: z.string().min(4).max(128).optional().nullable(),
  is_active: z.boolean().default(true),
});

export const sysSaveAlliance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => AllianceSchema.parse(i))
  .handler(async ({ data, context }) => {
    const db = await admin(context);
    const row: { world_id: string; name: string; tag: string; is_active: boolean; passcode_hash?: string } = {
      world_id: data.world_id,
      name: data.name,
      tag: data.tag,
      is_active: data.is_active,
    };
    if (data.passcode) row.passcode_hash = sha(data.passcode);
    let res;
    if (data.id) {
      res = await db.from("alliances").update(row).eq("id", data.id);
    } else {
      if (!data.passcode) throw new Error("Novi savez mora imati passcode.");
      res = await db
        .from("alliances")
        .insert({ ...row, created_by: context.userId } as never)
        .select("id")
        .single();
      if (!res.error && res.data) {
        await db
          .from("alliance_visibility_permissions")
          .insert({ world_id: data.world_id, alliance_id: (res.data as { id: string }).id });
      }
    }
    if (res.error) {
      if (/passcode_hash/.test(res.error.message))
        throw new Error("Ovaj passcode već koristi drugi savez.");
      if (/duplicate key/.test(res.error.message))
        throw new Error("Savez sa tim tagom već postoji u ovom svijetu.");
      throw new Error(res.error.message);
    }
    await safeAuditLog(context.supabase, {
      user_id: context.userId,
      action: data.id ? "sys_alliance_updated" : "sys_alliance_created",
      entity_type: "alliance",
      entity_id: data.id ?? null,
      metadata: { name: data.name, tag: data.tag, passcode_changed: !!data.passcode },
    });
    return { ok: true };
  });

const MembershipSchema = z.object({
  user_id: z.string().uuid(),
  alliance_id: z.string().uuid(),
  role: z.enum(ROLES),
});

export const sysAddMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => MembershipSchema.parse(i))
  .handler(async ({ data, context }) => {
    const db = await admin(context);
    const { data: al } = await db
      .from("alliances")
      .select("world_id")
      .eq("id", data.alliance_id)
      .single();
    if (!al) throw new Error("Savez ne postoji.");
    const m = await db.from("user_memberships").upsert(
      {
        user_id: data.user_id,
        alliance_id: data.alliance_id,
        world_id: al.world_id,
        is_active: true,
        created_by: context.userId,
      },
      { onConflict: "user_id,alliance_id" },
    );
    if (m.error) throw new Error(m.error.message);
    const r = await db
      .from("user_roles")
      .insert({ user_id: data.user_id, role: data.role, alliance_id: data.alliance_id });
    if (r.error && !/duplicate key/i.test(r.error.message)) throw new Error(r.error.message);
    return { ok: true };
  });

export const sysSetMembershipRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        alliance_id: z.string().uuid(),
        roles: z.array(z.enum(ROLES)),
        is_active: z.boolean(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const db = await admin(context);
    const u = await db
      .from("user_memberships")
      .update({ is_active: data.is_active })
      .eq("user_id", data.user_id)
      .eq("alliance_id", data.alliance_id);
    if (u.error) throw new Error(u.error.message);
    await db
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .eq("alliance_id", data.alliance_id);
    if (data.roles.length) {
      const ins = await db.from("user_roles").insert(
        data.roles.map((role) => ({
          user_id: data.user_id,
          role,
          alliance_id: data.alliance_id,
        })),
      );
      if (ins.error) throw new Error(ins.error.message);
    }
    return { ok: true };
  });

const Perm = z.object({
  can_view_global_highscore: z.boolean().nullable(),
  can_view_global_clusters: z.boolean().nullable(),
  can_view_global_nearest_points: z.boolean().nullable(),
  can_view_global_map: z.boolean().nullable(),
});

export const sysSetAllianceVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    Perm.extend({ alliance_id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const db = await admin(context);
    const { data: al } = await db
      .from("alliances")
      .select("world_id")
      .eq("id", data.alliance_id)
      .single();
    if (!al) throw new Error("Savez ne postoji.");
    const { alliance_id, ...p } = data;
    const res = await db.from("alliance_visibility_permissions").upsert(
      {
        alliance_id,
        world_id: al.world_id,
        can_view_global_highscore: !!p.can_view_global_highscore,
        can_view_global_clusters: !!p.can_view_global_clusters,
        can_view_global_nearest_points: !!p.can_view_global_nearest_points,
        can_view_global_map: !!p.can_view_global_map,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "alliance_id" },
    );
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  });

export const sysSetUserVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    Perm.extend({ user_id: z.string().uuid(), world_id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const db = await admin(context);
    const res = await db
      .from("user_visibility_permissions")
      .upsert({ ...data, updated_at: new Date().toISOString() }, { onConflict: "world_id,user_id" });
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  });

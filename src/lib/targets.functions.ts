import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { safeAuditLog } from "@/lib/audit";

async function getRoles(supabase: any, userId: string): Promise<string[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return ((data ?? []) as { role: string }[]).map((r) => r.role);
}

async function isPirate(supabase: any, userId: string) {
  const roles = await getRoles(supabase, userId);
  return roles.includes("admin") || roles.includes("glavni_pirat");
}

async function requirePirate(supabase: any, userId: string) {
  if (!(await isPirate(supabase, userId)))
    throw new Error("Samo glavni pirat ili admin može izvršiti ovu akciju.");
}

async function displayName(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("username, email")
    .eq("id", userId)
    .maybeSingle();
  return data?.username || data?.email || "Nepoznat";
}

/* ------------------------------ Alliance relations ------------------------------ */

const RelationSchema = z.object({
  alliance_tag: z.string().trim().min(1).max(40),
  relation_type: z.enum(["our_alliance", "deal", "protected"]),
});

export const upsertAllianceRelation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => RelationSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePirate(supabase, userId);
    const tag = data.alliance_tag.trim();

    if (data.relation_type === "our_alliance") {
      // Only one our_alliance allowed — demote any existing one.
      const { data: existing } = await supabase
        .from("alliance_relations")
        .select("id, alliance_tag")
        .eq("relation_type", "our_alliance");
      for (const e of existing ?? []) {
        if (e.alliance_tag.trim().toLowerCase() !== tag.toLowerCase()) {
          await supabase
            .from("alliance_relations")
            .update({ relation_type: "deal", updated_at: new Date().toISOString() })
            .eq("id", e.id);
        }
      }
    }

    const { data: found } = await supabase
      .from("alliance_relations")
      .select("id")
      .ilike("alliance_tag", tag)
      .maybeSingle();

    let action = "alliance_relation_created";
    let row: any;
    if (found) {
      action = "alliance_relation_updated";
      const { data: upd, error } = await supabase
        .from("alliance_relations")
        .update({
          alliance_tag: tag,
          relation_type: data.relation_type,
          updated_at: new Date().toISOString(),
        })
        .eq("id", found.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      row = upd;
    } else {
      const { data: ins, error } = await supabase
        .from("alliance_relations")
        .insert({
          alliance_tag: tag,
          relation_type: data.relation_type,
          created_by: userId,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      row = ins;
    }

    await safeAuditLog(supabase, {
      user_id: userId,
      action,
      entity_type: "alliance_relation",
      entity_id: row.id,
      metadata: { alliance_tag: tag, relation_type: data.relation_type },
    });
    return row;
  });

export const deleteAllianceRelation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePirate(supabase, userId);
    const { data: prev } = await supabase
      .from("alliance_relations")
      .select("alliance_tag, relation_type")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await supabase.from("alliance_relations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await safeAuditLog(supabase, {
      user_id: userId,
      action: "alliance_relation_deleted",
      entity_type: "alliance_relation",
      entity_id: data.id,
      metadata: prev ?? null,
    });
    return { ok: true };
  });

/* ------------------------------ Assignment helpers ------------------------------ */

const AssignInput = z.object({
  pirate_name: z.string().trim().max(60).optional(),
});

/* ------------------------------ Account targets ------------------------------ */

export const accountSetEnRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    AssignInput.extend({ account_id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: acc } = await supabase
      .from("ikariam_accounts")
      .select("id, ikariam_username, fortress_coordinates, assignment_status, assigned_pirate_name")
      .eq("id", data.account_id)
      .maybeSingle();
    if (!acc) throw new Error("Nalog nije pronađen.");
    if (acc.assignment_status === "en_route")
      throw new Error(`Već je krenuo: ${acc.assigned_pirate_name ?? "nepoznato"}.`);

    const name = data.pirate_name?.trim() || (await displayName(supabase, userId));
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("ikariam_accounts")
      .update({
        assignment_status: "en_route",
        assigned_pirate_name: name,
        assigned_by_user_id: userId,
        assignment_started_at: now,
      })
      .eq("id", data.account_id);
    if (error) throw new Error(error.message);
    await safeAuditLog(supabase, {
      user_id: userId,
      action: "pirate_target_en_route",
      entity_type: "ikariam_account",
      entity_id: data.account_id,
      metadata: {
        ikariam_username: acc.ikariam_username,
        coordinates: acc.fortress_coordinates,
        assigned_pirate_name: name,
        assigned_by_user_id: userId,
      },
    });
    return { ok: true, assigned_pirate_name: name };
  });

export const accountCancelEnRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ account_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: acc } = await supabase
      .from("ikariam_accounts")
      .select("assigned_by_user_id, assigned_pirate_name, ikariam_username")
      .eq("id", data.account_id)
      .maybeSingle();
    if (!acc) throw new Error("Nalog nije pronađen.");
    if (acc.assigned_by_user_id !== userId && !(await isPirate(supabase, userId)))
      throw new Error("Samo onaj ko je krenuo, glavni pirat ili admin može otkazati.");
    const { error } = await supabase
      .from("ikariam_accounts")
      .update({
        assignment_status: "ready",
        assigned_pirate_name: null,
        assigned_by_user_id: null,
        assignment_started_at: null,
      })
      .eq("id", data.account_id);
    if (error) throw new Error(error.message);
    await safeAuditLog(supabase, {
      user_id: userId,
      action: "pirate_target_en_route_cancelled",
      entity_type: "ikariam_account",
      entity_id: data.account_id,
      metadata: {
        ikariam_username: acc.ikariam_username,
        assigned_pirate_name: acc.assigned_pirate_name,
      },
    });
    return { ok: true };
  });

/* ------------------------------ Highscore targets ------------------------------ */

const HsTarget = z.object({
  period_start: z.string(),
  ikariam_username: z.string().trim().min(1).max(80),
  rank: z.number().int().optional(),
  coordinates: z.string().trim().max(20).optional(),
  alliance_tag: z.string().trim().max(40).optional(),
});

async function findHsStatus(supabase: any, period_start: string, username: string) {
  const { data } = await supabase
    .from("highscore_target_status")
    .select("*")
    .eq("period_start", period_start)
    .ilike("ikariam_username", username.trim())
    .maybeSingle();
  return data;
}

export const highscoreSetEnRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => HsTarget.merge(AssignInput).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const existing = await findHsStatus(supabase, data.period_start, data.ikariam_username);
    if (existing?.status === "en_route")
      throw new Error(`Već je krenuo: ${existing.assigned_pirate_name ?? "nepoznato"}.`);

    const name = data.pirate_name?.trim() || (await displayName(supabase, userId));
    const now = new Date().toISOString();
    const patch = {
      status: "en_route",
      assigned_pirate_name: name,
      assigned_by_user_id: userId,
      started_at: now,
      collected_at: null,
      collected_by_user_id: null,
      updated_at: now,
      rank: data.rank ?? null,
    };
    if (existing) {
      const { error } = await supabase
        .from("highscore_target_status")
        .update(patch)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("highscore_target_status").insert({
        period_start: data.period_start,
        ikariam_username: data.ikariam_username.trim(),
        ...patch,
      });
      if (error) throw new Error(error.message);
    }
    await safeAuditLog(supabase, {
      user_id: userId,
      action: "pirate_target_en_route",
      entity_type: "highscore_target",
      entity_id: data.ikariam_username.trim(),
      metadata: {
        period_start: data.period_start,
        rank: data.rank ?? null,
        coordinates: data.coordinates ?? null,
        alliance_tag: data.alliance_tag ?? null,
        assigned_pirate_name: name,
        assigned_by_user_id: userId,
      },
    });
    return { ok: true, assigned_pirate_name: name };
  });

export const highscoreCancelEnRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ period_start: z.string(), ikariam_username: z.string().trim().min(1) })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const existing = await findHsStatus(supabase, data.period_start, data.ikariam_username);
    if (!existing) return { ok: true };
    if (existing.assigned_by_user_id !== userId && !(await isPirate(supabase, userId)))
      throw new Error("Samo onaj ko je krenuo, glavni pirat ili admin može otkazati.");
    const { error } = await supabase
      .from("highscore_target_status")
      .update({
        status: "ready",
        assigned_pirate_name: null,
        assigned_by_user_id: null,
        started_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    await safeAuditLog(supabase, {
      user_id: userId,
      action: "pirate_target_en_route_cancelled",
      entity_type: "highscore_target",
      entity_id: data.ikariam_username.trim(),
      metadata: {
        period_start: data.period_start,
        assigned_pirate_name: existing.assigned_pirate_name,
      },
    });
    return { ok: true };
  });

export const highscoreCollect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => HsTarget.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePirate(supabase, userId);
    const existing = await findHsStatus(supabase, data.period_start, data.ikariam_username);
    const now = new Date().toISOString();
    const patch = {
      status: "collected",
      assigned_pirate_name: null,
      assigned_by_user_id: null,
      started_at: null,
      collected_at: now,
      collected_by_user_id: userId,
      updated_at: now,
      rank: data.rank ?? null,
    };
    if (existing) {
      const { error } = await supabase
        .from("highscore_target_status")
        .update(patch)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("highscore_target_status").insert({
        period_start: data.period_start,
        ikariam_username: data.ikariam_username.trim(),
        ...patch,
      });
      if (error) throw new Error(error.message);
    }
    await safeAuditLog(supabase, {
      user_id: userId,
      action: "pirate_target_collected",
      entity_type: "highscore_target",
      entity_id: data.ikariam_username.trim(),
      metadata: {
        period_start: data.period_start,
        rank: data.rank ?? null,
        coordinates: data.coordinates ?? null,
        alliance_tag: data.alliance_tag ?? null,
      },
    });
    return { ok: true };
  });

/* ------------------------------ Cluster targets ------------------------------ */

const ClusterTarget = z.object({
  period_start: z.string(),
  radius: z.number().int().min(0).max(99),
  cluster_key: z.string().trim().min(1).max(64),
});

async function findClusterStatus(
  supabase: any,
  period_start: string,
  radius: number,
  cluster_key: string,
) {
  const { data } = await supabase
    .from("pirate_cluster_status")
    .select("*")
    .eq("period_start", period_start)
    .eq("radius", radius)
    .eq("cluster_key", cluster_key)
    .maybeSingle();
  return data;
}

export const clusterSetEnRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ClusterTarget.merge(AssignInput).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const existing = await findClusterStatus(
      supabase,
      data.period_start,
      data.radius,
      data.cluster_key,
    );
    if (existing?.status === "en_route")
      throw new Error(`Već je krenuo: ${existing.assigned_pirate_name ?? "nepoznato"}.`);
    const name = data.pirate_name?.trim() || (await displayName(supabase, userId));
    const now = new Date().toISOString();
    const patch = {
      status: "en_route",
      assigned_pirate_name: name,
      assigned_by_user_id: userId,
      started_at: now,
      collected_at: null,
      collected_by_user_id: null,
      updated_at: now,
    };
    if (existing) {
      const { error } = await supabase
        .from("pirate_cluster_status")
        .update(patch)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("pirate_cluster_status").insert({
        period_start: data.period_start,
        radius: data.radius,
        cluster_key: data.cluster_key,
        ...patch,
      });
      if (error) throw new Error(error.message);
    }
    await safeAuditLog(supabase, {
      user_id: userId,
      action: "pirate_cluster_en_route",
      entity_type: "pirate_cluster",
      entity_id: data.cluster_key,
      metadata: {
        period_start: data.period_start,
        radius: data.radius,
        cluster_key: data.cluster_key,
        assigned_pirate_name: name,
        assigned_by_user_id: userId,
      },
    });
    return { ok: true, assigned_pirate_name: name };
  });

export const clusterCancelEnRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ClusterTarget.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const existing = await findClusterStatus(
      supabase,
      data.period_start,
      data.radius,
      data.cluster_key,
    );
    if (!existing) return { ok: true };
    if (existing.assigned_by_user_id !== userId && !(await isPirate(supabase, userId)))
      throw new Error("Samo onaj ko je krenuo, glavni pirat ili admin može otkazati.");
    const { error } = await supabase
      .from("pirate_cluster_status")
      .update({
        status: "ready",
        assigned_pirate_name: null,
        assigned_by_user_id: null,
        started_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    await safeAuditLog(supabase, {
      user_id: userId,
      action: "pirate_cluster_en_route_cancelled",
      entity_type: "pirate_cluster",
      entity_id: data.cluster_key,
      metadata: {
        period_start: data.period_start,
        radius: data.radius,
        assigned_pirate_name: existing.assigned_pirate_name,
      },
    });
    return { ok: true };
  });

export const clusterCollect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ClusterTarget.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePirate(supabase, userId);
    const existing = await findClusterStatus(
      supabase,
      data.period_start,
      data.radius,
      data.cluster_key,
    );
    const now = new Date().toISOString();
    const patch = {
      status: "collected",
      assigned_pirate_name: null,
      assigned_by_user_id: null,
      started_at: null,
      collected_at: now,
      collected_by_user_id: userId,
      updated_at: now,
    };
    if (existing) {
      const { error } = await supabase
        .from("pirate_cluster_status")
        .update(patch)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("pirate_cluster_status").insert({
        period_start: data.period_start,
        radius: data.radius,
        cluster_key: data.cluster_key,
        ...patch,
      });
      if (error) throw new Error(error.message);
    }
    await safeAuditLog(supabase, {
      user_id: userId,
      action: "pirate_cluster_collected",
      entity_type: "pirate_cluster",
      entity_id: data.cluster_key,
      metadata: {
        period_start: data.period_start,
        radius: data.radius,
        cluster_key: data.cluster_key,
      },
    });
    return { ok: true };
  });

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

/* ------------------------------ Player relations ------------------------------ */

const PlayerRelationSchema = z.object({
  ikariam_username: z.string().trim().min(1).max(80),
  relation_type: z.enum(["our_alliance", "deal", "protected"]),
});

export const upsertPlayerRelation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => PlayerRelationSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePirate(supabase, userId);
    const uname = data.ikariam_username.trim();
    const key = uname.toLowerCase();

    const { data: found } = await supabase
      .from("player_relations")
      .select("id")
      .eq("username_key", key)
      .maybeSingle();

    let row: any;
    let action = "player_relation_created";
    if (found) {
      action = "player_relation_updated";
      const { data: upd, error } = await supabase
        .from("player_relations")
        .update({
          ikariam_username: uname,
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
        .from("player_relations")
        .insert({
          ikariam_username: uname,
          username_key: key,
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
      entity_type: "player_relation",
      entity_id: row.id,
      metadata: { ikariam_username: uname, relation_type: data.relation_type },
    });
    return row;
  });

export const deletePlayerRelation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePirate(supabase, userId);
    const { data: prev } = await supabase
      .from("player_relations")
      .select("ikariam_username, relation_type")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await supabase.from("player_relations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await safeAuditLog(supabase, {
      user_id: userId,
      action: "player_relation_deleted",
      entity_type: "player_relation",
      entity_id: data.id,
      metadata: prev ?? null,
    });
    return { ok: true };
  });

/* ------------------------------ GLOBAL target status ------------------------------ */
/* Jedan centralni model statusa mete, vezan za aktivni pirate round i username.       */

async function activeRoundId(supabase: any): Promise<string | null> {
  const { data } = await supabase
    .from("pirate_rounds")
    .select("id")
    .eq("status", "active")
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

async function findTarget(supabase: any, roundId: string | null, key: string) {
  let q = supabase.from("pirate_target_status").select("*").eq("username_key", key);
  q = roundId ? q.eq("pirate_round_id", roundId) : q.is("pirate_round_id", null);
  const { data } = await q.maybeSingle();
  return data;
}

const TargetInput = z.object({
  ikariam_username: z.string().trim().min(1).max(80),
  coordinates: z.string().trim().max(20).nullish(),
  alliance_tag: z.string().trim().max(40).nullish(),
  rank: z.number().int().nullish(),
  pirate_points: z.number().int().nullish(),
});
type TargetData = z.infer<typeof TargetInput>;

async function upsertTarget(
  supabase: any,
  roundId: string | null,
  key: string,
  existing: any,
  patch: Record<string, unknown>,
) {
  if (existing) {
    const { error } = await supabase
      .from("pirate_target_status")
      .update(patch)
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("pirate_target_status")
      .insert({ pirate_round_id: roundId, username_key: key, ...patch });
    if (error) throw new Error(error.message);
  }
}

/** Interna logika: postavi metu u EN_ROUTE. */
async function doSetEnRoute(
  supabase: any,
  userId: string,
  data: TargetData,
  name: string,
  opts: { skipIfEnRoute?: boolean } = {},
) {
  const uname = data.ikariam_username.trim();
  const key = uname.toLowerCase();
  const roundId = await activeRoundId(supabase);
  const existing = await findTarget(supabase, roundId, key);
  if (existing?.status === "en_route") {
    if (opts.skipIfEnRoute) return { ok: true, skipped: true, assigned_pirate_name: name };
    throw new Error(`Već je krenuo: ${existing.assigned_pirate_name ?? "nepoznato"}.`);
  }

  const now = new Date().toISOString();
  const patch = {
    ikariam_username: uname,
    coordinates: data.coordinates ?? existing?.coordinates ?? null,
    alliance_tag: data.alliance_tag ?? existing?.alliance_tag ?? null,
    rank: data.rank ?? existing?.rank ?? null,
    status: "en_route",
    assigned_pirate_name: name,
    assigned_by_user_id: userId,
    started_at: now,
    collected_at: null,
    collected_by_user_id: null,
    updated_at: now,
  };
  await upsertTarget(supabase, roundId, key, existing, patch);

  // Sinhronizuj savezni nalog sa istim username-om (ako postoji).
  await supabase
    .from("ikariam_accounts")
    .update({
      assignment_status: "en_route",
      assigned_pirate_name: name,
      assigned_by_user_id: userId,
      assignment_started_at: now,
    })
    .ilike("ikariam_username", uname);

  await safeAuditLog(supabase, {
    user_id: userId,
    action: "target_en_route",
    entity_type: "pirate_target",
    entity_id: uname,
    metadata: {
      coordinates: patch.coordinates,
      alliance_tag: patch.alliance_tag,
      assigned_pirate_name: name,
      pirate_round_id: roundId,
    },
  });
  return { ok: true, assigned_pirate_name: name };
}

/** Interna logika: pokupi metu — poeni idu na 0 SVUDA. */
async function doCollect(
  supabase: any,
  userId: string,
  data: TargetData & { collected_by_name?: string; source?: string },
  fallbackName: string,
) {
  const uname = data.ikariam_username.trim();
  const key = uname.toLowerCase();
  const roundId = await activeRoundId(supabase);
  const existing = await findTarget(supabase, roundId, key);
  const now = new Date().toISOString();

  const explicit = data.collected_by_name?.trim();
  const collectorName = explicit || existing?.assigned_pirate_name || fallbackName;

  // Poeni: eksplicitno prosljeđeni → poeni saveznog naloga (ako postoji) → 0
  let points = data.pirate_points ?? null;
  const { data: acc } = await supabase
    .from("ikariam_accounts")
    .select("id, current_pirate_points")
    .ilike("ikariam_username", uname)
    .maybeSingle();
  if (points == null) points = acc?.current_pirate_points ?? 0;

  const patch = {
    ikariam_username: uname,
    coordinates: data.coordinates ?? existing?.coordinates ?? null,
    alliance_tag: data.alliance_tag ?? existing?.alliance_tag ?? null,
    rank: data.rank ?? existing?.rank ?? null,
    status: "collected",
    assigned_pirate_name: null,
    assigned_by_user_id: null,
    started_at: null,
    collected_at: now,
    collected_by_user_id: userId,
    collected_points: points,
    updated_at: now,
  };
  await upsertTarget(supabase, roundId, key, existing, patch);

  const { error: evErr } = await supabase.from("pirate_collection_events").insert({
    pirate_round_id: roundId,
    collected_by_name: collectorName,
    collected_by_user_id: explicit ? null : userId,
    target_username: uname,
    target_coordinates: patch.coordinates,
    target_alliance: patch.alliance_tag,
    pirate_points_collected: points,
    source: data.source ?? null,
    collected_at: now,
  });
  if (evErr) throw new Error(evErr.message);

  // Savezni nalog: poeni padaju na 0 i assignment se čisti.
  await supabase
    .from("ikariam_accounts")
    .update({
      current_pirate_points: 0,
      points_source: "collected",
      points_authoritative_at: now,
      last_updated_at: now,
      last_collected_at: now,
      collected_by_user_id: userId,
      assignment_status: "ready",
      assigned_pirate_name: null,
      assigned_by_user_id: null,
      assignment_started_at: null,
    })
    .ilike("ikariam_username", uname);

  await safeAuditLog(supabase, {
    user_id: userId,
    action: "target_collected",
    entity_type: "pirate_target",
    entity_id: uname,
    metadata: {
      coordinates: patch.coordinates,
      alliance_tag: patch.alliance_tag,
      pirate_points_collected: points,
      collected_by_name: collectorName,
      pirate_round_id: roundId,
    },
  });
  return { ok: true, collected_by_name: collectorName, pirate_points_collected: points };
}

async function doCancel(supabase: any, userId: string, uname: string) {
  const key = uname.trim().toLowerCase();
  const roundId = await activeRoundId(supabase);
  const existing = await findTarget(supabase, roundId, key);
  if (!existing) return { ok: true };
  if (existing.assigned_by_user_id !== userId && !(await isPirate(supabase, userId)))
    throw new Error("Samo onaj ko je krenuo, glavni pirat ili admin može otkazati.");

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("pirate_target_status")
    .update({
      status: "ready",
      assigned_pirate_name: null,
      assigned_by_user_id: null,
      started_at: null,
      updated_at: now,
    })
    .eq("id", existing.id);
  if (error) throw new Error(error.message);

  await supabase
    .from("ikariam_accounts")
    .update({
      assignment_status: "ready",
      assigned_pirate_name: null,
      assigned_by_user_id: null,
      assignment_started_at: null,
    })
    .ilike("ikariam_username", uname.trim());

  await safeAuditLog(supabase, {
    user_id: userId,
    action: "target_en_route_cancelled",
    entity_type: "pirate_target",
    entity_id: uname.trim(),
    metadata: {
      assigned_pirate_name: existing.assigned_pirate_name,
      pirate_round_id: roundId,
    },
  });
  return { ok: true };
}

export const targetSetEnRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => TargetInput.merge(AssignInput).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const name = data.pirate_name?.trim() || (await displayName(supabase, userId));
    return doSetEnRoute(supabase, userId, data, name);
  });

export const targetCancelEnRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ ikariam_username: z.string().trim().min(1) }).parse(i),
  )
  .handler(async ({ data, context }) =>
    doCancel(context.supabase, context.userId, data.ikariam_username),
  );

export const targetCollect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    TargetInput.extend({
      collected_by_name: z.string().trim().max(60).optional(),
      source: z.string().trim().max(40).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePirate(supabase, userId);
    return doCollect(supabase, userId, data, await displayName(supabase, userId));
  });

/* --------------------- Masovne akcije (klaster → svi igrači) --------------------- */

export const targetBulkSetEnRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        targets: z.array(TargetInput).min(1).max(200),
        pirate_name: z.string().trim().max(60).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const name = data.pirate_name?.trim() || (await displayName(supabase, userId));
    let count = 0;
    for (const t of data.targets) {
      const r = await doSetEnRoute(supabase, userId, t, name, { skipIfEnRoute: true });
      if (!(r as any).skipped) count++;
    }
    return { ok: true, assigned_pirate_name: name, count };
  });

export const targetBulkCollect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        targets: z.array(TargetInput).min(1).max(200),
        collected_by_name: z.string().trim().max(60).optional(),
        source: z.string().trim().max(40).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePirate(supabase, userId);
    const fallback = await displayName(supabase, userId);
    let total = 0;
    for (const t of data.targets) {
      const r = await doCollect(
        supabase,
        userId,
        { ...t, collected_by_name: data.collected_by_name, source: data.source },
        fallback,
      );
      total += r.pirate_points_collected ?? 0;
    }
    return { ok: true, count: data.targets.length, total_points: total };
  });

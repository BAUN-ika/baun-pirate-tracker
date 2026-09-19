import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { safeAuditLog } from "@/lib/audit";

/** Rejone smiju upravljati admin i glavni pirat (postojeća permission logika). */
async function requireRegionManager(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data ?? []) as { role: string }[]).map((r) => r.role);
  if (!roles.includes("admin") && !roles.includes("glavni_pirat"))
    throw new Error("Samo admin ili glavni pirat može upravljati rejonima.");
}

/** Rejon se može dodijeliti samo piratu ili glavnom piratu. */
async function requireTargetIsPirate(supabase: any, pirateUserId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", pirateUserId);
  const roles = ((data ?? []) as { role: string }[]).map((r) => r.role);
  if (!roles.includes("pirat") && !roles.includes("glavni_pirat"))
    throw new Error("Rejon se može dodijeliti samo piratu ili glavnom piratu.");
}

const coord = z.number().int().min(1).max(100);

const ItemSchema = z
  .object({
    item_type: z.enum(["point", "rectangle"]),
    x_start: coord,
    x_end: coord,
    y_start: coord,
    y_end: coord,
  })
  /* automatska normalizacija obrnutog opsega (30-20 -> 20-30) */
  .transform((i) => ({
    item_type: i.item_type,
    x_start: Math.min(i.x_start, i.x_end),
    x_end: Math.max(i.x_start, i.x_end),
    y_start: Math.min(i.y_start, i.y_end),
    y_end: Math.max(i.y_start, i.y_end),
  }));

const SaveSchema = z.object({
  id: z.string().uuid().optional(),
  pirate_user_id: z.string().uuid(),
  name: z.string().trim().max(80).optional().nullable(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Boja mora biti HEX (#RRGGBB)."),
  items: z.array(ItemSchema).min(1, "Rejon mora imati najmanje jednu koordinatu ili opseg."),
});

export const saveRegion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SaveSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireRegionManager(supabase, userId);
    await requireTargetIsPirate(supabase, data.pirate_user_id);

    /* dedup identičnih itema unutar istog rejona */
    const seen = new Set<string>();
    const items = data.items.filter((i) => {
      const k = `${i.item_type}|${i.x_start}|${i.x_end}|${i.y_start}|${i.y_end}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    let regionId = data.id ?? null;
    const now = new Date().toISOString();

    if (regionId) {
      const { error } = await supabase
        .from("pirate_regions")
        .update({
          pirate_user_id: data.pirate_user_id,
          name: data.name?.trim() || null,
          color: data.color,
          updated_at: now,
        })
        .eq("id", regionId);
      if (error) throw new Error(error.message);
      const { error: delErr } = await supabase
        .from("pirate_region_items")
        .delete()
        .eq("region_id", regionId);
      if (delErr) throw new Error(delErr.message);
    } else {
      const { data: row, error } = await supabase
        .from("pirate_regions")
        .insert({
          pirate_user_id: data.pirate_user_id,
          name: data.name?.trim() || null,
          color: data.color,
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      regionId = row.id as string;
    }

    const { error: itemsErr } = await supabase
      .from("pirate_region_items")
      .insert(items.map((i) => ({ ...i, region_id: regionId })));
    if (itemsErr) throw new Error(itemsErr.message);

    await safeAuditLog(supabase, {
      user_id: userId,
      action: data.id ? "pirate_region_updated" : "pirate_region_created",
      entity_type: "pirate_region",
      entity_id: regionId!,
      metadata: {
        pirate_user_id: data.pirate_user_id,
        items_count: items.length,
        color: data.color,
      },
    });

    return { ok: true, id: regionId };
  });

export const deleteRegion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireRegionManager(supabase, userId);
    const { error } = await supabase.from("pirate_regions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await safeAuditLog(supabase, {
      user_id: userId,
      action: "pirate_region_deleted",
      entity_type: "pirate_region",
      entity_id: data.id,
    });
    return { ok: true };
  });

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, any>[]> }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const builder: any = {
    middleware: () => builder,
    inputValidator: () => builder,
    handler: (handler: any) => (input: any) => handler({ ...input, context: { supabase: {}, userId: "reader" } }),
  };
  return builder;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/tenant", () => ({ activeAllianceId: async () => "b" }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: (table: string) => {
  const filters: ((row: any) => boolean)[] = [];
  let columns: string[] = []; let first = 0; let last = 1000; let single = false;
  const query: any = {
    select: (cols: string) => { columns = cols.split(",").map(c => c.trim()); return query; },
    eq: (k: string, v: unknown) => { filters.push(r => r[k] === v); return query; },
    neq: (k: string, v: unknown) => { filters.push(r => r[k] !== v); return query; },
    gte: (k: string, v: string) => { filters.push(r => r[k] >= v); return query; },
    lt: (k: string, v: string) => { filters.push(r => r[k] < v); return query; },
    in: (k: string, values: unknown[]) => { filters.push(r => values.includes(r[k])); return query; },
    order: () => query,
    range: (from: number, to: number) => { first = from; last = to; return query; },
    limit: (n: number) => { last = n - 1; return query; },
    single: () => { single = true; return query; },
    maybeSingle: () => { single = true; return query; },
    then: (resolve: any) => {
      const rows = (state.tables[table] ?? []).filter(r => filters.every(f => f(r))).slice(first, last + 1)
        .map(r => Object.fromEntries(columns.map(c => [c, r[c]])));
      resolve({ data: single ? rows[0] ?? null : rows, error: null });
    },
  };
  return query;
} } }));

import { getGlobalEntries, getGlobalStatuses } from "./global.functions";
const data = { section: "highscore" as const, startISO: "2026-10-31T17:00:00Z", endISO: "2026-11-01T17:00:00Z" };
beforeEach(() => {
  state.tables = {
    alliances: [{ id: "a", world_id: "w", tag: "GROUP_A" }, { id: "b", world_id: "w", tag: "GROUP_B" }, { id: "c", world_id: "other-world" }],
    highscore_entries: [
      { alliance_id: "a", world_id: "w", rank: 497, ikariam_username: "Luffy", pirate_points: 7414, alliance_tag: "BOEM", coordinates: "100:68", city_name: "300", period_start: data.startISO, created_at: data.startISO, submitted_by_user_id: "foreign-importer" },
      { alliance_id: "c", world_id: "other-world", rank: 499, ikariam_username: "Foreign world player", pirate_points: 99999, period_start: data.startISO },
    ],
    pirate_rounds: [{ id: "round-a", alliance_id: "a", world_id: "w", status: "active" }],
    pirate_target_status: [{ pirate_round_id: "round-a", alliance_id: "a", world_id: "w", username_key: "luffy", ikariam_username: "Luffy", status: "collected", collected_at: "2026-10-31T18:00:00Z", assigned_pirate_name: "Secret pirate", collected_by_user_id: "secret-collector" }],
  };
});
describe("existing global highscore visibility boundary", () => {
  it("returns no foreign-group data without permission", async () => {
    expect(await getGlobalEntries({ data })).toEqual([]);
    expect(await getGlobalStatuses({})).toEqual([]);
  });
  it("allows group permission only within the same world and strips importer identities", async () => {
    state.tables.alliance_visibility_permissions = [{ alliance_id: "b", can_view_global_highscore: true }];
    const rows = await getGlobalEntries({ data });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ikariam_username: "Luffy", pirate_points: 7414, alliance_tag: "BOEM", own: false });
    expect(rows[0]).not.toHaveProperty("submitted_by_user_id");
    expect(rows[0]).not.toHaveProperty("alliance_id");
  });
  it("allows an individual permission without a group grant", async () => {
    state.tables.user_visibility_permissions = [{ user_id: "reader", world_id: "w", can_view_global_highscore: true }];
    expect((await getGlobalEntries({ data })).map(r => r.ikariam_username)).toEqual(["Luffy"]);
  });
  it("preserves individual denial over a group permission", async () => {
    state.tables.alliance_visibility_permissions = [{ alliance_id: "b", can_view_global_highscore: true }];
    state.tables.user_visibility_permissions = [{ user_id: "reader", world_id: "w", can_view_global_highscore: false }];
    expect(await getGlobalEntries({ data })).toEqual([]);
  });
  it("does not use a permission belonging to another world", async () => {
    state.tables.user_visibility_permissions = [{ user_id: "reader", world_id: "other-world", can_view_global_highscore: true }];
    expect(await getGlobalEntries({ data })).toEqual([]);
  });
  it("shares collected status without pirate or collector identities", async () => {
    state.tables.alliance_visibility_permissions = [{ alliance_id: "b", can_view_global_highscore: true }];
    const rows = await getGlobalStatuses({});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ username_key: "luffy", status: "collected" });
    expect(rows[0]).not.toHaveProperty("assigned_pirate_name");
    expect(rows[0]).not.toHaveProperty("collected_by_user_id");
  });
});
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  accounts: [] as Record<string, any>[], submissions: [] as Record<string, any>[], entries: [] as Record<string, any>[],
}));
vi.mock("@/lib/period", () => ({ getCurrentPeriod: () => ({ start: new Date("2026-10-31T17:00:00Z"), end: new Date("2026-11-01T17:00:00Z") }) }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (table: string) => {
    const filters: [string, unknown][] = []; let action = "select"; let value: any; let single = false;
    const query: any = {
      select: () => query, eq: (k: string, v: unknown) => { filters.push([k,v]); return query; },
      ilike: (k: string, v: unknown) => { filters.push([k,v]); return query; },
      single: () => { single = true; return query; }, maybeSingle: () => { single = true; return query; },
      insert: (v: any) => { action = "insert"; value = v; return query; },
      update: (v: any) => { action = "update"; value = v; return query; },
      then: (resolve: (value: any) => void) => {
        const rows = table === "ikariam_accounts" ? state.accounts : table === "highscore_submissions" ? state.submissions : table === "highscore_entries" ? state.entries : [];
        const found = rows.filter(r => filters.every(([k,v]) => typeof v === "string" && typeof r[k] === "string" ? r[k].toLowerCase() === v.toLowerCase() : r[k] === v));
        let data: any = found;
        if (action === "insert") { const added = (Array.isArray(value) ? value : [value]).map((v: any) => ({ id: `id-${rows.length}`, ...v })); rows.push(...added); data = added; }
        if (action === "update") found.forEach(r => Object.assign(r,value));
        resolve({ data: single ? data[0] ?? null : data, error: null });
      },
    }; return query;
  } },
}));
import { importHighscore } from "./highscore-import.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const scope = { supabase: {} as SupabaseClient<Database>, userId: "user", allianceId: "a", worldId: "w", isAdmin: false };
const account = (source: string, at: string, points = 0) => ({ id: "account", alliance_id: "a", world_id: "w", ikariam_username: "Luffy", owner_user_id: "user", current_pirate_points: points, points_source: source, points_authoritative_at: at });
const text = "497. 7,414 points Luffy en 100:68, 300";
beforeEach(() => { state.accounts.length=0; state.submissions.length=0; state.entries.length=0; });
describe("shared highscore import", () => {
  for (const source of ["manual", "mission", "current_player", "collected"]) {
    it(`preserves ${source} updates since the last 18:00 boundary`, async () => {
      state.accounts.push(account(source,"2026-10-31T17:10:00Z",source === "collected" ? 0 : 12345));
      await importHighscore({ raw_text: text },scope);
      expect(state.accounts[0].current_pirate_points).toBe(source === "collected" ? 0 : 12345);
      expect(state.entries[0]).toMatchObject({ source: "scanner", pirate_points: 7414, coordinates: "100:68", city_name: "300", alliance_id: "a", world_id: "w" });
    });
  }
  it("applies list points when authority predates 18:00", async () => {
    state.accounts.push(account("collected","2026-10-31T16:59:59Z"));
    await importHighscore({ raw_text: text },scope);
    expect(state.accounts[0].current_pirate_points).toBe(7414);
  });
  it("CURRENT_PLAYER always wins for owned accounts", async () => {
    state.accounts.push(account("collected","2026-10-31T18:00:00Z"));
    const result=await importHighscore({ raw_text: `CURRENT_PLAYER 118472 points Luffy\n${text}` },scope);
    expect(state.accounts[0].current_pirate_points).toBe(118472);
    expect(result.current_player?.status).toBe("updated");
  });
  it("cannot change accounts in another alliance or world", async () => {
    state.accounts.push({ ...account("highscore","2026-10-30T18:00:00Z",555), alliance_id: "other", world_id: "other-world" });
    await importHighscore({ raw_text: text },scope);
    expect(state.accounts[0].current_pirate_points).toBe(555);
  });
  it("replays a confirmed scanner request without inserting twice", async () => {
    const first = await importHighscore({ raw_text: text, scanner_request_id: "request" },scope);
    const second = await importHighscore({ raw_text: text, scanner_request_id: "request" },scope);
    expect(second.submission_id).toBe(first.submission_id);
    expect(state.submissions).toHaveLength(1); expect(state.entries).toHaveLength(1);
  });
  it("keeps all duplicate rows while the last one determines points", async () => {
    state.accounts.push(account("highscore","2026-10-30T18:00:00Z"));
    await importHighscore({ raw_text: `${text}\n498. 8,000 points Luffy en 100:68, 300` },scope);
    expect(state.entries).toHaveLength(2); expect(state.accounts[0].current_pirate_points).toBe(8000);
  });
});
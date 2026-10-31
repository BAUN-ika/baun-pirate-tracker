import { describe, expect, it } from "vitest";
import { eligibleScannerAlliances, ikariamServer } from "./scanner-protocol";

describe("scanner world isolation", () => {
  it("resolves Nereus hostname to server 70 en", () => {
    expect(ikariamServer("s70-en.ikariam.gameforge.com")).toEqual({ server_number: 70, server_region: "en" });
  });
  it("rejects non-game and spoofed hostnames without fallback", () => {
    expect(ikariamServer("s70-en.ikariam.gameforge.com.evil.test")).toBeNull();
    expect(ikariamServer("baun-pirate-tracker.lovable.app")).toBeNull();
  });
  const alliances = [
    { id: "a", world_id: "nereus", is_active: true },
    { id: "b", world_id: "nereus", is_active: true },
    { id: "c", world_id: "other", is_active: true },
    { id: "d", world_id: "nereus", is_active: false },
  ];
  const memberships = alliances.map(a => ({ alliance_id: a.id, world_id: a.world_id, is_active: true }));
  it("offers both active memberships in the matched world only", () => {
    expect(eligibleScannerAlliances("nereus", alliances, memberships).map(a => a.id)).toEqual(["a", "b"]);
  });
  it("does not authorize global visibility as membership", () => {
    expect(eligibleScannerAlliances("nereus", alliances, [])).toEqual([]);
  });
  it("rejects inactive memberships", () => {
    expect(eligibleScannerAlliances("nereus", alliances, memberships.map(m => ({ ...m, is_active: false })))).toEqual([]);
  });
});
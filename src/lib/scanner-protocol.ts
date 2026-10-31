import { z } from "zod";

export const ServerMappingSchema = z.object({
  server_number: z.number().int().min(1).max(9999),
  server_region: z.string().trim().toLowerCase().regex(/^[a-z]{2,8}$/),
});

export function ikariamServer(hostname: string) {
  const match = /^s([1-9]\d{0,3})-([a-z]{2,8})\.ikariam\.gameforge\.com$/i.exec(hostname);
  return match ? ServerMappingSchema.parse({ server_number: Number(match[1]), server_region: match[2] }) : null;
}

export function eligibleScannerAlliances<T extends { id: string; world_id: string; is_active: boolean }>(
  worldId: string, alliances: T[], memberships: { alliance_id: string; world_id: string; is_active: boolean }[],
) {
  return alliances.filter(a => a.world_id === worldId && a.is_active && memberships.some(m =>
    m.is_active && m.world_id === worldId && m.alliance_id === a.id));
}

export const ScannerRequestSchema = ServerMappingSchema.extend({
  action: z.enum(["resolve", "import"]),
  alliance_id: z.string().uuid().optional(),
  request_id: z.string().uuid().optional(),
  raw_text: z.string().min(1).max(50_000).optional(),
});
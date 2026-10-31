// Shared pirate mission durations and rewards (keep in sync with
// MISSION_REWARD in src/lib/missions.functions.ts).
export const MISSION_TYPES = [
  { type: "mission_1h", hours: 1, reward: 1131 },
  { type: "mission_2h", hours: 2, reward: 1810 },
  { type: "mission_4h", hours: 4, reward: 2896 },
  { type: "mission_8h", hours: 8, reward: 4634 },
  { type: "mission_16h", hours: 16, reward: 7414 },
] as const;

export type MissionType = (typeof MISSION_TYPES)[number]["type"];

export function missionHours(type: string): number {
  return MISSION_TYPES.find((m) => m.type === type)?.hours ?? 8;
}

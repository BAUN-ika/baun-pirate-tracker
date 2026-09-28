import { getGlobalEntries, type GlobalEntry } from "@/lib/global.functions";

export type GlobalSection = "highscore" | "clusters" | "nearest" | "map";

/**
 * Spaja vlastite highscore unose sa sanitizovanim globalnim unosima (ako postoji dozvola).
 * Rezultat je sortiran po created_at DESC, pa postojeći "najnoviji pobjeđuje" dedup radi isto.
 */
export async function mergeGlobal<T extends { created_at: string }>(
  own: T[],
  section: GlobalSection,
  startISO: string,
  endISO: string,
): Promise<(T | (GlobalEntry & Partial<T>))[]> {
  let extra: GlobalEntry[] = [];
  try {
    extra = await getGlobalEntries({ data: { section, startISO, endISO } });
  } catch {
    extra = [];
  }
  if (!extra.length) return own;
  const all = [...own, ...(extra as any[])];
  all.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  return all;
}

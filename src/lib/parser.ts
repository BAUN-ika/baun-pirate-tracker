// Highscore text parser.
// Format: "<rank> . <points> Capture Points <username>"
// Username may contain spaces.

export interface ParsedRow {
  raw: string;
  valid: boolean;
  rank?: number;
  piratePoints?: number;
  ikariamUsername?: string;
  reason?: string;
}

const LINE_REGEX = /^\s*(\d+)\s*\.?\s+([\d,\.]+)\s+Capture Points\s+(.+?)\s*$/i;

export function parseHighscoreText(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/);
  const out: ParsedRow[] = [];
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const m = trimmed.match(LINE_REGEX);
    if (!m) {
      out.push({ raw: trimmed, valid: false, reason: "Format ne odgovara" });
      continue;
    }
    const rank = parseInt(m[1], 10);
    const points = parseInt(m[2].replace(/[,\.]/g, ""), 10);
    const username = m[3].trim();
    if (!Number.isFinite(rank) || !Number.isFinite(points) || !username) {
      out.push({ raw: trimmed, valid: false, reason: "Nedostaju vrijednosti" });
      continue;
    }
    out.push({
      raw: trimmed,
      valid: true,
      rank,
      piratePoints: points,
      ikariamUsername: username,
    });
  }
  return out;
}

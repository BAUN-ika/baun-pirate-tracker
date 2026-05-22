// Highscore text parser.
// Format: "<rank> . <points> <LABEL ...> <username>"
// Label za poene varira po jeziku ("Capture Points", "Освајачки поени", "Osvajački bodovi", ...).
// Pretpostavka: nakon broja poena slijede tačno 2 riječi labele, a sve nakon toga je username.
// Username može imati razmake.

export interface ParsedRow {
  raw: string;
  valid: boolean;
  rank?: number;
  piratePoints?: number;
  ikariamUsername?: string;
  reason?: string;
}

// \S+ pokriva latinicu i ćirilicu (sve što nije whitespace).
const LINE_REGEX = /^\s*(\d+)\s*\.?\s+([\d.,]+)\s+\S+\s+\S+\s+(.+?)\s*$/;

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
    const points = parseInt(m[2].replace(/[,\.\s]/g, ""), 10);
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

// Highscore text parser — podržava 3 formata:
// 0) CURRENT_PLAYER red:
//    "CURRENT_PLAYER 37070 points Fire Fly"
// 1) Ručni highscore unos:
//    "196 . 10,399 Capture Points Linkinpark88"
//    "113 . 14.828 Освајачки поени DunkelTier"
// 2) Pirate Scanner highscore red sa koord/savezom/gradom:
//    "50. 29,656 points Lundin (-I-) en 40:84, Lundingeluptus"
//    "54. 29,656 points Fire Fly en 25:2, The Elite"

export type ParsedKind = "current_player" | "scanner" | "manual";

export interface ParsedRow {
  raw: string;
  valid: boolean;
  kind?: ParsedKind;
  rank?: number;
  piratePoints?: number;
  ikariamUsername?: string;
  allianceTag?: string | null;
  coordinates?: string | null;
  cityName?: string | null;
  reason?: string;
}

const CURRENT_PLAYER_RE =
  /^\s*CURRENT_PLAYER\s+([\d.,]+)\s+points\s+(.+?)\s*$/i;

// rank . points points <username>[ (TAG)] en x:y, city name
const SCANNER_RE =
  /^\s*(\d+)\.\s*([\d.,]+)\s+points\s+(.+?)(?:\s+\(([^)]+)\))?\s+en\s+(\d{1,2}:\d{1,2})\s*,\s*(.+?)\s*$/i;

// Postojeći ručni format: rank . points <2 riječi labele> <username>
const MANUAL_RE = /^\s*(\d+)\s*\.?\s+([\d.,]+)\s+\S+\s+\S+\s+(.+?)\s*$/;

function toInt(s: string): number {
  return parseInt(s.replace(/[,\.\s]/g, ""), 10);
}

function validCoords(c: string): boolean {
  const m = c.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m) return false;
  const a = +m[1];
  const b = +m[2];
  return a >= 1 && a <= 99 && b >= 1 && b <= 99;
}

export function parseLine(raw: string): ParsedRow {
  const trimmed = raw.trim();
  if (!trimmed) return { raw: trimmed, valid: false, reason: "Prazan red" };

  // 0) CURRENT_PLAYER
  const mCp = trimmed.match(CURRENT_PLAYER_RE);
  if (mCp) {
    const points = toInt(mCp[1]);
    const username = mCp[2].trim();
    if (!Number.isFinite(points) || !username) {
      return { raw: trimmed, valid: false, reason: "CURRENT_PLAYER: nedostaju vrijednosti" };
    }
    return {
      raw: trimmed,
      valid: true,
      kind: "current_player",
      piratePoints: points,
      ikariamUsername: username,
    };
  }

  // 2) Scanner format (provjeravamo prije manual jer ima specifične 'en x:y,' markere)
  const mS = trimmed.match(SCANNER_RE);
  if (mS) {
    const rank = parseInt(mS[1], 10);
    const points = toInt(mS[2]);
    const username = mS[3].trim();
    const alliance = mS[4] ? mS[4].trim() : null;
    const coords = mS[5].trim();
    const city = mS[6].trim();
    if (!validCoords(coords)) {
      return { raw: trimmed, valid: false, reason: "Neispravne koordinate" };
    }
    if (!Number.isFinite(rank) || !Number.isFinite(points) || !username) {
      return { raw: trimmed, valid: false, reason: "Scanner: nedostaju vrijednosti" };
    }
    return {
      raw: trimmed,
      valid: true,
      kind: "scanner",
      rank,
      piratePoints: points,
      ikariamUsername: username,
      allianceTag: alliance,
      coordinates: coords,
      cityName: city,
    };
  }

  // 1) Ručni format
  const mM = trimmed.match(MANUAL_RE);
  if (mM) {
    const rank = parseInt(mM[1], 10);
    const points = toInt(mM[2]);
    const username = mM[3].trim();
    if (!Number.isFinite(rank) || !Number.isFinite(points) || !username) {
      return { raw: trimmed, valid: false, reason: "Nedostaju vrijednosti" };
    }
    return {
      raw: trimmed,
      valid: true,
      kind: "manual",
      rank,
      piratePoints: points,
      ikariamUsername: username,
      allianceTag: null,
      coordinates: null,
      cityName: null,
    };
  }

  return { raw: trimmed, valid: false, reason: "Format ne odgovara" };
}

export function parseHighscoreText(text: string): ParsedRow[] {
  return text
    .split(/\r?\n/)
    .map((l) => l)
    .filter((l) => l.trim().length > 0)
    .map(parseLine);
}

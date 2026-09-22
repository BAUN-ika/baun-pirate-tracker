import * as XLSX from "xlsx";

export type ExcelFormat = "A" | "B";

export interface ParsedRow {
  pirate_username: string | null;
  coordinates: string | null;
  player: string;
  valid: boolean;
  note: string;
}

export interface ParseResult {
  format: ExcelFormat;
  rows: ParsedRow[];
}

const norm = (v: unknown) => String(v ?? "").trim();
const key = (v: unknown) => norm(v).toLowerCase().replace(/\s+/g, "");

/** Prepoznaje kolone po headerima (EN i lokalni nazivi). */
function detectColumns(header: unknown[]) {
  const idx = { pirate: -1, coords: -1, player: -1 };
  header.forEach((h, i) => {
    const k = key(h);
    if (idx.pirate < 0 && (k === "pirate" || k === "pirat")) idx.pirate = i;
    else if (
      idx.coords < 0 &&
      (k === "coordinates" || k === "coordinate" || k === "koordinate" || k === "coords")
    )
      idx.coords = i;
    else if (idx.player < 0 && (k === "player" || k === "igrac" || k === "igrač" || k === "igraè"))
      idx.player = i;
  });
  return idx;
}

const COORD_RE = /^(\d{1,3})\s*[:.\-]\s*(\d{1,3})$/;

function normCoords(raw: string): { value: string | null; note: string } {
  if (!raw) return { value: null, note: "" };
  const m = raw.match(COORD_RE);
  if (!m) return { value: null, note: "Neispravan format koordinata (očekuje x:y)." };
  const x = Number(m[1]);
  const y = Number(m[2]);
  if (x < 1 || x > 100 || y < 1 || y > 100)
    return { value: null, note: "Koordinate moraju biti između 1 i 100." };
  return { value: `${x}:${y}`, note: "" };
}

/**
 * Parsira Excel fajl i automatski prepoznaje format:
 * FORMAT A: Pirate | Coordinates | Player
 * FORMAT B: Coordinates | Player (pirat se bira u aplikaciji)
 */
export async function parseAssignmentsFile(
  file: File,
  selectedPirateName: string | null,
): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("Excel fajl je prazan.");
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
  if (matrix.length === 0) throw new Error("Excel fajl je prazan.");

  let idx = detectColumns(matrix[0] ?? []);
  let start = 1;
  if (idx.coords < 0 && idx.player < 0) {
    /* bez headera — pogodi po broju kolona */
    const cols = (matrix[0] ?? []).length;
    idx = cols >= 3 ? { pirate: 0, coords: 1, player: 2 } : { pirate: -1, coords: 0, player: 1 };
    start = 0;
  }
  if (idx.player < 0) throw new Error('U fajlu nije nađena kolona "Player".');

  const format: ExcelFormat = idx.pirate >= 0 ? "A" : "B";
  const rows: ParsedRow[] = [];

  for (let r = start; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    const player = norm(row[idx.player]);
    const rawCoords = idx.coords >= 0 ? norm(row[idx.coords]) : "";
    const filePirate = idx.pirate >= 0 ? norm(row[idx.pirate]) : "";
    if (!player && !rawCoords && !filePirate) continue;

    const coords = normCoords(rawCoords);
    const pirate = format === "A" ? filePirate || null : selectedPirateName;

    let note = coords.note;
    let valid = true;
    if (!player) {
      valid = false;
      note = "Ime igrača je obavezno.";
    } else if (!pirate) {
      valid = false;
      note =
        format === "A"
          ? "Pirat nije naveden u redu."
          : "Odaberi pirata za kojeg importuješ ovaj fajl.";
    } else if (coords.note) {
      valid = false;
    }

    rows.push({
      pirate_username: pirate,
      coordinates: coords.value,
      player,
      valid,
      note: valid ? note || "OK" : note,
    });
  }

  if (rows.length === 0) throw new Error("U fajlu nema redova sa podacima.");
  return { format, rows };
}

function download(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename);
}

export function downloadTemplateWithPirate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ["Pirate", "Coordinates", "Player"],
    ["Megafon", "02:17", "cicamaca"],
    ["Megafon", "02:17", "blabla66"],
    ["Drugi Pirat", "47:63", "HawBatt"],
  ]);
  ws["!cols"] = [{ wch: 18 }, { wch: 14 }, { wch: 22 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Assignments");
  download(wb, "baun-assignments-sa-piratom.xlsx");
}

export function downloadTemplateSinglePirate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ["Coordinates", "Player"],
    ["02:17", "cicamaca"],
    ["02:17", "blabla66"],
    ["05:24", "mikiblue"],
  ]);
  ws["!cols"] = [{ wch: 14 }, { wch: 22 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Assignments");
  download(wb, "baun-assignments-jedan-pirat.xlsx");
}

// Highscore period helpers — daily 18:00 cutoff in Europe/Sarajevo timezone.
// One period spans 18:00 → 18:00 next day (lokalno vrijeme Sarajevo).

export interface Period {
  start: Date;
  end: Date;
}

const TZ = "Europe/Sarajevo";

function getZonedParts(d: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(d).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return {
    year: +parts.year,
    month: +parts.month,
    day: +parts.day,
    // Intl emits "24" for midnight in some browsers — normalize to 0.
    hour: +parts.hour % 24,
    minute: +parts.minute,
    second: +parts.second,
  };
}

// Build a Date whose wall-time representation in `tz` is exactly (y,mo,d,h,mi,s).
function zonedTimeToUtc(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  tz: string,
): Date {
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  const p = getZonedParts(guess, tz);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const offset = asIfUtc - guess.getTime();
  return new Date(guess.getTime() - offset);
}

export function getCurrentPeriod(now: Date = new Date()): Period {
  const local = getZonedParts(now, TZ);
  const todayCutoff = zonedTimeToUtc(local.year, local.month, local.day, 18, 0, 0, TZ);
  let start: Date;
  if (now.getTime() >= todayCutoff.getTime()) {
    start = todayCutoff;
  } else {
    // Use day - 1 — Date.UTC handles month/year rollover correctly.
    start = zonedTimeToUtc(local.year, local.month, local.day - 1, 18, 0, 0, TZ);
  }
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export function getPreviousPeriod(now: Date = new Date()): Period {
  const cur = getCurrentPeriod(now);
  const start = new Date(cur.start.getTime() - 24 * 60 * 60 * 1000);
  return { start, end: cur.start };
}

export function msUntilNextReset(now: Date = new Date()): number {
  return getCurrentPeriod(now).end.getTime() - now.getTime();
}

export function formatCountdown(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

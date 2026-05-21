// Highscore period helpers — daily 18:00 cutoff (server local time).
// One period spans 18:00 → 18:00 next day.

export interface Period {
  start: Date;
  end: Date;
}

export function getCurrentPeriod(now: Date = new Date()): Period {
  const cutoffHour = 18;
  const start = new Date(now);
  start.setHours(cutoffHour, 0, 0, 0);
  if (now.getTime() < start.getTime()) {
    start.setDate(start.getDate() - 1);
  }
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function getPreviousPeriod(now: Date = new Date()): Period {
  const cur = getCurrentPeriod(now);
  const start = new Date(cur.start);
  start.setDate(start.getDate() - 1);
  const end = new Date(cur.start);
  return { start, end };
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

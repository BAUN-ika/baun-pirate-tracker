export const COORDS_RE = /^[0-9]{1,2}:[0-9]{1,2}$/;

export function validCoords(s: string): boolean {
  if (!COORDS_RE.test(s)) return false;
  const [a, b] = s.split(":").map(Number);
  return a >= 1 && a <= 99 && b >= 1 && b <= 99;
}

export function CoordsLink({ coords }: { coords: string }) {
  if (!coords || !COORDS_RE.test(coords)) {
    return <span className="text-muted-foreground">—</span>;
  }
  const [a, b] = coords.split(":");
  const islandId = `${a}${b}`;
  const url = `https://s70-en.ikariam.gameforge.com/?view=island&islandId=${islandId}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-gold hover:underline tabular-nums"
    >
      {coords}
    </a>
  );
}

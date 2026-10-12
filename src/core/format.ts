// Display helpers shared by the panel (and tested on their own).

/** -75_000 → "-1:15", 3_725_000 → "1:02:05". Rounds toward the displayed second. */
export function formatCountdown(ms: number): string {
  const negative = ms < 0;
  const total = negative ? Math.floor(-ms / 1000) : Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const body = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  return negative && total > 0 ? `-${body}` : body;
}

/** 300 → "5:00" */
export function formatLength(seconds: number): string {
  return formatCountdown(seconds * 1000);
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

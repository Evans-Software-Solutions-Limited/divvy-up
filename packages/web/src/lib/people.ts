const PALETTE = [
  "var(--p1)",
  "var(--p2)",
  "var(--p3)",
  "var(--p4)",
  "var(--p5)",
  "var(--p6)",
  "var(--p7)",
  "var(--p8)",
] as const;

export function memberColor(index: number) {
  return PALETTE[index % PALETTE.length];
}

export function memberInitials(name: string) {
  return name
    .split(" ")
    .filter((w) => w.length > 0)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function fmt(pence: number, opts?: { sign?: boolean }) {
  const v = Math.abs(pence) / 100;
  const s =
    "£" +
    v.toLocaleString("en-GB", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  if (opts?.sign) {
    return (pence < 0 ? "−" : pence > 0 ? "+" : "") + s;
  }
  return s;
}

export function splitPence(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floor = raw.map(Math.floor);
  const rem = total - floor.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => [r - floor[i], i] as [number, number])
    .sort((a, b) => b[0] - a[0]);
  const out = floor.slice();
  for (let k = 0; k < rem; k++) out[order[k % order.length][1]]++;
  return out;
}

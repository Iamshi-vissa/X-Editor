// A small, fast fuzzy matcher: consecutive runs, word starts and path-segment starts
// score higher, and matches inside the file name beat matches in the folder path.
export interface FuzzyResult<T> { item: T; score: number; positions: number[] }

export function fuzzyScore(query: string, target: string): { score: number; positions: number[] } | null {
  if (!query) return { score: 0, positions: [] };
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  const positions: number[] = [];
  let score = 0;
  let ti = 0;
  let prev = -2;
  const nameStart = Math.max(target.lastIndexOf("/"), target.lastIndexOf("\\")) + 1;
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi];
    if (c === " ") continue;
    let found = -1;
    for (let i = ti; i < t.length; i++) {
      if (t[i] === c) { found = i; break; }
    }
    if (found < 0) return null;
    let s = 1;
    if (found === prev + 1) s += 6;
    const before = target[found - 1];
    if (found === 0 || before === "/" || before === "\\" || before === "_" || before === "-" || before === "." || before === " ") s += 8;
    else if (target[found] !== t[found] && before && before === before.toLowerCase()) s += 6; // camelCase hump
    if (found >= nameStart) s += 4;
    score += s;
    positions.push(found);
    prev = found;
    ti = found + 1;
  }
  score -= target.length * 0.05;
  return { score, positions };
}

export function fuzzyFilter<T>(query: string, items: T[], key: (t: T) => string, limit = 200): FuzzyResult<T>[] {
  const out: FuzzyResult<T>[] = [];
  for (const item of items) {
    const r = fuzzyScore(query.trim(), key(item));
    if (r) out.push({ item, score: r.score, positions: r.positions });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

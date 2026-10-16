// Picks one question per tile: random within its category × level pool,
// no shared ayahs on one board, and questions this device has already shown
// are skipped until the pool runs out.
import { type Category, type Question, touchedAyahs } from './data.ts';

const SEEN_KEY = 'sjq:seen';

function loadSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

export function markSeen(id: string) {
  const seen = loadSeen();
  seen.add(id);
  localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
}

export function pools(questions: Question[], cats: Category[], levels: number[]): Question[][][] {
  return cats.map(c => levels.map(l => questions.filter(q => q.cat === c && q.level === l)));
}

export function pickBoard(pool: Question[][][]): Question[][] {
  const seen = loadSeen();
  const touched = new Set<string>();
  const board: Question[][] = pool.map(row => row.map(() => undefined as unknown as Question));

  // Fill the scarcest pools first, so they aren't blocked by ayahs taken elsewhere.
  const cells = pool.flatMap((row, c) => row.map((p, l) => ({ c, l, size: p.length }))).sort((x, y) => x.size - y.size);
  for (const { c, l } of cells) {
    const free = (q: Question) => touchedAyahs(q).every(k => !touched.has(k));
    let candidates = pool[c][l].filter(q => !seen.has(q.id) && free(q));
    if (!candidates.length) {
      // Everything here has been shown on this device: start the pool over.
      for (const q of pool[c][l]) seen.delete(q.id);
      localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
      candidates = pool[c][l].filter(free);
    }
    if (!candidates.length) {
      // Nearest level of the same category as a last resort.
      for (const d of [1, -1, 2, -2, 3, -3, 4, -4]) {
        candidates = (pool[c][l + d] ?? []).filter(free);
        if (candidates.length) break;
      }
    }
    const q = candidates[Math.floor(Math.random() * candidates.length)];
    board[c][l] = q;
    for (const k of touchedAyahs(q)) touched.add(k);
  }
  return board;
}

// أكمل الآية: every phrase that starts an ayah (or follows a stop) and is shared
// with another place. The prompt is the shared part; options are what follows it
// in each place, up to the next allowed stop.
import { type Ayah, type Corpus, segmentEnd, anchors } from '../lib/corpus.ts';
import { ambiguousInSurah, type Index } from '../lib/index.ts';
import { MAX_DISTRACTORS, MAX_OPTION_WORDS, MAX_PROMPT_WORDS, type Question, similarity } from '../lib/question.ts';

// Grouping key length. Prompts need MIN_PROMPT words; 2-word prompts only open
// tier-1 ayahs (e.g. ٱلْحَمْدُ لِلَّهِ in الفاتحة). Prompts that need the ayah number
// must give more away, or the question is just memorizing numbers.
const MIN_PROMPT_WORDS = 2, MIN_PROMPT = 3, MIN_PROMPT_WITH_AYAH = 4;

interface Anchor { ayah: Ayah; w: number }

function lcp(x: Anchor, y: Anchor): number {
  let n = 0;
  while (x.w + n < x.ayah.norm.length && y.w + n < y.ayah.norm.length && x.ayah.norm[x.w + n] === y.ayah.norm[y.w + n]) n++;
  return n;
}

export function generateComplete(corpus: Corpus, index: Index, excluded: (s: number, a: number) => boolean, drop: (reason: string) => void): Question[] {
  const groups = new Map<string, Anchor[]>();
  for (const ayah of corpus.ayahs) {
    for (const w of anchors(ayah)) {
      if (w + MIN_PROMPT_WORDS >= ayah.norm.length) continue;
      const key = ayah.norm.slice(w, w + MIN_PROMPT_WORDS).join(' ');
      let g = groups.get(key);
      if (!g) groups.set(key, g = []);
      g.push({ ayah, w });
    }
  }

  const out = new Map<string, Question>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const x of group) {
      if (excluded(x.ayah.s, x.ayah.a)) { drop('excluded topic'); continue; }
      const depths = new Map<number, Anchor[]>();
      for (const y of group) {
        if (y === x) continue;
        const d = lcp(x, y);
        for (let k = MIN_PROMPT_WORDS; k <= d; k++) {
          if (!depths.has(k)) depths.set(k, []);
          depths.get(k)!.push(y);
        }
      }
      for (const [d, peers] of depths) {
        // Only ask at depths where some peer actually branches off.
        if (!peers.some(y => lcp(x, y) === d)) continue;
        const q = build(corpus, index, excluded, x, d, peers, drop);
        if (!q) continue;
        const key = `${q.s}|${q.needsAyah ? q.a : ''}|${corpus.norm(q.prompt)}|${corpus.norm(q.options.find(o => o.correct)!.ref!)}`;
        if (!out.has(key)) out.set(key, q);
      }
    }
  }
  return [...out.values()];
}

function build(corpus: Corpus, index: Index, excluded: (s: number, a: number) => boolean, x: Anchor, d: number, peers: Anchor[], drop: (r: string) => void): Question | null {
  const ax = x.ayah;
  if (d > MAX_PROMPT_WORDS) return drop('prompt too long'), null;
  if (d < MIN_PROMPT && !(x.w === 0 && corpus.tier(ax.s, ax.a) === 1)) return drop('prompt too generic'), null;
  const start = x.w + d;
  if (start >= ax.words.length) return null; // nothing left to complete
  const end = segmentEnd(ax, start);
  if (end - start > MAX_OPTION_WORDS) return drop('answer too long'), null;

  const correct = ax.norm.slice(start, end);
  const rest = ax.norm.slice(start).join(' ');
  const prompt = ax.norm.slice(x.w, start);

  const candidates = new Map<string, { y: Anchor; end: number; sim: number }>();
  for (const y of peers) {
    const ay = y.ayah;
    const ys = y.w + d;
    if (ys >= ay.words.length) continue;
    const ye = segmentEnd(ay, ys);
    if (ye - ys > MAX_OPTION_WORDS) continue;
    const words = ay.norm.slice(ys, ye);
    const key = words.join(' ');
    if (key === correct.join(' ')) continue;
    // A fragment that the true ayah also continues with would be a second correct answer.
    if ((rest + ' ').startsWith(key + ' ')) continue;
    if (excluded(ay.s, ay.a)) continue;
    const prev = candidates.get(key);
    const sim = similarity(correct, words);
    if (!prev || corpus.tier(ay.s, ay.a) < corpus.tier(prev.y.ayah.s, prev.y.ayah.a)) candidates.set(key, { y, end: ye, sim });
  }
  if (!candidates.size) return drop('no valid distractor'), null;

  const needsAyah = ambiguousInSurah(index, ax.s, prompt, correct, { ayah: ax, w: x.w });
  if (needsAyah && d < MIN_PROMPT_WITH_AYAH) return drop('prompt too generic'), null;
  if (needsAyah) {
    // Same prompt in the same ayah with a different continuation can't be disambiguated.
    const twins = index.occurrences(prompt).filter(p => p.ayah === ax && p.w !== x.w);
    if (twins.some(p => ax.norm.slice(p.w + d, p.w + d + correct.length).join(' ') !== correct.join(' '))) return drop('ambiguous within ayah'), null;
  }

  const picked = [...candidates.values()].sort((p, q) => q.sim - p.sim).slice(0, MAX_DISTRACTORS);
  return {
    cat: 'complete',
    s: ax.s,
    a: ax.a,
    prompt: { s: ax.s, a: ax.a, w0: x.w, w1: start },
    lead: x.w > 0,
    needsAyah,
    options: [
      { ref: { s: ax.s, a: ax.a, w0: start, w1: end }, correct: true },
      ...picked.map(c => ({ ref: { s: c.y.ayah.s, a: c.y.ayah.a, w0: c.y.w + d, w1: c.end }, correct: false })),
    ],
    tier: corpus.tier(ax.s, ax.a),
    sim: picked[0].sim,
    promptLen: d,
  };
}

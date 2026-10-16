// ما بعدها؟: show an ayah, pick how the next one opens. Wrong options are the
// openings that follow similar ayahs elsewhere, plus nearby ayahs in the same surah.
import { type Ayah, type Corpus, anchors, segmentEnd } from '../lib/corpus.ts';
import type { Index } from '../lib/index.ts';
import { MAX_DISTRACTORS, MAX_OPTION_WORDS, MAX_PROMPT_WORDS, type Question, similarity } from '../lib/question.ts';

const MIN_PROMPT = 3;

export function generateNext(corpus: Corpus, index: Index, excluded: (s: number, a: number) => boolean, drop: (reason: string) => void): Question[] {
  const out: Question[] = [];
  const opening = (ayah: Ayah) => {
    const end = segmentEnd(ayah, 0);
    return end <= MAX_OPTION_WORDS ? end : 0;
  };

  for (const ax of corpus.ayahs) {
    const next = corpus.get(ax.s, ax.a + 1);
    if (!next) continue;
    if (excluded(ax.s, ax.a) || excluded(next.s, next.a)) { drop('excluded topic'); continue; }
    const len = ax.words.length;
    const starts = anchors(ax).filter(w => len - w >= MIN_PROMPT && len - w <= MAX_PROMPT_WORDS);
    const w0 = len <= MAX_PROMPT_WORDS ? 0 : starts.length ? starts[0] : -1;
    if (w0 < 0) { drop('prompt too long'); continue; }
    const end = opening(next);
    if (!end) { drop('answer too long'); continue; }

    const correct = next.norm.slice(0, end);
    const correctKey = correct.join(' ');
    const nextFull = next.norm.join(' ') + ' ';

    const sources: Ayah[] = [];
    for (const { ayah } of index.similarAyahs(ax)) {
      const after = corpus.get(ayah.s, ayah.a + 1);
      if (after) sources.push(after);
    }
    for (const d of [2, 3, -1, 4]) {
      const near = corpus.get(ax.s, ax.a + d);
      if (near) sources.push(near);
    }

    const candidates = new Map<string, { ayah: Ayah; end: number; sim: number }>();
    for (const b of sources) {
      if (b === next || excluded(b.s, b.a)) continue;
      const be = opening(b);
      if (!be) continue;
      const words = b.norm.slice(0, be);
      const key = words.join(' ');
      if (key === correctKey || nextFull.startsWith(key + ' ') || candidates.has(key)) continue;
      candidates.set(key, { ayah: b, end: be, sim: similarity(correct, words) });
    }
    if (!candidates.size) { drop('no valid distractor'); continue; }
    const picked = [...candidates.values()].sort((p, q) => q.sim - p.sim).slice(0, MAX_DISTRACTORS);

    // The prompt must lead to this opening wherever it appears in the surah; otherwise show the ayah number.
    const prompt = ax.norm.slice(w0);
    const needsAyah = index.occurrences(prompt).some(p =>
      p.ayah.s === ax.s && p.ayah !== ax && p.w + prompt.length === p.ayah.norm.length &&
      (corpus.get(p.ayah.s, p.ayah.a + 1)?.norm.slice(0, end).join(' ') ?? '') !== correctKey,
    );

    out.push({
      cat: 'next',
      s: ax.s,
      a: ax.a,
      prompt: { s: ax.s, a: ax.a, w0, w1: len },
      lead: w0 > 0,
      needsAyah,
      options: [{ ref: { s: next.s, a: next.a, w0: 0, w1: end }, correct: true }, ...picked.map(c => ({ ref: { s: c.ayah.s, a: c.ayah.a, w0: 0, w1: c.end }, correct: false }))],
      tier: corpus.tier(ax.s, ax.a),
      sim: picked[0].sim,
      promptLen: len - w0,
    });
  }
  return out;
}

// من أي سورة؟: ayahs whose wording occurs in exactly one surah. Wrong options are
// surahs holding the most similar ayahs, then surahs sharing the closing formula,
// then neighbouring surahs.
import type { Corpus } from '../lib/corpus.ts';
import type { Index } from '../lib/index.ts';
import { MAX_DISTRACTORS, type Question } from '../lib/question.ts';

const MIN_WORDS = 3, MAX_WORDS = 20;

export function generateSurah(corpus: Corpus, index: Index, excluded: (s: number, a: number) => boolean, drop: (reason: string) => void): Question[] {
  const endingSurahs = new Map<string, Set<number>>();
  for (const ayah of corpus.ayahs) {
    const key = ayah.norm.slice(-2).join(' ');
    if (!endingSurahs.has(key)) endingSurahs.set(key, new Set());
    endingSurahs.get(key)!.add(ayah.s);
  }

  const out: Question[] = [];
  for (const ax of corpus.ayahs) {
    const len = ax.norm.length;
    if (len < MIN_WORDS || len > MAX_WORDS) continue;
    if (excluded(ax.s, ax.a)) { drop('excluded topic'); continue; }
    if (index.occurrences(ax.norm).some(p => p.ayah.s !== ax.s)) { drop('wording in several surahs'); continue; }

    const similar = index.similarAyahs(ax).filter(x => x.ayah.s !== ax.s);
    const picks: number[] = [];
    const add = (s: number) => {
      if (s >= 1 && s <= 114 && s !== ax.s && !picks.includes(s) && picks.length < MAX_DISTRACTORS) picks.push(s);
    };
    for (const x of similar) add(x.ayah.s);
    for (const s of [...(endingSurahs.get(ax.norm.slice(-2).join(' ')) ?? [])].sort((p, q) => Math.abs(p - ax.s) - Math.abs(q - ax.s))) add(s);
    for (const d of [1, -1, 2, -2, 3, -3]) add(ax.s + d);

    out.push({
      cat: 'surah',
      s: ax.s,
      a: ax.a,
      prompt: { s: ax.s, a: ax.a, w0: 0, w1: ax.words.length },
      lead: false,
      needsAyah: false,
      options: [{ surah: ax.s, correct: true }, ...picks.map(s => ({ surah: s, correct: false }))],
      tier: corpus.tier(ax.s, ax.a),
      sim: similar[0]?.sim ?? 0,
      promptLen: len,
    });
  }
  return out;
}

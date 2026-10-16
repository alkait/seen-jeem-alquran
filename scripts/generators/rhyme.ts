// خاتمة الآية, rhyme version for well-known short surahs: pick the ayah's last word
// (its فاصلة). Short ayahs get the previous ayah as context. Wrong options are the
// last words of other ayahs in the same surah, then rhyming endings from other
// well-known surahs.
import type { Ayah, Corpus } from '../lib/corpus.ts';
import type { Index } from '../lib/index.ts';
import { MAX_DISTRACTORS, MAX_PROMPT_WORDS, type Question } from '../lib/question.ts';

const MAX_TIER = 3, MIN_CONTEXT = 3, SAME_SURAH_PICKS = 2;

// Rhyme form: drop the alef of tanween fath (يُسْرًا → يسر) so endings compare by sound.
const rhymeForm = (w: string) => w.replace(/ا$/, '');

// Options that differ only by a leading و/ف (وَٱلنَّاسِ / ٱلنَّاسِ) read as a spelling test, not a متشابه.
const stem = (w: string) => w.replace(/^[وف]/, '');

function suffixSim(a: string, b: string): number {
  const x = rhymeForm(a), y = rhymeForm(b);
  let n = 0;
  while (n < x.length && n < y.length && x[x.length - 1 - n] === y[y.length - 1 - n]) n++;
  return n / Math.max(x.length, y.length);
}

export function generateRhyme(corpus: Corpus, index: Index, excluded: (s: number, a: number) => boolean, covered: Set<string>, drop: (reason: string) => void): Question[] {
  const last = (b: Ayah) => b.norm[b.norm.length - 1];
  const pool = corpus.ayahs.filter(b => corpus.tier(b.s, b.a) <= 2 && !excluded(b.s, b.a));

  const out: Question[] = [];
  for (const ax of corpus.ayahs) {
    if (corpus.tier(ax.s, ax.a) > MAX_TIER || covered.has(`${ax.s}:${ax.a}`)) continue;
    if (excluded(ax.s, ax.a)) { drop('excluded topic'); continue; }
    const len = ax.words.length;
    if (len < 2) continue; // one-word ayahs (وَٱلْعَصْرِ) have nothing left to show
    let before: Ayah | undefined;
    if (len - 1 < MIN_CONTEXT) {
      const prev = corpus.get(ax.s, ax.a - 1);
      if (!prev || excluded(prev.s, prev.a) || prev.words.length + len - 1 > MAX_PROMPT_WORDS) { drop('no context ayah'); continue; }
      before = prev;
    }
    if (len - 1 > MAX_PROMPT_WORDS) { drop('prompt too long'); continue; }

    const prompt = ax.norm.slice(0, len - 1);
    const correct = last(ax);
    // A word the prompt really leads into somewhere would be a second correct answer.
    const leadsInto = new Set(index.occurrences(prompt).filter(p => p.w + prompt.length < p.ayah.norm.length).map(p => p.ayah.norm[p.w + prompt.length]));
    const ok = (b: Ayah) => {
      const w = last(b);
      return stem(w) !== stem(correct) && !leadsInto.has(w) && !excluded(b.s, b.a);
    };

    const picked = new Map<string, { b: Ayah; sim: number }>();
    const add = (cands: Ayah[], limit: number) => {
      const ranked = cands.filter(ok).map(b => ({ b, sim: suffixSim(correct, last(b)) })).sort((p, q) => q.sim - p.sim);
      for (const c of ranked) {
        if (picked.size >= limit) break;
        if (!picked.has(stem(last(c.b)))) picked.set(stem(last(c.b)), c);
      }
    };
    add(corpus.ayahs.filter(b => b.s === ax.s && b !== ax), SAME_SURAH_PICKS);
    const rhyme = rhymeForm(correct).slice(-1);
    add(pool.filter(b => b.s !== ax.s && rhymeForm(last(b)).endsWith(rhyme)), MAX_DISTRACTORS);
    if (!picked.size) { drop('no valid distractor'); continue; }

    // Same prompt elsewhere in the surah with another ending (and the same context, if shown) needs the ayah number.
    const needsAyah = index.occurrences(prompt).some(p => {
      if (p.ayah.s !== ax.s || p.ayah === ax || p.w !== 0) return false;
      if (p.ayah.norm[prompt.length] === correct) return false;
      return !before || corpus.get(p.ayah.s, p.ayah.a - 1)?.norm.join(' ') === before.norm.join(' ');
    });

    const options = [...picked.values()];
    out.push({
      cat: 'ending',
      variant: 'rhyme',
      s: ax.s,
      a: ax.a,
      prompt: { s: ax.s, a: ax.a, w0: 0, w1: len - 1 },
      before: before && { s: before.s, a: before.a, w0: 0, w1: before.words.length },
      lead: false,
      needsAyah,
      options: [
        { ref: { s: ax.s, a: ax.a, w0: len - 1, w1: len }, correct: true },
        ...options.map(({ b }) => ({ ref: { s: b.s, a: b.a, w0: b.words.length - 1, w1: b.words.length }, correct: false })),
      ],
      tier: corpus.tier(ax.s, ax.a),
      // Rhymes are a gentler confusion than near-identical formulas.
      sim: 0.5 * Math.max(...options.map(o => o.sim)),
      promptLen: len - 1 + (before?.words.length ?? 0),
    });
  }
  return out;
}

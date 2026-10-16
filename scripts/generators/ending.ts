// خاتمة الآية: ayahs whose closing words are a recurring formula (غفور رحيم، العلي العظيم…).
// The prompt is the end of the ayah up to the formula; wrong options are other
// recurring formulas, ranked by how similar they are to the true one.
import { type Ayah, type Corpus, anchors } from '../lib/corpus.ts';
import { ambiguousInSurah, type Index } from '../lib/index.ts';
import { MAX_DISTRACTORS, MAX_PROMPT_WORDS, type Question, similarity } from '../lib/question.ts';

// MIN_SIM keeps out options that share only a particle (من، في) with the true ending.
const MIN_ENDING = 2, MAX_ENDING = 3, MIN_PROMPT = 3, MIN_FORMULA_USES = 2, MIN_SIM = 0.35;

export function generateEnding(corpus: Corpus, index: Index, excluded: (s: number, a: number) => boolean, drop: (reason: string) => void): Question[] {
  // Formula (normalized closing words) -> ayahs that close with it.
  const formulas = new Map<string, Ayah[]>();
  for (const ayah of corpus.ayahs) {
    for (let n = MIN_ENDING; n <= MAX_ENDING && n < ayah.norm.length; n++) {
      const key = ayah.norm.slice(-n).join(' ');
      let list = formulas.get(key);
      if (!list) formulas.set(key, list = []);
      list.push(ayah);
    }
  }
  const recurring = [...formulas.entries()].filter(([, l]) => l.length >= MIN_FORMULA_USES);
  const byWord = new Map<string, string[]>();
  for (const [f] of recurring) for (const w of new Set(f.split(' '))) {
    if (!byWord.has(w)) byWord.set(w, []);
    byWord.get(w)!.push(f);
  }

  const out: Question[] = [];
  for (const ax of corpus.ayahs) {
    if (excluded(ax.s, ax.a)) { drop('excluded topic'); continue; }
    const len = ax.norm.length;
    let n = 0;
    for (let k = MAX_ENDING; k >= MIN_ENDING; k--) {
      if (len - k >= MIN_PROMPT && (formulas.get(ax.norm.slice(-k).join(' '))?.length ?? 0) >= MIN_FORMULA_USES) { n = k; break; }
    }
    if (!n) continue; // closing words aren't a recurring formula
    const cut = len - n;
    const starts = anchors(ax).filter(w => cut - w >= MIN_PROMPT);
    const w0 = starts.length ? starts[starts.length - 1] : -1;
    if (w0 < 0) continue;
    if (cut - w0 > MAX_PROMPT_WORDS) { drop('prompt too long'); continue; }

    const correct = ax.norm.slice(cut);
    const correctKey = correct.join(' ');
    const full = ' ' + ax.norm.join(' ');
    const prompt = ax.norm.slice(w0, cut);

    const pool = new Set<string>();
    for (const w of new Set(correct)) for (const f of byWord.get(w) ?? []) pool.add(f);
    const ranked = [...pool]
      .filter(f => f !== correctKey && !full.endsWith(' ' + f))
      // Same word count as the true ending reads as a fair alternative.
      .map(f => ({ f, raw: similarity(correct, f.split(' ')) }))
      .filter(x => x.raw >= MIN_SIM)
      .map(({ f, raw }) => ({ f, sim: raw + (f.split(' ').length === correct.length ? 0.15 : 0) }))
      .sort((p, q) => q.sim - p.sim);

    const picked: { ref: { s: number; a: number; w0: number; w1: number }; sim: number }[] = [];
    const pickedKeys: string[] = [];
    for (const { f, sim } of ranked) {
      if (picked.length === MAX_DISTRACTORS) break;
      const words = f.split(' ');
      // Skip formulas nested in one already picked (يؤمنون إلا قليلا / فلا يؤمنون إلا قليلا).
      if (pickedKeys.some(k => (' ' + k).endsWith(' ' + f) || (' ' + f).endsWith(' ' + k))) continue;
      // Show it from the best-known ayah that closes with it; skip if the prompt also leads into it somewhere.
      const sources = formulas.get(f)!.filter(b => !excluded(b.s, b.a)).sort((p, q) => corpus.tier(p.s, p.a) - corpus.tier(q.s, q.a));
      if (!sources.length) continue;
      if (formulas.get(f)!.some(b => (' ' + b.norm.slice(0, -words.length).join(' ')).endsWith(' ' + prompt.join(' ')))) continue;
      const b = sources[0];
      picked.push({ ref: { s: b.s, a: b.a, w0: b.words.length - words.length, w1: b.words.length }, sim: Math.min(1, sim) });
      pickedKeys.push(f);
    }
    if (!picked.length) { drop('no valid distractor'); continue; }

    out.push({
      cat: 'ending',
      s: ax.s,
      a: ax.a,
      prompt: { s: ax.s, a: ax.a, w0, w1: cut },
      lead: w0 > 0,
      needsAyah: ambiguousInSurah(index, ax.s, prompt, correct, { ayah: ax, w: w0 }),
      options: [{ ref: { s: ax.s, a: ax.a, w0: cut, w1: len }, correct: true }, ...picked.map(p => ({ ref: p.ref, correct: false }))],
      tier: corpus.tier(ax.s, ax.a),
      sim: picked[0].sim,
      promptLen: cut - w0,
    });
  }
  return out;
}

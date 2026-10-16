// Lookup structures shared by the generators.
import type { Ayah, Corpus } from './corpus.ts';
import { similarity } from './question.ts';

export interface Position { ayah: Ayah; w: number }

export class Index {
  // Normalized word trigram -> every position where it starts.
  private trigrams = new Map<string, Position[]>();
  // Ayah key -> most similar other ayahs.
  private similar = new Map<string, { ayah: Ayah; sim: number }[]>();

  constructor(private corpus: Corpus) {
    for (const ayah of corpus.ayahs) {
      for (let w = 0; w + 3 <= ayah.norm.length; w++) {
        const key = ayah.norm.slice(w, w + 3).join(' ');
        let list = this.trigrams.get(key);
        if (!list) this.trigrams.set(key, list = []);
        list.push({ ayah, w });
      }
    }
  }

  // Every position where `words` occurs (within one ayah).
  occurrences(words: string[]): Position[] {
    if (words.length < 3) return this.scan(words);
    const out: Position[] = [];
    for (const p of this.trigrams.get(words.slice(0, 3).join(' ')) ?? []) {
      if (p.w + words.length > p.ayah.norm.length) continue;
      let ok = true;
      for (let i = 3; i < words.length && ok; i++) ok = p.ayah.norm[p.w + i] === words[i];
      if (ok) out.push(p);
    }
    return out;
  }

  private scanCache = new Map<string, Position[]>();

  private scan(words: string[]): Position[] {
    const key = words.join(' ');
    const cached = this.scanCache.get(key);
    if (cached) return cached;
    const out: Position[] = [];
    this.scanCache.set(key, out);
    for (const ayah of this.corpus.ayahs) {
      for (let w = 0; w + words.length <= ayah.norm.length; w++) {
        if (words.every((x, i) => ayah.norm[w + i] === x)) out.push({ ayah, w });
      }
    }
    return out;
  }

  // Ayahs sharing at least one trigram with `ayah`, ranked by whole-ayah similarity.
  similarAyahs(ayah: Ayah, minSim = 0.4, limit = 12): { ayah: Ayah; sim: number }[] {
    const key = `${ayah.s}:${ayah.a}`;
    const cached = this.similar.get(key);
    if (cached) return cached;
    const seen = new Set<Ayah>();
    for (let w = 0; w + 3 <= ayah.norm.length; w++) {
      for (const p of this.trigrams.get(ayah.norm.slice(w, w + 3).join(' ')) ?? []) {
        if (p.ayah !== ayah) seen.add(p.ayah);
      }
    }
    const ranked = [...seen]
      .map(other => ({ ayah: other, sim: similarity(ayah.norm, other.norm) }))
      .filter(x => x.sim >= minSim)
      .sort((x, y) => y.sim - x.sim)
      .slice(0, limit);
    this.similar.set(key, ranked);
    return ranked;
  }
}

// True if `words` occurs in surah `s` at a position other than `except`
// and is followed by something that doesn't start with `continuation`.
export function ambiguousInSurah(index: Index, s: number, words: string[], continuation: string[], except: Position): boolean {
  for (const p of index.occurrences(words)) {
    if (p.ayah.s !== s || (p.ayah === except.ayah && p.w === except.w)) continue;
    const after = p.ayah.norm.slice(p.w + words.length, p.w + words.length + continuation.length);
    if (after.join(' ') !== continuation.join(' ')) return true;
  }
  return false;
}

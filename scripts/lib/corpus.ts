import { readFileSync } from 'node:fs';
import { CUT_MARKS, PAUSE_MARKS, RUB_EL_HIZB, normalize } from './text.ts';

export interface Ayah {
  s: number;
  a: number;
  words: string[];   // verbatim tokens, pause marks removed
  marks: string[][]; // pause marks that follow each word
  norm: string[];    // normalized words, for matching only
  rub: boolean;      // ayah opens with ۞
}

export interface Surah {
  n: number;
  name: string;
  altNames: string[];
  ayahs: number;
  tier: number;
}

// Word range inside one ayah: [w0, w1), 0-based.
export interface Ref {
  s: number;
  a: number;
  w0: number;
  w1: number;
}

export const SOURCE_PATH = 'data/source/quran-uthmani.txt';

export function parseSource(path = SOURCE_PATH) {
  const ayahs: Ayah[] = [];
  // Ayah key -> exact basmala prefix split off from it (kept for the round-trip check).
  const basmalaStripped = new Map<string, string>();
  let basmalaNorm = '';
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const [sRaw, aRaw, ...rest] = line.split('|');
    const s = Number(sRaw), a = Number(aRaw);
    let text = rest.join('|');
    // Taken from 1:1 rather than typed by hand.
    if (s === 1 && a === 1) basmalaNorm = text.split(' ').map(normalize).join(' ');
    // Tanzil prefixes the basmala to ayah 1 of every surah except 1 and 9; it is not part of that ayah.
    // Matched on normalized form: in 95 and 97 it is written بِّسْمِ (with shadda).
    if (a === 1 && s !== 1 && s !== 9) {
      const toks = text.split(' ');
      if (toks.slice(0, 4).map(normalize).join(' ') === basmalaNorm) {
        basmalaStripped.set(`${s}:${a}`, toks.slice(0, 4).join(' '));
        text = toks.slice(4).join(' ');
      }
    }
    const ayah: Ayah = { s, a, words: [], marks: [], norm: [], rub: false };
    for (const tok of text.split(' ')) {
      if (!tok) continue;
      if (tok === RUB_EL_HIZB) {
        if (ayah.words.length) throw new Error(`۞ mid-ayah at ${s}:${a}`);
        ayah.rub = true;
      } else if (PAUSE_MARKS.has(tok)) {
        if (!ayah.words.length) throw new Error(`mark before first word at ${s}:${a}`);
        ayah.marks[ayah.words.length - 1].push(tok);
      } else {
        ayah.words.push(tok);
        ayah.marks.push([]);
        ayah.norm.push(normalize(tok));
      }
    }
    ayahs.push(ayah);
  }
  return { ayahs, basmalaStripped };
}

// Rebuild verbatim text for a word range. Marks after the last word are kept
// only when `trailingMarks` is set (e.g. when rendering a whole ayah).
export function render(ayah: Ayah, w0 = 0, w1 = ayah.words.length, trailingMarks = false): string {
  const parts: string[] = [];
  if (w0 === 0 && ayah.rub && w1 === ayah.words.length && trailingMarks) parts.push(RUB_EL_HIZB);
  for (let i = w0; i < w1; i++) {
    parts.push(ayah.words[i]);
    if (i < w1 - 1 || trailingMarks) parts.push(...ayah.marks[i]);
  }
  return parts.join(' ');
}

// A fragment may end after word i if a cut mark follows it or it is the last word.
export function canEndAfter(ayah: Ayah, i: number): boolean {
  return i === ayah.words.length - 1 || ayah.marks[i].some(m => CUT_MARKS.has(m));
}

// Word indices where a fragment may start: ayah start, or right after a cut mark.
export function anchors(ayah: Ayah): number[] {
  const out = [0];
  for (let i = 0; i < ayah.words.length - 1; i++) if (canEndAfter(ayah, i)) out.push(i + 1);
  return out;
}

// End (exclusive) of the fragment starting at w: up to the next allowed stop.
export function segmentEnd(ayah: Ayah, w: number): number {
  for (let i = w; i < ayah.words.length; i++) if (canEndAfter(ayah, i)) return i + 1;
  return ayah.words.length;
}

export class Corpus {
  ayahs: Ayah[];
  surahs: Surah[];
  private byKey = new Map<string, Ayah>();
  private famous = new Set<string>();

  constructor(ayahs: Ayah[], surahs: Surah[], famousAyahs: string[]) {
    this.ayahs = ayahs;
    this.surahs = surahs;
    for (const a of ayahs) this.byKey.set(`${a.s}:${a.a}`, a);
    for (const spec of famousAyahs) {
      const [s, range] = spec.split(':');
      const [from, to = from] = range.split('-').map(Number);
      for (let a = from; a <= to; a++) this.famous.add(`${s}:${a}`);
    }
  }

  static load(): Corpus {
    const { ayahs } = parseSource();
    const surahs: Surah[] = JSON.parse(readFileSync('data/curated/surahs.json', 'utf8'));
    const famous = JSON.parse(readFileSync('data/curated/famous-ayahs.json', 'utf8')).ayahs;
    return new Corpus(ayahs, surahs, famous);
  }

  get(s: number, a: number): Ayah | undefined {
    return this.byKey.get(`${s}:${a}`);
  }

  surah(n: number): Surah {
    return this.surahs[n - 1];
  }

  tier(s: number, a: number): number {
    return this.famous.has(`${s}:${a}`) ? 1 : this.surah(s).tier;
  }

  text(ref: Ref, trailingMarks = false): string {
    return render(this.get(ref.s, ref.a)!, ref.w0, ref.w1, trailingMarks);
  }

  norm(ref: Ref): string {
    return this.get(ref.s, ref.a)!.norm.slice(ref.w0, ref.w1).join(' ');
  }
}

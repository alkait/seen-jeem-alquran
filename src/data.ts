// Loads the corpus and question bank. All Quran text shown in the app is rebuilt
// here from word addresses in the canonical corpus; questions never carry text.

export interface Ref { s: number; a: number; w0: number; w1: number } // [w0, w1), 0-based
export type Category = 'complete' | 'ending' | 'next' | 'surah';

export interface Option { ref?: Ref; surah?: number; correct: boolean }

export interface Question {
  id: string;
  cat: Category;
  level: number;
  s: number;
  a: number;
  prompt: Ref;
  before?: Ref;
  variant?: string;
  lead: boolean;
  needsAyah: boolean;
  options: Option[];
}

interface Ayah { s: number; a: number; words: string[]; marks: string[][] }
interface Surah { n: number; name: string }

// "6:32:5-6" (1-based, inclusive) -> Ref
function parseRef(r: string): Ref {
  const [s, a, range] = r.split(':');
  const [from, to] = range.split('-').map(Number);
  return { s: Number(s), a: Number(a), w0: from - 1, w1: to };
}

export class Data {
  private ayahs = new Map<string, Ayah>();

  constructor(ayahs: Ayah[], private surahs: Surah[], readonly questions: Question[]) {
    for (const a of ayahs) this.ayahs.set(`${a.s}:${a.a}`, a);
  }

  static async load(): Promise<Data> {
    const get = (f: string) => fetch(`${import.meta.env.BASE_URL}data/${f}`).then(r => {
      if (!r.ok) throw new Error(`${f}: ${r.status}`);
      return r.json();
    });
    const [corpus, bank, surahs] = await Promise.all([get('corpus.json'), get('questions.json'), get('surahs.json')]);
    const questions: Question[] = bank.questions.map((q: any) => ({
      ...q,
      prompt: parseRef(q.prompt),
      before: q.before ? parseRef(q.before) : undefined,
      lead: !!q.lead,
      needsAyah: !!q.needsAyah,
      options: q.options.map((o: any) => ({ ref: o.ref ? parseRef(o.ref) : undefined, surah: o.surah, correct: !!o.correct })),
    }));
    return new Data(corpus.ayahs, surahs, questions);
  }

  ayahLength(s: number, a: number): number {
    return this.ayahs.get(`${s}:${a}`)?.words.length ?? 0;
  }

  // Verbatim text for a word range. Pause marks inside the range are kept;
  // marks after the last word only when `trailingMarks` (whole ayahs).
  text(ref: Ref, trailingMarks = false): string {
    const ayah = this.ayahs.get(`${ref.s}:${ref.a}`);
    if (!ayah) throw new Error(`missing ayah ${ref.s}:${ref.a}`);
    const parts: string[] = [];
    for (let i = ref.w0; i < ref.w1; i++) {
      parts.push(ayah.words[i]);
      if (i < ref.w1 - 1 || trailingMarks) parts.push(...ayah.marks[i]);
    }
    return parts.join(' ');
  }

  ayahText(s: number, a: number): string {
    return this.text({ s, a, w0: 0, w1: this.ayahLength(s, a) }, true);
  }

  surahName(n: number): string {
    return this.surahs[n - 1].name;
  }
}

// Every ayah a question touches; two questions on one board must not share any,
// or answering one would give the other away.
export function touchedAyahs(q: Question): string[] {
  const keys = [`${q.s}:${q.a}`];
  if (q.before) keys.push(`${q.before.s}:${q.before.a}`);
  for (const o of q.options) if (o.ref) keys.push(`${o.ref.s}:${o.ref.a}`);
  return keys;
}

import type { Ref } from './corpus.ts';

export type Category = 'complete' | 'ending' | 'next' | 'surah';

export interface Option {
  ref?: Ref;      // text options: a verbatim fragment at this address
  surah?: number; // من أي سورة؟ options
  correct: boolean;
}

export interface Question {
  cat: Category;
  s: number;
  a: number;
  prompt: Ref;
  before?: Ref;       // previous whole ayah shown as context (short ayahs)
  variant?: string;   // sub-type within a category, for the report
  lead: boolean;      // prompt starts mid-ayah, shown with a leading …
  needsAyah: boolean; // the surah alone doesn't pin the answer, so the ayah number is shown
  options: Option[];
  tier: number;       // familiarity tier of the source ayah (1 = best known)
  sim: number;        // similarity of the closest wrong option (0–1)
  promptLen: number;
  score?: number;
  level?: number;
}

export const MAX_OPTION_WORDS = 10;
export const MAX_PROMPT_WORDS = 15;
export const MAX_DISTRACTORS = 3;

// Similarity of two normalized word sequences: half set overlap, half order (LCS).
export function similarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a), sb = new Set(b);
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  const jaccard = inter / (sa.size + sb.size - inter);
  const dp = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return 0.5 * jaccard + 0.5 * (dp[b.length] / Math.max(a.length, b.length));
}

export function refString(r: Ref): string {
  return `${r.s}:${r.a}:${r.w0 + 1}-${r.w1}`;
}

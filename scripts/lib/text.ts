// Character classes and normalization for the Tanzil Uthmani text.

// Pause marks that appear as standalone tokens after a word.
export const PAUSE_MARKS = new Set(['ۖ', 'ۗ', 'ۘ', 'ۙ', 'ۚ', 'ۛ', 'ۜ', '۩']);

// Marks where stopping is allowed, so a fragment may end there:
// ۖ (صلى), ۗ (قلى), ۚ (جائز), ۘ (لازم).
// Excluded on purpose: ۙ (لا — do not stop), ۛ (تعانق), ۜ (سكتة), ۩ (sajdah).
export const CUT_MARKS = new Set(['ۖ', 'ۗ', 'ۚ', 'ۘ']);

export const RUB_EL_HIZB = '۞';

// Matching-only form: no diacritics or Quranic marks, unified letter variants.
// Never shown to players.
export function normalize(word: string): string {
  return word
    .replace(/[ً-ٰٟۖ-ۭـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي');
}

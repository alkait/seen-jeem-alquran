// Runs every generator over the full corpus, applies exclusions, scores
// difficulty, assigns 100–500 levels and writes the question bank + a coverage report.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Corpus, SOURCE_PATH } from './lib/corpus.ts';
import { Index } from './lib/index.ts';
import { type Category, type Question, refString } from './lib/question.ts';
import { generateComplete } from './generators/complete.ts';
import { generateEnding } from './generators/ending.ts';
import { generateNext } from './generators/next.ts';
import { generateSurah } from './generators/surah.ts';
import { generateRhyme } from './generators/rhyme.ts';
import { normalize } from './lib/text.ts';

const LEVELS = [100, 200, 300, 400, 500];
const CATEGORY_NAMES: Record<Category, string> = {
  complete: 'أكمل الآية',
  ending: 'خاتمة الآية',
  next: 'ما بعدها؟',
  surah: 'من أي سورة؟',
};

const corpus = Corpus.load();
const index = new Index(corpus);

// ---------- exclusions ----------
const rules = JSON.parse(readFileSync('data/curated/exclusions.json', 'utf8'));
const matches = (ayahNorm: string, words: string[]) => words.some(k => ayahNorm.includes(normalize(k)));
const excludedSet = new Set<string>();
const reportOnly: Record<string, Set<string>> = {};
for (const ayah of corpus.ayahs) {
  const key = `${ayah.s}:${ayah.a}`;
  const text = ayah.norm.join(' ');
  if (rules.surahs.includes(ayah.s) || rules.ayahs.includes(key) || matches(text, rules.keywords)) excludedSet.add(key);
  for (const [group, words] of Object.entries<string[]>(rules.reportOnly ?? {})) {
    if (matches(text, words)) (reportOnly[group] ??= new Set()).add(key);
  }
}
const excluded = (s: number, a: number) => excludedSet.has(`${s}:${a}`);

// ---------- generate ----------
const drops: Record<string, Record<string, number>> = {};
const run = (cat: Category, fn: typeof generateComplete) => {
  const t = Date.now();
  const d: Record<string, number> = (drops[cat] ??= {});
  const qs = fn(corpus, index, excluded, r => { d[r] = (d[r] ?? 0) + 1; });
  console.log(`${cat}: ${qs.length} questions (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  return qs;
};
const endings = run('ending', generateEnding);
const rhymes = run('ending', (c, i, ex, d) => generateRhyme(c, i, ex, new Set(endings.map(q => `${q.s}:${q.a}`)), d));
const byCat: Record<Category, Question[]> = {
  complete: run('complete', generateComplete),
  ending: [...endings, ...rhymes],
  next: run('next', generateNext),
  surah: run('surah', generateSurah),
};

// ---------- difficulty ----------
// Familiarity dominates; then how close the wrong options are; then how little the prompt gives away.
for (const qs of Object.values(byCat)) {
  for (const q of qs) {
    const tierHard = (q.tier - 1) / 3;
    const shortHard = q.cat === 'surah' ? 0 : 1 - Math.min(q.promptLen, 8) / 8;
    q.score = 0.55 * tierHard + 0.3 * q.sim + 0.15 * shortHard + (q.needsAyah ? 0.1 : 0);
  }
}
// Fixed thresholds: tier 4 can't fall below 300 and tier 1 can't rise above 300,
// so a 100 tile never draws an obscure ayah.
const THRESHOLDS = [0.2, 0.4, 0.6, 0.75];
for (const q of Object.values(byCat).flat()) {
  const i = THRESHOLDS.findIndex(t => q.score! < t);
  q.level = LEVELS[i === -1 ? 4 : i];
}

// ---------- write ----------
// Stable across regenerations, so a device's "already seen" list stays valid.
const questionId = (q: Question) => `${q.cat}${q.variant ? `/${q.variant}` : ''}:${refString(q.prompt)}`;

const all = Object.values(byCat).flat();
const ids = new Set(all.map(questionId));
if (ids.size !== all.length) throw new Error(`question ids not unique: ${all.length - ids.size} duplicates`);
const sha256 = createHash('sha256').update(readFileSync(SOURCE_PATH)).digest('hex');
mkdirSync('data/build', { recursive: true });
writeFileSync('data/build/questions.json', JSON.stringify({
  source: { file: SOURCE_PATH, sha256 },
  questions: all.map(q => ({
    id: questionId(q),
    cat: q.cat,
    level: q.level,
    s: q.s,
    a: q.a,
    prompt: refString(q.prompt),
    before: q.before && refString(q.before),
    variant: q.variant,
    lead: q.lead || undefined,
    needsAyah: q.needsAyah || undefined,
    options: q.options.map(o => ({ ...(o.ref ? { ref: refString(o.ref) } : { surah: o.surah }), ...(o.correct ? { correct: true } : {}) })),
    tier: q.tier,
    score: Number(q.score!.toFixed(3)),
  })),
}));

// ---------- report ----------
const lines: string[] = [];
const pct = (n: number, d: number) => d ? `${Math.round((n / d) * 100)}%` : '—';
lines.push('# Content coverage report', '', `Source: \`${SOURCE_PATH}\` (sha256 \`${sha256.slice(0, 12)}…\`)`, '');
lines.push(`Total questions: **${all.length}**`, '');
lines.push('## Per category and level', '', '| Category | 100 | 200 | 300 | 400 | 500 | Total | Needs ayah # |', '|---|---|---|---|---|---|---|---|');
for (const [cat, qs] of Object.entries(byCat) as [Category, Question[]][]) {
  const per = LEVELS.map(l => qs.filter(q => q.level === l).length);
  lines.push(`| ${CATEGORY_NAMES[cat]} | ${per.join(' | ')} | ${qs.length} | ${pct(qs.filter(q => q.needsAyah).length, qs.length)} |`);
}
const rhymeQs = byCat.ending.filter(q => q.variant === 'rhyme');
lines.push('', `خاتمة الآية includes ${rhymeQs.length} rhyme questions (last word of short-surah ayahs): ${LEVELS.map(l => `${l}: ${rhymeQs.filter(q => q.level === l).length}`).join(', ')}.`);
lines.push('', '## Per familiarity tier', '', '| Category | Tier 1 | Tier 2 | Tier 3 | Tier 4 |', '|---|---|---|---|---|');
for (const [cat, qs] of Object.entries(byCat) as [Category, Question[]][]) {
  lines.push(`| ${CATEGORY_NAMES[cat]} | ${[1, 2, 3, 4].map(t => qs.filter(q => q.tier === t).length).join(' | ')} |`);
}
lines.push('', '## Tier mix inside each level (all categories)', '', '| Level | Tier 1 | Tier 2 | Tier 3 | Tier 4 |', '|---|---|---|---|---|');
for (const l of LEVELS) {
  const qs = all.filter(q => q.level === l);
  lines.push(`| ${l} | ${[1, 2, 3, 4].map(t => pct(qs.filter(q => q.tier === t).length, qs.length)).join(' | ')} |`);
}
lines.push('', '## Surah coverage', '');
const covered = new Set(all.map(q => q.s));
const missing = corpus.surahs.filter(s => !covered.has(s.n)).map(s => `${s.n} ${s.name}`);
lines.push(`Surahs with at least one question: ${covered.size}/114${missing.length ? ` (missing: ${missing.join('، ')})` : ''}`);
lines.push('', '## Dropped candidates', '', '| Category | Reason | Count |', '|---|---|---|');
for (const [cat, d] of Object.entries(drops)) for (const [r, n] of Object.entries(d)) lines.push(`| ${CATEGORY_NAMES[cat as Category]} | ${r} | ${n} |`);
lines.push('', '## Exclusions', '', `Ayahs excluded by rule: ${excludedSet.size}`, '');
for (const [group, keys] of Object.entries(reportOnly)) {
  const hit = all.filter(q => keys.has(`${q.s}:${q.a}`) || q.options.some(o => o.ref && keys.has(`${o.ref.s}:${o.ref.a}`))).length;
  lines.push(`Report-only group **${group}**: ${keys.size} ayahs; ${hit} questions (${pct(hit, all.length)}) touch them. Not excluded.`);
}
writeFileSync('data/build/report.md', lines.join('\n') + '\n');
console.log(`\n${all.length} questions → data/build/questions.json, report → data/build/report.md`);

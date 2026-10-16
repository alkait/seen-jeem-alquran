// Prints sample questions rendered from the canonical text, for eyeballing.
// Usage: npm run preview -- [category] [level] [count]
import { readFileSync } from 'node:fs';
import { Corpus } from './lib/corpus.ts';

const [cat, level, count = '3'] = process.argv.slice(2);
const corpus = Corpus.load();
const { questions } = JSON.parse(readFileSync('data/build/questions.json', 'utf8'));

const parse = (r: string) => {
  const [s, a, range] = r.split(':');
  const [from, to] = range.split('-').map(Number);
  return { s: Number(s), a: Number(a), w0: from - 1, w1: to };
};
const name = (s: number) => corpus.surah(s).name;

const pool = questions.filter((q: any) => (!cat || q.cat === cat) && (!level || q.level === Number(level)));
const seen = new Set<number>();
for (let i = 0; i < Math.min(Number(count), pool.length); i++) {
  let k: number;
  do k = Math.floor(Math.random() * pool.length); while (seen.has(k));
  seen.add(k);
  const q = pool[k];
  const where = `${name(q.s)}${q.needsAyah ? ` ${q.a}` : ''}`;
  console.log(`\n[${q.id}] ${q.cat}${q.variant ? `/${q.variant}` : ''} · ${q.level} · tier ${q.tier} · score ${q.score} · ${where}`);
  const before = q.before ? `${corpus.text(parse(q.before))} ۝ ` : '';
  console.log(`  ${q.lead ? '… ' : ''}${before}${corpus.text(parse(q.prompt))} ${q.cat === 'surah' ? '' : '____'}`);
  for (const o of q.options) {
    const label = o.ref ? `${corpus.text(parse(o.ref))}   (${name(parse(o.ref).s)} ${parse(o.ref).a})` : name(o.surah);
    console.log(`   ${o.correct ? '✔' : '·'} ${label}`);
  }
}

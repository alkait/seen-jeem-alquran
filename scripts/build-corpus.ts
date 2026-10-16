// Parses the Tanzil source into a word-indexed corpus and proves it is verbatim:
// every ayah must rebuild exactly from its stored words and marks.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { SOURCE_PATH, parseSource, render } from './lib/corpus.ts';

const raw = readFileSync(SOURCE_PATH, 'utf8');
const sha256 = createHash('sha256').update(raw).digest('hex');
const { ayahs, basmalaStripped } = parseSource();

const original = new Map<string, string>();
for (const line of raw.split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const [s, a, ...rest] = line.split('|');
  original.set(`${s}:${a}`, rest.join('|'));
}

let failures = 0;
for (const ayah of ayahs) {
  const key = `${ayah.s}:${ayah.a}`;
  const rebuilt = render(ayah, 0, ayah.words.length, true);
  const prefix = basmalaStripped.get(key);
  const expected = prefix ? `${prefix} ${rebuilt}` : rebuilt;
  if (expected !== original.get(key)) {
    failures++;
    console.error(`MISMATCH ${key}\n  source:  ${original.get(key)}\n  rebuilt: ${expected}`);
  }
}

const words = ayahs.reduce((n, a) => n + a.words.length, 0);
if (basmalaStripped.size !== 112) throw new Error(`expected basmala split from 112 ayahs, got ${basmalaStripped.size}`);
if (ayahs.length !== 6236) throw new Error(`expected 6236 ayahs, got ${ayahs.length}`);
if (failures) throw new Error(`${failures} ayahs failed the verbatim round-trip`);

mkdirSync('data/build', { recursive: true });
writeFileSync('data/build/corpus.json', JSON.stringify({
  source: { file: SOURCE_PATH, sha256, provider: 'Tanzil Project (tanzil.net)', text: 'Uthmani, Hafs' },
  ayahs: ayahs.map(({ s, a, words, marks, rub }) => ({ s, a, words, marks, rub })),
}));

console.log(`corpus OK: ${ayahs.length} ayahs, ${words} words, basmala split from ${basmalaStripped.size} ayahs`);
console.log(`source sha256: ${sha256}`);

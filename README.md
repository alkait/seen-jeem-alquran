# سين جيم القرآن

**أُنس ومُدارسة** — a Quran trivia party game for 1–4 players, built around المتشابهات.

## Concept

- Jeopardy-style board: 4 categories × 5 point values (100–500).
- Categories: أكمل الآية · الخاتمة · ما بعدها؟ · من أي سورة؟
- Players take turns picking a tile; a wrong answer lets the next player steal for half points.
- Lifeline per player: ٥٠:٥٠.

## Text accuracy rule

Every piece of Quran text shown is verbatim from a verified source (Tanzil / KFGQPC / quran.com).
Nothing is generated or altered: wrong options are real fragments from *other* ayahs, so the
question is always "which one belongs here?", never "is this real?".

## Content pipeline

```sh
npm install
npm run content                       # build corpus + generate questions + report
npm run preview -- complete 300 5     # print samples: [category] [level] [count]
```

1. **Corpus** (`scripts/build-corpus.ts`): parses the Tanzil text into words with `surah:ayah:word`
   addresses and fails unless every ayah rebuilds byte-for-byte from the stored words. The basmala
   prefixed to ayah 1 is split off (detected by normalized form; 95 and 97 write it as بِّسْمِ).
2. **Curated inputs** (`data/curated/`): surah familiarity tiers and alternate names, famous ayahs
   (tier 1 overrides), exclusion rules.
3. **Generators** (`scripts/generators/`), one per category, run over the whole Quran:
   - `complete` — phrases shared between places; options are what follows in each place.
   - `ending` — recurring closing formulas; options are similar formulas.
   - `rhyme` (also خاتمة الآية) — last word of ayahs in well-known short surahs; short ayahs get the
     previous ayah as context; options are rhyming last words from the same surah, then other surahs.
   - `next` — next ayah's opening; options follow similar ayahs or sit nearby.
   - `surah` — ayahs worded in exactly one surah; options are surahs with similar ayahs.
4. **Checks** applied to every candidate: one correct answer for the stated context (otherwise the
   ayah number is shown, or the question is dropped); fragments end only at ۖ ۗ ۚ ۘ or the ayah end
   (never ۙ); no wrong option that the true ayah also continues with; options ≤ 10 words, prompts ≤ 15.
5. **Difficulty**: `0.55·tier + 0.3·similarity of closest wrong option + 0.15·prompt shortness (+0.1 if
   the ayah number is needed)`, mapped to 100–500 by fixed thresholds.

Output (git-ignored, rebuilt on demand): `data/build/questions.json` holds **addresses only**, never
copied text; `data/build/report.md` is the coverage report.

## App

```sh
npm run dev     # http://localhost:5173 — copies the built data into public/data first
npm run build   # regenerate content, typecheck, build to dist/
```

- `src/data.ts` loads `corpus.json`, `questions.json`, `surahs.json` and rebuilds all displayed text from word addresses.
- `src/board.ts` fills each tile with a random question from its category × level pool; no ayah appears in two
  questions on one board; questions already shown on this device (localStorage) are skipped until the pool runs out.
- `src/main.ts` runs the game: turns, timer, 50:50, steal for half points, reveal with sources.

## Layout

- `index.html`, `src/` — the web app.
- `mockup/index.html` — original standalone visual mockup.
- `scripts/` — content pipeline.
- `data/source/` — pinned Tanzil text and metadata.
- `data/curated/` — hand-maintained inputs.

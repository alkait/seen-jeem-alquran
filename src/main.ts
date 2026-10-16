import './style.css';
import { type Category, Data, type Option, type Question, type Ref } from './data.ts';
import { markSeen, pickBoard, pools } from './board.ts';
import { confetti, sfx, stars } from './fx.ts';

const CATS: { key: Category; name: string; color: string }[] = [
  { key: 'complete', name: 'أكمل الآية', color: '#ff8a3d' },
  { key: 'ending', name: 'خاتمة الآية', color: '#2ec5ff' },
  { key: 'next', name: 'ما بعدها؟', color: '#b46bff' },
  { key: 'surah', name: 'من أي سورة؟', color: '#2fe08a' },
];
const LEVELS = [100, 200, 300, 400, 500];
// Tapping an avatar on the start screen cycles through these.
const AVATAR_CHOICES = ['🦁', '🐬', '🦉', '🐢', '🐪', '🦊', '🐼', '🐯', '🦅', '🐎', '🐘', '🦋', '🐝', '🐧', '🐸', '🦄'];
const DEFAULT_AVATARS = ['🦁', '🐬', '🦉', '🐢'];
const COLORS = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)'];
const DEFAULT_NAMES = ['لاعب ١', 'لاعب ٢', 'لاعب ٣', 'لاعب ٤'];
const LETTERS = ['أ', 'ب', 'ج', 'د'];
const FULL_AYAH_MAX_WORDS = 40;

const ar = (n: number | string) => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
const $ = (id: string) => document.getElementById(id)!;

interface Player { name: string; avatar: string; color: string; score: number; half: boolean }

let data: Data;
let pool: Question[][][];
let board: Question[][];
let players: Player[] = [];
let turn = 0;
let used = new Set<string>();

// ---------- start screen ----------
stars();

// Player setup (count, names, avatars) is remembered on this device.
const SETUP_KEY = 'sjq:setup';
interface Setup { count: number; names: string[]; avatars: string[] }
const setup: Setup = (() => {
  const fallback: Setup = { count: 2, names: [...DEFAULT_NAMES], avatars: [...DEFAULT_AVATARS] };
  try {
    const saved = JSON.parse(localStorage.getItem(SETUP_KEY) ?? 'null');
    if (!saved) return fallback;
    return {
      count: [1, 2, 3, 4].includes(saved.count) ? saved.count : fallback.count,
      names: fallback.names.map((n, i) => typeof saved.names?.[i] === 'string' ? saved.names[i] : n),
      avatars: fallback.avatars.map((a, i) => AVATAR_CHOICES.includes(saved.avatars?.[i]) ? saved.avatars[i] : a),
    };
  } catch {
    return fallback;
  }
})();
const saveSetup = () => localStorage.setItem(SETUP_KEY, JSON.stringify(setup));

const countRow = $('countRow'), avatarsEl = $('avatars');
[1, 2, 3, 4].forEach(n => {
  const b = document.createElement('button');
  b.className = 'count-btn';
  b.textContent = ar(n);
  b.onclick = () => { setup.count = n; saveSetup(); sfx.click(); renderStart(); };
  countRow.appendChild(b);
});
DEFAULT_NAMES.forEach((_, i) => {
  const c = document.createElement('div');
  c.className = 'av-card';
  c.innerHTML = `<div class="av" style="--c:${COLORS[i]}" title="اضغط لتغيير الشخصية">${setup.avatars[i]}</div><input maxlength="10">`;
  const av = c.querySelector('.av') as HTMLElement;
  const input = c.querySelector('input')!;
  input.value = setup.names[i];
  input.placeholder = DEFAULT_NAMES[i];
  input.oninput = () => { setup.names[i] = input.value; saveSetup(); };
  av.onclick = () => {
    // Next choice not already taken by another player.
    const taken = new Set(setup.avatars.filter((_, j) => j !== i));
    let k = AVATAR_CHOICES.indexOf(setup.avatars[i]);
    do k = (k + 1) % AVATAR_CHOICES.length; while (taken.has(AVATAR_CHOICES[k]));
    setup.avatars[i] = av.textContent = AVATAR_CHOICES[k];
    saveSetup();
    sfx.click();
  };
  avatarsEl.appendChild(c);
});
function renderStart() {
  [...countRow.children].forEach((b, i) => b.classList.toggle('sel', i + 1 === setup.count));
  [...avatarsEl.children].forEach((c, i) => c.classList.toggle('off', i >= setup.count));
}
renderStart();

Data.load().then(d => {
  data = d;
  pool = pools(d.questions, CATS.map(c => c.key), LEVELS);
  // TEMP: total question count on the start screen.
  $('tmpTotal').textContent = `${ar(d.questions.length.toLocaleString('en'))} سؤال`;
  const play = $('playBtn') as HTMLButtonElement;
  play.disabled = false;
  play.textContent = 'يلّا نلعب!';
}).catch(err => {
  $('playBtn').textContent = 'تعذّر تحميل الأسئلة';
  console.error(err);
});

$('playBtn').onclick = () => {
  sfx.open();
  players = Array.from({ length: setup.count }, (_, i) => ({
    name: setup.names[i].trim() || DEFAULT_NAMES[i],
    avatar: setup.avatars[i], color: COLORS[i], score: 0, half: true,
  }));
  newGame();
};
$('againBtn').onclick = () => {
  players.forEach(p => { p.score = 0; p.half = true; });
  newGame();
};
$('endBtn').onclick = endGame;

function show(id: string) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
}

// ---------- board ----------
function newGame() {
  board = pickBoard(pool);
  used = new Set();
  turn = 0;
  show('board-screen');
  $('players').style.display = 'flex';
  buildBoard();
  renderPlayers();
}

function buildBoard() {
  const b = $('board');
  b.innerHTML = '';
  CATS.forEach((c, ci) => {
    const h = document.createElement('div');
    h.className = 'cat';
    h.style.setProperty('--cc', c.color);
    // TEMP: question counts per category.
    const total = pool[ci].reduce((n, p) => n + p.length, 0);
    h.innerHTML = `<span class="lbl">التصنيف</span>${c.name}<span class="tmp-count">${ar(total.toLocaleString('en'))} سؤال</span>`;
    b.appendChild(h);
  });
  LEVELS.forEach((v, r) => CATS.forEach((_, ci) => {
    const t = document.createElement('button');
    t.className = 'tile';
    t.id = `t-${ci}-${r}`;
    // TEMP: pool size per tile.
    t.innerHTML = `${ar(v)}<span class="tmp-count">${ar(pool[ci][r].length)} سؤال</span>`;
    t.onclick = () => { if (!used.has(t.id)) openQ(ci, r); };
    b.appendChild(t);
  }));
}

function renderPlayers() {
  $('players').innerHTML = players.map((p, i) => `
    <div class="pcard ${i === turn ? 'active' : ''}" style="--c:${p.color}">
      <div class="av" style="--c:${p.color}">${p.avatar}</div>
      <div><div class="nm">${p.name}</div><div class="sc" id="sc-${i}">${ar(p.score)}</div></div>
    </div>`).join('');
  const p = players[turn];
  const tb = $('turnBanner');
  tb.style.setProperty('--c', p.color);
  tb.innerHTML = `${p.avatar} دور ${p.name} — اختر سؤالاً!`;
}

// ---------- question ----------
interface Current {
  ci: number; r: number; q: Question; value: number;
  answerer: number; stealing: boolean; tried: Set<HTMLButtonElement>;
}
let cur: Current;
let timerId = 0, timeLeft = 0, total = 0;
const CIRC = 2 * Math.PI * 30;

const surahLabel = (s: number) => `سورة ${data.surahName(s)}`;
const refLabel = (r: Ref) => `${data.surahName(r.s)} ${ar(r.a)}`;

function askText(q: Question): string {
  const where = `<b>${surahLabel(q.s)}</b>${q.needsAyah ? ` — <b>الآية ${ar(q.a)}</b>` : ''}`;
  switch (q.cat) {
    case 'complete': return `أكمل الآية من ${where}`;
    case 'ending': return `كيف تُختم الآية؟ — ${where}`;
    case 'next': return `ما الآية التالية؟ — ${where}`;
    case 'surah': return 'من أي سورة هذه الآية؟';
  }
}

function promptHtml(q: Question): string {
  const before = q.before ? `${data.text(q.before, true)} <span class="sep">۝</span> ` : '';
  const lead = q.lead ? '… ' : '';
  const text = data.text(q.prompt, q.cat === 'next' || q.cat === 'surah');
  switch (q.cat) {
    case 'surah': return `﴿ ${text} ﴾`;
    case 'next': return `${lead}${text} <span class="sep">۝</span> <span class="blank"></span>`;
    default: return `${before}${lead}${text} <span class="blank"></span>`;
  }
}

function optionText(o: Option): string {
  return o.ref ? data.text(o.ref) : surahLabel(o.surah!);
}

// The ayah(s) behind the answer, shown after the question. Long ayahs are trimmed
// to the part the question used.
// Opens the ayah in the Tanzil reader (tanzil.net/#surah:ayah).
const tanzilLink = (r: { s: number; a: number }) =>
  `<a class="tanzil" href="https://tanzil.net/#${r.s}:${r.a}" target="_blank" rel="noopener">افتحها في تنزيل ↗</a>`;

function revealHtml(q: Question): { text: string; ref: string; from: { s: number; a: number } } {
  const correct = q.options.find(o => o.correct)!;
  const span = (s: number, a: number, w0: number, w1: number) => {
    const len = data.ayahLength(s, a);
    if (len <= FULL_AYAH_MAX_WORDS) return data.ayahText(s, a);
    return `${w0 > 0 ? '… ' : ''}${data.text({ s, a, w0, w1 }, w1 === len)}${w1 < len ? ' …' : ''}`;
  };
  const from = q.before ?? q;
  if (q.cat === 'surah') return { text: data.ayahText(q.s, q.a), ref: `${surahLabel(q.s)} · الآية ${ar(q.a)}`, from };
  if (q.cat === 'next') {
    const r = correct.ref!;
    return {
      text: `${span(q.s, q.a, q.prompt.w0, q.prompt.w1)} <span class="sep">۝</span> ${span(r.s, r.a, 0, r.w1)}`,
      ref: `${surahLabel(q.s)} · الآيتان ${ar(q.a)}–${ar(r.a)}`,
      from,
    };
  }
  const main = span(q.s, q.a, q.prompt.w0, correct.ref!.w1);
  if (q.before) {
    return { text: `${data.ayahText(q.before.s, q.before.a)} <span class="sep">۝</span> ${main}`, ref: `${surahLabel(q.s)} · الآيتان ${ar(q.before.a)}–${ar(q.a)}`, from };
  }
  return { text: main, ref: `${surahLabel(q.s)} · الآية ${ar(q.a)}`, from };
}

function openQ(ci: number, r: number) {
  sfx.open();
  const cat = CATS[ci];
  const q = board[ci][r];
  markSeen(q.id);
  cur = { ci, r, q, value: LEVELS[r], answerer: turn, stealing: false, tried: new Set() };

  $('qmeta').innerHTML = `
    <span class="chip" style="--cc:${cat.color}"><span class="lbl">التصنيف:</span> ${cat.name}</span>
    <span class="chip val">${ar(cur.value)}</span>`;
  $('ask').innerHTML = askText(q);
  $('ayah').innerHTML = promptHtml(q);

  const oel = $('options');
  oel.innerHTML = '';
  [...q.options].sort(() => Math.random() - 0.5).forEach((o, i) => {
    const b = document.createElement('button');
    b.className = 'opt';
    b.innerHTML = `<span class="letter">${LETTERS[i]}</span><span class="t${o.surah ? ' surah-name' : ''}">${optionText(o)}</span>`;
    b.onclick = () => answer(b, o);
    (b as any)._o = o;
    oel.appendChild(b);
  });

  $('result').className = 'result';
  setupLifeline();
  renderWho();
  $('overlay').classList.add('show');
  // More time for longer prompts.
  total = 20 + Math.max(0, q.prompt.w1 - q.prompt.w0 - 10);
  startTimer();
}

const optButtons = () => [...document.querySelectorAll<HTMLButtonElement>('.opt')];
const optOf = (b: HTMLButtonElement): Option => (b as any)._o;

function renderWho() {
  const p = players[cur.answerer];
  $('who').innerHTML = `<div class="av" style="--c:${p.color}">${p.avatar}</div>${cur.stealing ? '🥷 فرصة سرقة: ' : ''}${p.name}`;
}

function setupLifeline() {
  const p = players[cur.answerer];
  const h = $('life5050') as HTMLButtonElement;
  h.disabled = !p.half || cur.q.options.length < 3 || cur.stealing;
  h.onclick = () => {
    p.half = false;
    h.disabled = true;
    sfx.click();
    // Leave the right answer and one wrong one.
    const wrong = optButtons().filter(b => !optOf(b).correct && !b.disabled).sort(() => Math.random() - 0.5);
    wrong.slice(0, wrong.length - 1).forEach(b => { b.classList.add('gone'); b.disabled = true; });
  };
}

function startTimer() {
  clearInterval(timerId);
  timeLeft = total;
  const fg = $('timerFg') as unknown as SVGCircleElement;
  fg.style.strokeDasharray = String(CIRC);
  fg.style.transition = 'none';
  fg.style.strokeDashoffset = '0';
  requestAnimationFrame(() => { fg.style.transition = ''; });
  updateTimer();
  timerId = window.setInterval(() => {
    timeLeft--;
    updateTimer();
    if (timeLeft <= 5 && timeLeft > 0) sfx.tick();
    if (timeLeft <= 0) { clearInterval(timerId); answer(null, null); }
  }, 1000);
}

function updateTimer() {
  $('timerNum').textContent = ar(Math.max(timeLeft, 0));
  ($('timerFg') as unknown as SVGCircleElement).style.strokeDashoffset = String(CIRC * (1 - timeLeft / total));
  $('timer').classList.toggle('warn', timeLeft <= 5);
}

function answer(btn: HTMLButtonElement | null, o: Option | null) {
  clearInterval(timerId);
  optButtons().forEach(b => b.disabled = true);
  ($('life5050') as HTMLButtonElement).disabled = true;
  const p = players[cur.answerer];
  const res = $('result');

  if (o?.correct) {
    btn!.classList.add('correct');
    sfx.right();
    confetti();
    const pts = cur.stealing ? Math.round(cur.value / 2) : cur.value;
    p.score += pts;
    finishCell(p);
    const r = revealHtml(cur.q);
    res.innerHTML = `
      <div class="msg" style="color:var(--green)">🎉 أحسنت يا ${p.name}! +${ar(pts)}</div>
      <div class="full">﴿ ${r.text} ﴾</div>
      <div class="ref">${r.ref} · ${tanzilLink(r.from)}</div>
      <div class="acts"><button class="act-btn" id="nextBtn">متابعة ←</button></div>`;
    $('nextBtn').onclick = closeQ;
  } else {
    if (btn) { btn.classList.add('wrong'); cur.tried.add(btn); }
    sfx.wrong();
    const msg = o ? '❌ ليست هذه!' : '⏰ انتهى الوقت!';
    const from = o?.ref ? `<div class="ref">هذه من: ${refLabel(o.ref)} 😉</div>` : '';
    const canSteal = !cur.stealing && players.length > 1;
    const next = (cur.answerer + 1) % players.length;
    res.innerHTML = `
      <div class="msg" style="color:var(--red)">${msg}</div>${from}
      <div class="acts">
        ${canSteal ? `<button class="act-btn steal" id="stealBtn">🥷 ${players[next].name} يسرق (نصف النقاط)</button>` : ''}
        <button class="act-btn" id="revealBtn">اكشف الإجابة</button>
      </div>`;
    if (canSteal) $('stealBtn').onclick = () => steal(next);
    $('revealBtn').onclick = reveal;
  }
  res.className = 'result show';
}

function steal(next: number) {
  cur.answerer = next;
  cur.stealing = true;
  optButtons().forEach(b => { if (!cur.tried.has(b) && !b.classList.contains('gone')) b.disabled = false; });
  $('result').className = 'result';
  setupLifeline();
  renderWho();
  sfx.open();
  startTimer();
}

function reveal() {
  optButtons().forEach(b => { if (optOf(b).correct) b.classList.add('correct'); });
  finishCell(null);
  const r = revealHtml(cur.q);
  $('result').innerHTML = `
    <div class="full">﴿ ${r.text} ﴾</div>
    <div class="ref">${r.ref} · ${tanzilLink(r.from)}</div>
    <div class="acts"><button class="act-btn" id="nextBtn">متابعة ←</button></div>`;
  $('nextBtn').onclick = closeQ;
}

function finishCell(winner: Player | null) {
  // Fill the blank and show where every option comes from.
  const correct = cur.q.options.find(o => o.correct)!;
  const blank = document.querySelector('#ayah .blank');
  if (blank && correct.ref) blank.outerHTML = `<span class="filled">${data.text(correct.ref)}</span>`;
  for (const b of optButtons()) {
    const o = optOf(b);
    if (o.ref && !b.querySelector('.src')) b.insertAdjacentHTML('beforeend', `<span class="src">${refLabel(o.ref)}</span>`);
  }
  const t = $(`t-${cur.ci}-${cur.r}`);
  used.add(t.id);
  t.classList.add('used');
  t.innerHTML = `<span class="badge">${winner ? winner.avatar : '—'}</span>`;
  if (winner) t.style.boxShadow = `inset 0 0 0 3px ${winner.color}, 0 0 20px ${winner.color}`;
}

function closeQ() {
  $('overlay').classList.remove('show');
  const scored = cur.answerer;
  turn = (turn + 1) % players.length;
  renderPlayers();
  $(`sc-${scored}`).classList.add('pop');
  if (used.size === LEVELS.length * CATS.length) endGame();
}

// ---------- end ----------
function endGame() {
  $('players').style.display = 'none';
  const ranked = [...players].sort((a, b) => b.score - a.score);
  $('winnerTitle').textContent = `🏆 ${ranked[0].name}`;
  const order = ranked.length >= 3 ? [ranked[1], ranked[0], ranked[2], ...ranked.slice(3)] : ranked.length === 2 ? [ranked[1], ranked[0]] : ranked;
  const heights = [220, 160, 120, 90];
  const MEDALS = [
    { icon: '🥇', color: '#ffcf4a' },
    { icon: '🥈', color: '#cfd8e3' },
    { icon: '🥉', color: '#d98a4e' },
    { icon: '🎖️', color: 'rgba(255,255,255,.35)' },
  ];
  $('podium').innerHTML = order.map(p => {
    const rk = ranked.indexOf(p);
    const medal = MEDALS[rk];
    return `<div class="step"><div class="av" style="--c:${p.color}">${p.avatar}</div><div class="nm">${p.name}</div>
      <div class="blk" style="height:${heights[rk]}px; --c:${p.color}; --medal:${medal.color}">
        <div class="medal">${medal.icon}</div><div class="pts">${ar(p.score)} <small>نقطة</small></div>
      </div></div>`;
  }).join('');
  show('end');
  sfx.right();
  confetti();
  setTimeout(confetti, 600);
}

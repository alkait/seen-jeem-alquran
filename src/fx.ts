// Sound effects, confetti and toasts.

let actx: AudioContext | undefined;

function tone(freqs: number[], dur = 0.12, type: OscillatorType = 'triangle', gap = 0.09, vol = 0.15) {
  try {
    actx ??= new AudioContext();
    freqs.forEach((f, i) => {
      const o = actx!.createOscillator(), g = actx!.createGain();
      o.type = type;
      o.frequency.value = f;
      const t = actx!.currentTime + i * gap;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(actx!.destination);
      o.start(t);
      o.stop(t + dur);
    });
  } catch {
    // audio is optional
  }
}

export const sfx = {
  click: () => tone([660], 0.06, 'square', 0, 0.05),
  open: () => tone([392, 523, 659], 0.15, 'triangle', 0.07),
  right: () => tone([523, 659, 784, 1046], 0.2, 'triangle', 0.08, 0.18),
  wrong: () => tone([180, 140], 0.3, 'sawtooth', 0.15, 0.1),
  tick: () => tone([880], 0.04, 'square', 0, 0.04),
};

export function toast(msg: string) {
  const t = document.getElementById('toast')!;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

interface Particle { x: number; y: number; vx: number; vy: number; s: number; c: string; r: number; vr: number; life: number }
let parts: Particle[] = [];
let raf = 0;

export function confetti() {
  const cv = document.getElementById('confetti') as HTMLCanvasElement;
  cv.width = innerWidth;
  cv.height = innerHeight;
  const cols = ['#ffcf4a', '#2ee6c5', '#ff4fa3', '#b46bff', '#2ec5ff', '#fff'];
  for (let i = 0; i < 160; i++) parts.push({
    x: innerWidth / 2, y: innerHeight / 2.2, vx: (Math.random() - 0.5) * 18, vy: Math.random() * -18 - 4,
    s: 6 + Math.random() * 8, c: cols[i % cols.length], r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, life: 120,
  });
  if (!raf) loop(cv);
}

function loop(cv: HTMLCanvasElement) {
  const cx = cv.getContext('2d')!;
  cx.clearRect(0, 0, cv.width, cv.height);
  for (const p of parts) {
    p.x += p.vx; p.y += p.vy; p.vy += 0.45; p.vx *= 0.99; p.r += p.vr; p.life--;
    cx.save();
    cx.translate(p.x, p.y);
    cx.rotate(p.r);
    cx.fillStyle = p.c;
    cx.globalAlpha = Math.max(p.life / 120, 0);
    cx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
    cx.restore();
  }
  parts = parts.filter(p => p.life > 0 && p.y < cv.height + 40);
  if (parts.length) raf = requestAnimationFrame(() => loop(cv));
  else { cx.clearRect(0, 0, cv.width, cv.height); raf = 0; }
}

export function stars() {
  const el = document.getElementById('stars')!;
  for (let i = 0; i < 70; i++) {
    const s = document.createElement('i');
    s.style.left = Math.random() * 100 + '%';
    s.style.top = Math.random() * 100 + '%';
    s.style.animationDelay = Math.random() * 3 + 's';
    if (Math.random() > 0.8) s.style.width = s.style.height = '3px';
    el.appendChild(s);
  }
}

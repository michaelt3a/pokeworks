// Ahi Slice — swipe to slice flying Pokeworks ingredients.
//  Twist 1 (Freshness Frenzy): every ingredient is bright when tossed and dulls
//    the longer it stays airborne — slice it fresh for full points.
//  Twist 2 (Golden Star): slice the rare gold star to trigger a few seconds of
//    slow-mo and chain a big combo.
//  Avoid the wasabi bombs, and don't let fresh ingredients fall. Three slip-ups
//  ends the run.

const B = window.Bowl;

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

const livesEl = document.getElementById("lives");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const overlay = document.getElementById("overlay");
const screenStart = document.getElementById("screen-start");
const screenOver = document.getElementById("screen-over");
const startBtn = document.getElementById("start-btn");
const againBtn = document.getElementById("again-btn");
const finalEl = document.getElementById("final");
const slowmoEl = document.getElementById("slowmo");

// --- Tuning -------------------------------------------------------------
const START_LIVES = 3;
const GRAV = 900; // px/s^2 (canvas units)
const FRESH_DECAY = 0.4; // freshness lost per second airborne
const SLOW_FACTOR = 0.45; // game speed during slow-mo
const SLOW_TIME = 4; // seconds of slow-mo per star
const BEST_KEY = "pokeworks-ahislice-best";
// Bright, distinct ingredients so it reads at a glance.
const FOODS = [
  "Ahi Tuna", "Atlantic Salmon", "Avocado", "Pineapple", "Edamame",
  "Mandarin Orange", "Cucumber", "Sweet Corn", "Sliced Onion", "Masago",
];

// --- State --------------------------------------------------------------
let best = loadBest();
const S = {
  running: false,
  score: 0,
  lives: START_LIVES,
  combo: 0,
  elapsed: 0,
  timeScale: 1,
  slowTimer: 0,
  shake: 0,
  objects: [],
  particles: [],
  floats: [],
  blade: [],
  spawnTimer: 0,
  slicing: false,
  lastX: 0,
  lastY: 0,
  lastSlice: -9,
  lastTime: 0,
};

// --- Sound --------------------------------------------------------------
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}
function tone({ freq = 440, type = "triangle", dur = 0.11, gain = 0.13, slideTo = null, delay = 0 }) {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime + delay;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}
function arp(freqs, opts = {}) {
  const step = opts.step || 0.07;
  freqs.forEach((f, i) => tone({ freq: f, delay: i * step, ...opts }));
}
function noise(dur = 0.25, gain = 0.3) {
  if (!audioCtx) return;
  const n = Math.floor(audioCtx.sampleRate * dur);
  const buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const g = audioCtx.createGain();
  g.gain.value = gain;
  const lp = audioCtx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 900;
  src.connect(lp).connect(g).connect(audioCtx.destination);
  src.start();
}
const SFX = {
  slice: () => tone({ freq: 900, type: "triangle", dur: 0.07, gain: 0.12, slideTo: 1500 }),
  bomb: () => { noise(0.35, 0.35); tone({ freq: 160, type: "sawtooth", dur: 0.3, gain: 0.2, slideTo: 60 }); },
  star: () => arp([784, 1047, 1319, 1568], { type: "triangle", dur: 0.14, gain: 0.13, step: 0.06 }),
  miss: () => tone({ freq: 240, type: "sine", dur: 0.16, gain: 0.12, slideTo: 120 }),
  start: () => arp([392, 523, 659], { dur: 0.12, step: 0.06 }),
  over: () => arp([440, 349, 262], { type: "triangle", dur: 0.22, step: 0.12 }),
};

// --- Persistence --------------------------------------------------------
function loadBest() {
  try { return parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch { return 0; }
}
function saveBest(v) {
  try { localStorage.setItem(BEST_KEY, String(v)); } catch { /* ignore */ }
}

// --- Spawning -----------------------------------------------------------
function difficulty() {
  return Math.min(1, S.elapsed / 70);
}
function waveInterval() {
  return Math.max(0.55, 1.5 - difficulty() * 0.95);
}
function spawnWave() {
  const diff = difficulty();
  const count = 1 + Math.floor(Math.random() * (1.6 + diff * 2.2));
  for (let i = 0; i < count; i++) spawnObject(diff);
}
function spawnObject(diff) {
  const roll = Math.random();
  const starChance = 0.03;
  const bombChance = 0.09 + diff * 0.16;
  let type = "food";
  if (roll < starChance) type = "star";
  else if (roll < starChance + bombChance) type = "bomb";

  const r = type === "food" ? 34 : 30;
  const x = 90 + Math.random() * (W - 180);
  const rise = 350 + Math.random() * 190 + diff * 70; // how high it arcs
  const vy = -Math.sqrt(2 * GRAV * rise);
  const toward = x < W / 2 ? 1 : -1; // bias back toward the middle
  const vx = toward * (30 + Math.random() * (120 + diff * 110));
  S.objects.push({
    x, y: H + r + 12, vx, vy,
    rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 5,
    r, type, name: type === "food" ? FOODS[(Math.random() * FOODS.length) | 0] : null,
    fresh: 1, sliced: false,
  });
}

// --- Effects ------------------------------------------------------------
function spawnJuice(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 60 + Math.random() * 300;
    S.particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
      size: 3 + Math.random() * 5, color, life: 0.5 + Math.random() * 0.4, maxLife: 0.9,
    });
  }
}
function floatText(x, y, text, color) {
  S.floats.push({ x, y, text, color, life: 0.9, maxLife: 0.9 });
}
function primaryColor(name) {
  const st = B.STYLE[name];
  return st ? st.c[0] : "#e8674f";
}

// --- Slicing ------------------------------------------------------------
// Distance from point (px,py) to segment (ax,ay)-(bx,by).
function segDist(ax, ay, bx, by, px, py) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function sliceAt(ax, ay, bx, by) {
  for (const o of S.objects) {
    if (o.sliced) continue;
    if (segDist(ax, ay, bx, by, o.x, o.y) <= o.r * 0.95) sliceObject(o);
  }
}

function sliceObject(o) {
  o.sliced = true;
  o.dead = true;
  if (o.type === "bomb") {
    loseLife();
    S.combo = 0;
    updateCombo();
    S.shake = 0.45;
    spawnJuice(o.x, o.y, "#2c2c2c", 22);
    spawnJuice(o.x, o.y, "#e8674f", 10);
    SFX.bomb();
    return;
  }
  if (o.type === "star") {
    S.timeScale = SLOW_FACTOR;
    S.slowTimer = SLOW_TIME;
    updateSlow();
    spawnJuice(o.x, o.y, "#ffd15a", 26);
    floatText(o.x, o.y, "SLOW-MO!", "#ffd15a");
    SFX.star();
    return;
  }
  // food
  S.combo += 1;
  S.lastSlice = S.elapsed;
  const mult = 1 + Math.min(S.combo - 1, 24) * 0.08;
  const pts = Math.max(1, Math.round(18 * o.fresh * mult));
  S.score += pts;
  setScore();
  updateCombo();
  spawnJuice(o.x, o.y, primaryColor(o.name), 14);
  floatText(o.x, o.y, "+" + pts, o.fresh > 0.6 ? "#8fe39a" : o.fresh > 0.33 ? "#ffd15a" : "#f5a3ad");
  SFX.slice();
}

function onMiss(o) {
  loseLife();
  S.combo = 0;
  updateCombo();
  spawnJuice(o.x, H - 6, primaryColor(o.name), 8);
  SFX.miss();
}

function loseLife() {
  S.lives = Math.max(0, S.lives - 1);
  renderLives();
  if (S.lives <= 0) endGame();
}

// --- Update -------------------------------------------------------------
function update(dt) {
  S.elapsed += dt;
  if (S.slowTimer > 0) {
    S.slowTimer = Math.max(0, S.slowTimer - dt);
    if (S.slowTimer === 0) { S.timeScale = 1; updateSlow(); }
  }
  if (S.shake > 0) S.shake = Math.max(0, S.shake - dt);
  if (S.combo > 0 && S.elapsed - S.lastSlice > 1.1) { S.combo = 0; updateCombo(); }

  const g = dt * S.timeScale; // game time (slowed by slow-mo)

  S.spawnTimer -= dt;
  if (S.spawnTimer <= 0) { spawnWave(); S.spawnTimer = waveInterval(); }

  for (const o of S.objects) {
    o.vy += GRAV * g;
    o.x += o.vx * g;
    o.y += o.vy * g;
    o.rot += o.spin * g;
    if (o.type === "food") o.fresh = Math.max(0.12, o.fresh - FRESH_DECAY * g);
    if (o.y > H + o.r + 30 && o.vy > 0) {
      o.dead = true;
      if (o.type === "food" && !o.sliced) onMiss(o);
    }
  }
  S.objects = S.objects.filter((o) => !o.dead);

  for (const p of S.particles) {
    p.vy += 700 * g;
    p.x += p.vx * g;
    p.y += p.vy * g;
    p.life -= dt;
  }
  S.particles = S.particles.filter((p) => p.life > 0);

  for (const f of S.floats) { f.y -= 40 * dt; f.life -= dt; }
  S.floats = S.floats.filter((f) => f.life > 0);

  S.blade = S.blade.filter((b) => S.elapsed - b.t < 0.14);
}

// --- Render -------------------------------------------------------------
function drawBomb(o) {
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(o.rot);
  // danger glow
  ctx.shadowColor = "rgba(226,87,76,0.9)";
  ctx.shadowBlur = 16;
  ctx.fillStyle = "#23262a";
  ctx.beginPath();
  ctx.arc(0, 0, o.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  // highlight
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.ellipse(-o.r * 0.3, -o.r * 0.35, o.r * 0.3, o.r * 0.18, -0.5, 0, Math.PI * 2);
  ctx.fill();
  // fuse
  ctx.strokeStyle = "#9c7743";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -o.r);
  ctx.quadraticCurveTo(o.r * 0.5, -o.r * 1.4, o.r * 0.7, -o.r * 1.1);
  ctx.stroke();
  // spark
  ctx.fillStyle = "#ffd15a";
  ctx.beginPath();
  ctx.arc(o.r * 0.7, -o.r * 1.1, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawStar(o) {
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(o.rot * 0.4);
  ctx.shadowColor = "rgba(255,209,90,0.9)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#ffd15a";
  ctx.strokeStyle = "#e0a92c";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? o.r : o.r * 0.46;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const px = Math.cos(a) * rad, py = Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (S.shake > 0) {
    const s = S.shake * 14;
    ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  }

  // background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#12302f");
  bg.addColorStop(1, "#0a1618");
  ctx.fillStyle = bg;
  ctx.fillRect(-20, -20, W + 40, H + 40);

  // slow-mo tint
  if (S.slowTimer > 0) {
    ctx.fillStyle = "rgba(34,178,180,0.10)";
    ctx.fillRect(-20, -20, W + 40, H + 40);
  }

  // objects
  for (const o of S.objects) {
    if (o.type === "bomb") { drawBomb(o); continue; }
    if (o.type === "star") { drawStar(o); continue; }
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.rot);
    B.drawItem(ctx, 0, 0, o.r, o.name);
    if (o.fresh < 0.97) {
      // wilt: dull the piece as it ages
      ctx.globalAlpha = (1 - o.fresh) * 0.6;
      ctx.fillStyle = "#8a8a76";
      ctx.beginPath();
      ctx.arc(0, 0, o.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // juice particles
  for (const p of S.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // blade trail
  if (S.blade.length > 1) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(34,178,180,0.9)";
    ctx.shadowBlur = 12;
    for (let i = 1; i < S.blade.length; i++) {
      const a = S.blade[i - 1], b = S.blade[i];
      const f = i / S.blade.length;
      ctx.strokeStyle = "rgba(255,255,255," + (0.25 + f * 0.75) + ")";
      ctx.lineWidth = 2 + f * 9;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // floating score text
  for (const f of S.floats) {
    ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
    ctx.fillStyle = f.color;
    ctx.font = "800 26px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;

  ctx.restore();
}

// --- HUD ----------------------------------------------------------------
function renderLives() {
  const full = Math.max(0, S.lives);
  livesEl.textContent = "❤️".repeat(full) + "🤍".repeat(Math.max(0, START_LIVES - full));
}
function setScore() {
  scoreEl.textContent = S.score;
}
function updateCombo() {
  if (S.combo >= 2) {
    slowmoEl.dataset.combo = "x" + S.combo;
  }
  const el = document.getElementById("combo");
  if (!el) return;
  if (S.combo >= 3) {
    el.textContent = "Combo x" + S.combo;
    el.classList.remove("hidden");
  } else {
    el.classList.add("hidden");
  }
}
function updateSlow() {
  if (S.slowTimer > 0) slowmoEl.classList.remove("hidden");
  else slowmoEl.classList.add("hidden");
}

// --- Loop ---------------------------------------------------------------
function frame(t) {
  if (!S.lastTime) S.lastTime = t;
  const dt = Math.min((t - S.lastTime) / 1000, 0.05);
  S.lastTime = t;
  if (S.running) {
    update(dt);
    render();
  }
  requestAnimationFrame(frame);
}

// --- Pointer (slicing) --------------------------------------------------
function canvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (W / rect.width),
    y: (e.clientY - rect.top) * (H / rect.height),
  };
}
canvas.addEventListener("pointerdown", (e) => {
  if (!S.running) return;
  S.slicing = true;
  const p = canvasPos(e);
  S.lastX = p.x; S.lastY = p.y;
  S.blade = [{ x: p.x, y: p.y, t: S.elapsed }];
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!S.running || !S.slicing) return;
  const p = canvasPos(e);
  S.blade.push({ x: p.x, y: p.y, t: S.elapsed });
  sliceAt(S.lastX, S.lastY, p.x, p.y);
  S.lastX = p.x; S.lastY = p.y;
});
function endSlice() { S.slicing = false; }
canvas.addEventListener("pointerup", endSlice);
canvas.addEventListener("pointercancel", endSlice);
canvas.addEventListener("pointerleave", endSlice);

// --- Lifecycle ----------------------------------------------------------
function startGame() {
  ensureAudio();
  S.running = true;
  S.score = 0;
  S.lives = START_LIVES;
  S.combo = 0;
  S.elapsed = 0;
  S.timeScale = 1;
  S.slowTimer = 0;
  S.shake = 0;
  S.objects = [];
  S.particles = [];
  S.floats = [];
  S.blade = [];
  S.spawnTimer = 0.4;
  setScore();
  bestEl.textContent = best;
  renderLives();
  updateCombo();
  updateSlow();
  overlay.classList.add("hidden");
}

function endGame() {
  S.running = false;
  SFX.over();
  const isBest = S.score > best;
  if (isBest) { best = S.score; saveBest(best); }
  bestEl.textContent = best;
  finalEl.innerHTML =
    `You scored <strong>${S.score}</strong>.` +
    (isBest && S.score > 0 ? `<br><span class="slice-best">★ New best!</span>` : "");
  screenStart.classList.add("hidden");
  screenOver.classList.remove("hidden");
  overlay.classList.remove("hidden");
}

// --- Wiring -------------------------------------------------------------
startBtn.addEventListener("click", () => { ensureAudio(); SFX.start(); startGame(); });
againBtn.addEventListener("click", () => { ensureAudio(); SFX.start(); startGame(); });

best = loadBest();
bestEl.textContent = best;
renderLives();
requestAnimationFrame(frame);

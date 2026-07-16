// --- Pokeworks bowl-stacking minigame ----------------------------------
// Slide an ingredient over the bowl and drop it. It has to land on whatever
// is below (the bowl's opening for the first one, the last ingredient after
// that). Any overhang is trimmed, so the bowl narrows as you build it up.
// Miss completely and it's game over. Difficulty sets the slide speed.

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("start-btn");
const scoreEl = document.getElementById("score");
const highScoreEl = document.getElementById("high-score");
const screenStart = document.getElementById("screen-start");
const screenDifficulty = document.getElementById("screen-difficulty");
const screenStartTitle = screenStart.querySelector(".overlay-title");
const screenStartSubtitle = screenStart.querySelector(".overlay-subtitle");
const difficultyBtns = document.querySelectorAll(".difficulty-btn");

// Internal (fixed) canvas resolution — drawing happens in this coordinate space.
const W = canvas.width; // 800
const H = canvas.height; // 600

const BLOCK_H = 34; // height of each ingredient slab
const TOP_MARGIN = 70; // once the active block would rise above this, the camera scrolls

// The bowl, in world coordinates. Its opening (rim ellipse) is the base the
// first ingredient must land in.
const BOWL = {
  cx: W / 2, // 400
  rimY: 430, // world y of the rim's center line
  rimRx: 150, // half the opening width
  rimRy: 26, // rim ellipse vertical radius (perspective)
  bottomY: 560,
};
const BOWL_OPEN_X = BOWL.cx - BOWL.rimRx;
const BOWL_OPEN_WIDTH = BOWL.rimRx * 2;

// Ingredient-ish colors, cycled as the bowl fills up.
const COLORS = [
  "#fd9f27", // salmon
  "#4caf72", // avocado
  "#f5d64e", // mango
  "#e2574c", // ahi tuna
  "#6cc0d6", // sauce
  "#c98a5e", // tempura
];

// Slide speed (px/sec) per difficulty, plus how much it ramps up per block.
const DIFFICULTY = {
  easy: { speed: 190, ramp: 4 },
  medium: { speed: 320, ramp: 8 },
  impossible: { speed: 620, ramp: 16 },
};

const HIGH_SCORE_KEY = "pokeworks-high-score";

const state = {
  running: false,
  score: 0,
  highScore: 0,
  difficulty: null,
  placed: [], // ingredients in the bowl: { x, width, color }, index 0 = bottom
  active: null, // the moving ingredient: { x, width, color, dir }
  lastTime: 0,
  rafId: 0,
};

function setScore(value) {
  state.score = value;
  scoreEl.textContent = String(value);
}

function loadHighScore() {
  let stored = 0;
  try {
    stored = parseInt(localStorage.getItem(HIGH_SCORE_KEY), 10) || 0;
  } catch (e) {
    stored = 0; // localStorage may be unavailable (e.g. file:// restrictions)
  }
  state.highScore = stored;
  highScoreEl.textContent = String(stored);
}

// Save the score as the new best if it beats the stored one. Returns true if beaten.
function updateHighScore() {
  if (state.score <= state.highScore) return false;
  state.highScore = state.score;
  highScoreEl.textContent = String(state.score);
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(state.score));
  } catch (e) {
    /* ignore persistence failures */
  }
  return true;
}

function colorFor(index) {
  return COLORS[index % COLORS.length];
}

// The surface the next ingredient must land on: the bowl opening for the
// first one, otherwise the top ingredient already in the bowl.
function surfaceBelow() {
  if (state.placed.length === 0) {
    return { x: BOWL_OPEN_X, width: BOWL_OPEN_WIDTH };
  }
  return state.placed[state.placed.length - 1];
}

// World-space top edge of the ingredient (or active block) at a given index.
function worldTopForIndex(index) {
  return BOWL.rimY - index * BLOCK_H - BLOCK_H;
}

// --- Screen / flow helpers ---------------------------------------------

function showDifficulty() {
  screenStart.classList.add("hidden");
  screenDifficulty.classList.remove("hidden");
}

function showStartScreen() {
  screenDifficulty.classList.add("hidden");
  screenStart.classList.remove("hidden");
}

// --- Game lifecycle -----------------------------------------------------

function spawnActive() {
  const below = surfaceBelow();
  state.active = {
    x: 0,
    width: below.width,
    color: colorFor(state.placed.length),
    dir: 1,
  };
}

function startGame(difficulty) {
  state.running = true;
  state.difficulty = difficulty;
  setScore(0);

  // Start with an empty bowl and the first ingredient sliding over it.
  state.placed = [];
  spawnActive();

  overlay.classList.add("hidden");
  if (document.activeElement && document.activeElement.blur) {
    document.activeElement.blur(); // so Space doesn't re-click a hidden button
  }
  state.lastTime = 0;
  state.rafId = requestAnimationFrame(loop);
}

function endGame() {
  state.running = false;
  if (state.rafId) {
    cancelAnimationFrame(state.rafId);
    state.rafId = 0;
  }

  const isNewBest = updateHighScore();

  screenStartTitle.textContent = "Game Over";
  screenStartSubtitle.textContent = isNewBest
    ? `New best — ${state.score} in the bowl!`
    : `You added ${state.score} ingredient${state.score === 1 ? "" : "s"}. Play again?`;
  startBtn.textContent = "Play Again";

  overlay.classList.remove("hidden");
  showStartScreen();
}

// Drop the active ingredient, trimming it to its overlap with the surface below.
function dropActive() {
  if (!state.running || !state.active) return;

  const below = surfaceBelow();
  const active = state.active;

  const overlapLeft = Math.max(active.x, below.x);
  const overlapRight = Math.min(active.x + active.width, below.x + below.width);
  const overlap = overlapRight - overlapLeft;

  if (overlap <= 0) {
    endGame(); // missed the bowl / the stack entirely
    return;
  }

  state.placed.push({ x: overlapLeft, width: overlap, color: active.color });
  setScore(state.placed.length);
  spawnActive();
}

// --- Loop & rendering ---------------------------------------------------

function update(dt) {
  const active = state.active;
  if (!active) return;

  const cfg = DIFFICULTY[state.difficulty] || DIFFICULTY.medium;
  const speed = cfg.speed + cfg.ramp * state.score;

  active.x += active.dir * speed * dt;

  // Bounce off the play-area edges.
  if (active.x <= 0) {
    active.x = 0;
    active.dir = 1;
  } else if (active.x + active.width >= W) {
    active.x = W - active.width;
    active.dir = -1;
  }
}

// How far the whole scene is shifted down so the active block stays on screen.
function cameraOffset() {
  const activeTop = worldTopForIndex(state.placed.length);
  return Math.max(0, TOP_MARGIN - activeTop);
}

function drawBlock(x, topY, width, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, topY, width, BLOCK_H, 6);
  ctx.fill();

  // A darker bottom lip for a little depth.
  ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
  ctx.beginPath();
  ctx.roundRect(x, topY + BLOCK_H - 6, width, 6, 6);
  ctx.fill();
}

// Bowl body + hollow interior. Drawn behind the ingredients.
function drawBowlBody(camY) {
  const { cx, rimRx, rimRy } = BOWL;
  const rimY = BOWL.rimY + camY;
  const bottomY = BOWL.bottomY + camY;

  // Soft shadow on the ground beneath the bowl.
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.beginPath();
  ctx.ellipse(cx, bottomY + 14, rimRx * 0.9, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Bowl body: rim sides curving down to a rounded base, closed by the front rim arc.
  ctx.beginPath();
  ctx.moveTo(cx - rimRx, rimY);
  ctx.quadraticCurveTo(cx - rimRx, bottomY, cx, bottomY);
  ctx.quadraticCurveTo(cx + rimRx, bottomY, cx + rimRx, rimY);
  ctx.ellipse(cx, rimY, rimRx, rimRy, 0, 0, Math.PI, false);
  ctx.closePath();
  ctx.fillStyle = "#e9dcc6";
  ctx.fill();
  ctx.strokeStyle = "rgba(60, 40, 20, 0.35)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Hollow opening.
  ctx.beginPath();
  ctx.ellipse(cx, rimY, rimRx, rimRy, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#c9b596";
  ctx.fill();
}

// The front lip of the rim, drawn over the ingredients so they look contained.
function drawBowlRimFront(camY) {
  const rimY = BOWL.rimY + camY;
  ctx.beginPath();
  ctx.ellipse(BOWL.cx, rimY, BOWL.rimRx, BOWL.rimRy, 0, 0, Math.PI, false);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 3;
  ctx.stroke();
}

function render() {
  ctx.clearRect(0, 0, W, H);
  const camY = cameraOffset();

  drawBowlBody(camY);

  // Ingredients, bottom to top.
  for (let i = 0; i < state.placed.length; i++) {
    const b = state.placed[i];
    drawBlock(b.x, worldTopForIndex(i) + camY, b.width, b.color);
  }

  // Active (sliding) ingredient sits in the next slot up.
  if (state.active) {
    drawBlock(
      state.active.x,
      worldTopForIndex(state.placed.length) + camY,
      state.active.width,
      state.active.color
    );
  }

  drawBowlRimFront(camY);
}

function loop(timestamp) {
  if (!state.running) return;

  if (!state.lastTime) state.lastTime = timestamp;
  const dt = Math.min((timestamp - state.lastTime) / 1000, 0.05); // clamp big gaps
  state.lastTime = timestamp;

  update(dt);
  render();

  state.rafId = requestAnimationFrame(loop);
}

// --- Input --------------------------------------------------------------

startBtn.addEventListener("click", () => {
  // Reset the start screen back to its initial copy before choosing difficulty.
  screenStartTitle.textContent = "Minigame";
  screenStartSubtitle.textContent = "Stack the ingredients to score.";
  startBtn.textContent = "Start";
  showDifficulty();
});

difficultyBtns.forEach((btn) => {
  btn.addEventListener("click", () => startGame(btn.dataset.difficulty));
});

// Drop on click within the play area, or with the Space bar.
canvas.addEventListener("pointerdown", dropActive);
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    dropActive();
  }
});

// Show any previously saved best on load.
loadHighScore();

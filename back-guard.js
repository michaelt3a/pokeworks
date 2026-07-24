// Tucks the "← Minigames" link away while a game is actually in progress, so a
// stray tap near the top-left can't drop you out of a run. Tap anywhere outside
// the play area (or press Escape) and it comes back.
//
// "In progress" is derived rather than hooked into each game's logic: every game
// covers its stage with #overlay between runs, and the two that finish on a
// results panel instead are checked as well. Deriving it means the link can't
// get stuck hidden if a game gains a new way to end.
(function () {
  const backLink = document.querySelector(".back-link");
  const overlay = document.getElementById("overlay");
  if (!backLink || !overlay) return;

  const stage = document.querySelector(".stage, .ou-stage, .ss-stage, .builder-shell");
  // Panels that mean "the run is over" even though the overlay is still down.
  const endPanels = ["#scorecard", "#results", "#success"]
    .map((s) => document.querySelector(s))
    .filter(Boolean);

  let revealed = false;

  function visible(el) {
    return el && !el.classList.contains("hidden") && getComputedStyle(el).display !== "none";
  }

  function isPlaying() {
    if (!overlay.classList.contains("hidden")) return false; // a menu or game-over screen is up
    for (const p of endPanels) if (visible(p)) return false; // a results panel is up
    return true;
  }

  function update() {
    backLink.classList.toggle("tucked", isPlaying() && !revealed);
  }

  // Deliberately tapping away from the play area brings the link back; tapping
  // back into the stage tucks it away again.
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!stage) return;
      if (backLink.contains(e.target)) return; // let the link itself be clicked
      revealed = !stage.contains(e.target);
      update();
    },
    true
  );

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { revealed = true; update(); }
  });

  // Starting or ending a run resets the manual reveal.
  const mo = new MutationObserver(() => { revealed = false; update(); });
  mo.observe(overlay, { attributes: true, attributeFilter: ["class"] });
  for (const p of endPanels) mo.observe(p, { attributes: true, attributeFilter: ["class"] });

  update();
})();

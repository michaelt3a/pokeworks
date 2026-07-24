// Arcade-wide mute. Every game builds its own Web Audio graph and wires it to
// ctx.destination, so rather than touching four sound systems this wraps
// AudioContext: each new context gets a master gain that its "destination"
// actually points at, and muting drops every one of those gains to zero.
//
// Must load before the game scripts, since it patches the constructor they use.
(function () {
  const KEY = "pokeworks-muted";
  const gains = [];

  function load() {
    try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; }
  }
  let muted = load();

  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC && !AC.__pokePatched) {
    const Patched = function (opts) {
      const ctx = opts === undefined ? new AC() : new AC(opts);
      try {
        const real = ctx.destination;
        const master = ctx.createGain();
        master.gain.value = muted ? 0 : 1;
        master.connect(real);
        // Everything the games connect to "destination" now lands on the gain.
        Object.defineProperty(ctx, "destination", {
          get: function () { return master; },
          configurable: true,
        });
        gains.push(master);
      } catch (e) { /* unpatched context still works, just can't be muted */ }
      return ctx;
    };
    Patched.prototype = AC.prototype;
    Patched.__pokePatched = true;
    window.AudioContext = Patched;
    window.webkitAudioContext = Patched;
  }

  function apply() {
    for (const g of gains) {
      try { g.gain.value = muted ? 0 : 1; } catch (e) { /* ignore */ }
    }
    const btn = document.getElementById("sound-toggle");
    if (btn) {
      btn.textContent = muted ? "🔇" : "🔊";
      btn.setAttribute("aria-label", muted ? "Unmute" : "Mute");
      btn.setAttribute("aria-pressed", String(muted));
      btn.classList.toggle("is-muted", muted);
    }
    document.dispatchEvent(new CustomEvent("pokesound:change", { detail: { muted: muted } }));
  }

  function set(v) {
    muted = !!v;
    try { localStorage.setItem(KEY, muted ? "1" : "0"); } catch (e) { /* ignore */ }
    apply();
  }

  // Shared corner tray, also used by the theme toggle. Whichever script runs
  // first creates it.
  function corner() {
    let c = document.getElementById("pk-corner");
    if (!c) {
      c = document.createElement("div");
      c.id = "pk-corner";
      c.className = "pk-corner";
      document.body.appendChild(c);
    }
    return c;
  }

  function mount() {
    if (document.getElementById("sound-toggle")) return;
    const btn = document.createElement("button");
    btn.id = "sound-toggle";
    btn.className = "corner-btn sound-toggle";
    btn.type = "button";
    btn.addEventListener("click", function () { set(!muted); });
    corner().appendChild(btn);
    apply();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }

  window.PokeSound = {
    isMuted: function () { return muted; },
    set: set,
    toggle: function () { set(!muted); },
  };
})();

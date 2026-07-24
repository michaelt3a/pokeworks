// Light/dark theme for the whole arcade. Loaded in <head> on every page so the
// theme lands before first paint (no flash), then drops a sun/moon toggle into
// the top-right corner once the body exists.
(function () {
  var KEY = "pokeworks-theme";
  var root = document.documentElement;

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function remember(t) {
    try { localStorage.setItem(KEY, t); } catch (e) { /* ignore */ }
  }
  // Saved choice wins; otherwise follow the OS, defaulting to the original dark look.
  function initial() {
    var s = stored();
    if (s === "light" || s === "dark") return s;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }

  function apply(t) {
    root.setAttribute("data-theme", t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t === "light" ? "#f3efe6" : "#0a1010");
    var btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.setAttribute("aria-label", "Switch to " + (t === "light" ? "dark" : "light") + " mode");
      btn.setAttribute("aria-pressed", String(t === "dark"));
    }
  }

  apply(initial()); // before paint

  // Sun -> moon: the rays retract, and a cut-out circle slides across the disc
  // to carve it into a crescent. Both are CSS transitions (see theme.css).
  var RAYS = [
    [20.5, 12, 22.5, 12],
    [18.0, 6.0, 19.4, 4.6],
    [12, 3.5, 12, 1.5],
    [6.0, 6.0, 4.6, 4.6],
    [3.5, 12, 1.5, 12],
    [6.0, 18.0, 4.6, 19.4],
    [12, 20.5, 12, 22.5],
    [18.0, 18.0, 19.4, 19.4],
  ];

  function svg() {
    var lines = RAYS.map(function (r) {
      return '<line x1="' + r[0] + '" y1="' + r[1] + '" x2="' + r[2] + '" y2="' + r[3] + '"/>';
    }).join("");
    return (
      '<svg class="tt-svg" viewBox="0 0 24 24" aria-hidden="true">' +
      '<mask id="tt-mask">' +
      '<rect x="-8" y="-8" width="40" height="40" fill="#fff"/>' +
      '<circle class="tt-cut" cx="14.5" cy="9.5" r="6.5" fill="#000"/>' +
      "</mask>" +
      '<g class="tt-stars">' +
      '<circle cx="20" cy="4" r="1"/><circle cx="4.5" cy="19" r="0.8"/>' +
      "</g>" +
      '<circle class="tt-orb" cx="12" cy="12" r="6.5" mask="url(#tt-mask)"/>' +
      '<g class="tt-rays" fill="none">' + lines + "</g>" +
      "</svg>"
    );
  }

  // Shared corner tray, also used by the mute button. Whichever script runs
  // first creates it.
  function corner() {
    var c = document.getElementById("pk-corner");
    if (!c) {
      c = document.createElement("div");
      c.id = "pk-corner";
      c.className = "pk-corner";
      document.body.appendChild(c);
    }
    return c;
  }

  function mount() {
    if (document.getElementById("theme-toggle")) return;
    var btn = document.createElement("button");
    btn.id = "theme-toggle";
    btn.className = "corner-btn theme-toggle";
    btn.type = "button";
    btn.innerHTML = svg();
    btn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      remember(next);
      apply(next);
    });
    corner().appendChild(btn);
    apply(root.getAttribute("data-theme")); // label the freshly-made button
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }

  // Follow the OS if the player has never picked a side themselves.
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: light)");
    var onChange = function (e) { if (!stored()) apply(e.matches ? "light" : "dark"); };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
})();

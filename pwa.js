// Registers the service worker so the arcade can be installed to a home screen
// and played offline. Only over http(s) — opening the files directly won't work.
(function () {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "http:" && location.protocol !== "https:") return;

  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").catch(function () {
      /* offline support is a bonus; the site works fine without it */
    });
  });
})();

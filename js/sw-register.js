// Service Worker registration & update banner logic
// Extracted from inline script for CSP compliance
(function () {
  // SW update banner buttons (replacing inline onclick handlers)
  var reloadBtn = document.getElementById("btn-sw-reload");
  var dismissBtn = document.getElementById("btn-sw-dismiss");
  if (reloadBtn) reloadBtn.addEventListener("click", function () { location.reload(); });
  if (dismissBtn) dismissBtn.addEventListener("click", function () {
    this.parentElement.classList.add("hidden");
  });

  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.register("sw.js").then(function (reg) {
    setInterval(function () { reg.update(); }, 3600000);
  }).catch(function () { });

  var _swUpdatePending = false;
  var _swIdleTimer = null;
  var _SW_IDLE_DELAY = 5 * 60 * 1000; // 5 minutes

  function _swResetIdleTimer() {
    if (!_swUpdatePending) return;
    clearTimeout(_swIdleTimer);
    _swIdleTimer = setTimeout(function () {
      if (typeof App !== "undefined" && App && App._timerInterval) return;
      location.reload();
    }, _SW_IDLE_DELAY);
  }

  navigator.serviceWorker.addEventListener("message", function (e) {
    if (e.data && e.data.type === "SW_UPDATED") {
      var banner = document.getElementById("sw-update-banner");
      if (banner) banner.classList.remove("hidden");
      _swUpdatePending = true;
      ["pointerdown", "keydown", "scroll", "touchstart"].forEach(function (evt) {
        document.addEventListener(evt, _swResetIdleTimer, { passive: true, once: false });
      });
      _swResetIdleTimer();
    }
  });
})();

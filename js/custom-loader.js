// Rally Photo — Load custom rallies from localStorage into RALLIES[]
// Loaded after built-in rally files, before other modules.
(function () {
  try {
    var raw = localStorage.getItem("rallyPhoto_customRallies");
    if (!raw) return;
    var customs = JSON.parse(raw);
    if (!Array.isArray(customs)) return;
    customs.forEach(function (rally) {
      if (RALLIES.find(function (r) { return r.id === rally.id; })) return;
      rally._custom = true;
      RALLIES.push(rally);
    });
  } catch (e) {
    console.warn("[Rally Photo] Erreur chargement rallyes personnalises:", e);
  }
})();

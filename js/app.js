// Rally Photo — App Initialization & Navigation

// --- Sound Effects (Web Audio API) ---
const SoundFX = {
  _ctx: null,
  _enabled: true,

  _getCtx() {
    if (!this._ctx) {
      try {
        this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        this._enabled = false;
      }
    }
    return this._ctx;
  },

  _playTone(frequency, duration, type, volume) {
    if (!this._enabled) return;
    const ctx = this._getCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(volume || 0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  },

  playValidation() {
    this._playTone(523, 0.15, "sine", 0.25);
    setTimeout(() => this._playTone(659, 0.2, "sine", 0.25), 120);
    setTimeout(() => this._playTone(784, 0.3, "sine", 0.2), 240);
  },

  playBonus() {
    this._playTone(784, 0.1, "triangle", 0.2);
    setTimeout(() => this._playTone(988, 0.1, "triangle", 0.2), 100);
    setTimeout(() => this._playTone(1175, 0.25, "triangle", 0.2), 200);
    setTimeout(() => this._playTone(1568, 0.3, "triangle", 0.15), 300);
  },

  playFinish() {
    this._playTone(523, 0.2, "square", 0.15);
    setTimeout(() => this._playTone(659, 0.2, "square", 0.15), 200);
    setTimeout(() => this._playTone(784, 0.2, "square", 0.15), 400);
    setTimeout(() => this._playTone(1047, 0.5, "square", 0.2), 600);
  },

  playQuizCorrect() {
    this._playTone(659, 0.12, "triangle", 0.2);
    setTimeout(() => this._playTone(880, 0.12, "triangle", 0.2), 100);
    setTimeout(() => this._playTone(1047, 0.25, "triangle", 0.2), 200);
  },

  playQuizWrong() {
    this._playTone(330, 0.15, "sawtooth", 0.15);
    setTimeout(() => this._playTone(277, 0.3, "sawtooth", 0.15), 150);
  },
};

const App = {
  _currentScreen: null,
  _mapInitialized: false,
  _timerInterval: null,
  _proximityNotified: {},
  _checkpointListOpen: false,
  _retakeCpId: null,
  _deferredInstallPrompt: null,
  _lastBackupReminder: 0,

  init() {
    // Migrate legacy storage keys (one-time, for existing Normandie users)
    this._migrateStorageKeys();

    this._restoreTheme();
    Photos.init();

    // --- Event listeners ---
    document.getElementById("btn-start").addEventListener("click", () => this._startGame());
    document.getElementById("btn-gallery").addEventListener("click", () => this.showScreen("gallery"));
    document.getElementById("btn-back-map").addEventListener("click", () => this.showScreen("game"));
    document.getElementById("btn-back-map-2").addEventListener("click", () => this.showScreen("game"));
    document.getElementById("btn-take-photo").addEventListener("click", () => Photos.openCamera("main"));
    document.getElementById("btn-take-bonus").addEventListener("click", () => Photos.openCamera("bonus"));
    document.getElementById("btn-validate").addEventListener("click", () => this._validateCheckpoint());
    document.getElementById("btn-validate-bonus").addEventListener("click", () => this._validateBonus());
    document.getElementById("btn-open-quiz").addEventListener("click", () => this._openQuiz());
    document.getElementById("btn-close-panel").addEventListener("click", () => this._closePanel());
    document.getElementById("btn-navigate").addEventListener("click", () => this._navigateToCheckpoint());
    document.getElementById("lightbox-close").addEventListener("click", () => Photos.closeLightbox());
    document.getElementById("lightbox").addEventListener("click", (e) => {
      if (e.target.id === "lightbox") Photos.closeLightbox();
    });
    document.getElementById("btn-new-rally").addEventListener("click", () => this._resetGame());
    document.getElementById("btn-export").addEventListener("click", () => this._exportRally());
    document.getElementById("btn-export-pdf").addEventListener("click", () => this._exportPDF());
    document.getElementById("btn-checkpoint-list").addEventListener("click", () => this._toggleCheckpointList());
    document.getElementById("btn-close-cplist").addEventListener("click", () => this._toggleCheckpointList());
    document.getElementById("btn-center-user").addEventListener("click", () => RallyMap.centerOnUser());
    document.getElementById("btn-download-tiles").addEventListener("click", () => this._downloadTiles());
    document.getElementById("btn-leaderboard").addEventListener("click", () => this.showScreen("leaderboard"));
    document.getElementById("btn-back-map-3").addEventListener("click", () => {
      const state = GameState.get();
      this.showScreen(state.started ? "game" : "welcome");
    });
    document.getElementById("btn-toggle-gps").addEventListener("click", () => this._toggleGps());
    document.getElementById("btn-dark-mode").addEventListener("click", () => this._toggleDarkMode());
    document.getElementById("btn-achievements").addEventListener("click", () => this.showScreen("achievements"));
    document.getElementById("btn-back-from-ach").addEventListener("click", () => this.showScreen("game"));
    document.getElementById("btn-stats").addEventListener("click", () => this.showScreen("stats"));
    document.getElementById("btn-back-from-stats").addEventListener("click", () => this.showScreen("game"));
    document.getElementById("btn-share").addEventListener("click", () => this._shareRally());
    document.getElementById("btn-retake-photo").addEventListener("click", () => this._retakePhoto());
    document.getElementById("btn-export-data").addEventListener("click", () => this._exportData());
    document.getElementById("btn-import-data").addEventListener("click", () => document.getElementById("import-file-input").click());
    document.getElementById("import-file-input").addEventListener("change", (e) => this._importData(e));
    document.getElementById("btn-backup-finish").addEventListener("click", async () => {
      await this._exportData();
      const reminder = document.getElementById("finish-backup-reminder");
      reminder.classList.add("done");
      reminder.querySelector("strong").textContent = "Donnees sauvegardees !";
      reminder.querySelector("p").textContent = "Vous pouvez lancer un nouveau rally en toute securite.";
      reminder.querySelector("button").classList.add("hidden");
    });
    document.getElementById("lightbox-prev").addEventListener("click", () => Photos.lightboxNav(-1));
    document.getElementById("lightbox-next").addEventListener("click", () => Photos.lightboxNav(1));
    document.getElementById("lightbox-delete").addEventListener("click", () => Photos.deleteCurrentPhoto());
    document.getElementById("btn-change-rally").addEventListener("click", () => this._goToRallySelection());
    document.getElementById("btn-use-hint").addEventListener("click", () => this._useHint());
    document.getElementById("btn-uncomplete").addEventListener("click", () => this._uncompleteCheckpoint());

    // Backup reminder banner
    document.getElementById("btn-backup-reminder").addEventListener("click", async () => {
      await this._exportData();
      document.getElementById("backup-reminder").classList.add("hidden");
    });
    document.getElementById("btn-dismiss-backup").addEventListener("click", () => {
      document.getElementById("backup-reminder").classList.add("hidden");
    });

    // Tile cache management dialog
    document.getElementById("btn-tile-cache-close").addEventListener("click", () => {
      document.getElementById("tile-cache-dialog").classList.add("hidden");
    });
    document.getElementById("btn-tile-cache-clear").addEventListener("click", () => this._clearTileCache());
    document.getElementById("btn-tile-cache-refresh").addEventListener("click", () => {
      document.getElementById("tile-cache-dialog").classList.add("hidden");
      this._startTileDownload();
    });

    // Notes auto-save (debounced) with save indicator
    let noteTimer = null;
    let noteSavedTimer = null;
    const noteInput = document.getElementById("cp-note-input");
    const noteCount = document.getElementById("cp-note-count");
    const noteSaved = document.getElementById("cp-note-saved");

    const _saveNote = () => {
      const cpId = parseInt(document.getElementById("checkpoint-panel").dataset.cpId, 10);
      if (cpId && GameState.isCompleted(cpId)) {
        GameState.setNote(cpId, noteInput.value);
        // Show save indicator
        noteSaved.classList.remove("hidden");
        noteSaved.classList.add("visible");
        clearTimeout(noteSavedTimer);
        noteSavedTimer = setTimeout(() => {
          noteSaved.classList.remove("visible");
        }, 1500);
      }
    };

    noteInput.addEventListener("input", () => {
      noteCount.textContent = noteInput.value.length + " / 500";
      clearTimeout(noteTimer);
      noteTimer = setTimeout(_saveNote, 600);
    });
    // Save note on panel close / blur
    noteInput.addEventListener("blur", () => {
      clearTimeout(noteTimer);
      _saveNote();
    });

    // Photo quality selector
    document.getElementById("photo-quality-select").addEventListener("click", (e) => {
      const btn = e.target.closest(".quality-option");
      if (!btn) return;
      document.querySelectorAll(".quality-option").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      localStorage.setItem("rallyPhotoQuality", btn.dataset.quality);
      Photos.setQuality(btn.dataset.quality);
    });
    // Restore saved quality
    const savedQuality = localStorage.getItem("rallyPhotoQuality") || "medium";
    document.querySelectorAll(".quality-option").forEach(b => {
      b.classList.toggle("active", b.dataset.quality === savedQuality);
    });
    Photos.setQuality(savedQuality);

    // Enter key on team name
    document.getElementById("team-name").addEventListener("keydown", (e) => {
      if (e.key === "Enter") this._startGame();
    });

    // Keyboard navigation
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        // Close in priority order: share/join modals > confirm dialog > lightbox > checkpoint panel > checkpoint list
        const shareDialog = document.getElementById("share-rally-dialog");
        if (!shareDialog.classList.contains("hidden")) {
          shareDialog.classList.add("hidden");
          return;
        }
        const joinDialog = document.getElementById("join-rally-dialog");
        if (!joinDialog.classList.contains("hidden")) {
          joinDialog.classList.add("hidden");
          return;
        }
        const joinConfirm = document.getElementById("join-confirm-dialog");
        if (!joinConfirm.classList.contains("hidden")) {
          this._cancelJoinRally();
          return;
        }
        const tileCacheDialog = document.getElementById("tile-cache-dialog");
        if (!tileCacheDialog.classList.contains("hidden")) {
          tileCacheDialog.classList.add("hidden");
          return;
        }
        const confirm = document.getElementById("confirm-dialog");
        if (!confirm.classList.contains("hidden")) {
          document.getElementById("confirm-cancel").click();
          return;
        }
        const lb = document.getElementById("lightbox");
        if (!lb.classList.contains("hidden")) {
          Photos.closeLightbox();
          return;
        }
        const panel = document.getElementById("checkpoint-panel");
        if (!panel.classList.contains("hidden")) {
          this._closePanel();
          return;
        }
        if (this._checkpointListOpen) {
          this._toggleCheckpointList();
          return;
        }
      }
      const lb = document.getElementById("lightbox");
      if (!lb.classList.contains("hidden")) {
        if (e.key === "ArrowLeft") Photos.lightboxNav(-1);
        else if (e.key === "ArrowRight") Photos.lightboxNav(1);
      }
    });

    // PWA install prompt
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      this._deferredInstallPrompt = e;
      document.getElementById("btn-install-pwa").classList.remove("hidden");
    });
    document.getElementById("btn-install-pwa").addEventListener("click", async () => {
      if (!this._deferredInstallPrompt) return;
      this._deferredInstallPrompt.prompt();
      const result = await this._deferredInstallPrompt.userChoice;
      if (result.outcome === "accepted") {
        document.getElementById("btn-install-pwa").classList.add("hidden");
      }
      this._deferredInstallPrompt = null;
    });

    // Offline/online indicator
    const offlineBar = document.getElementById("offline-bar");
    const updateOnlineStatus = () => {
      if (!navigator.onLine) {
        offlineBar.classList.remove("hidden");
      } else {
        offlineBar.classList.add("hidden");
      }
      if (this._currentScreen === "game") this._updateTileButton();
    };
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    updateOnlineStatus();

    // Swipe down to close panel
    this._initSwipe();

    // Migrate legacy localStorage photos to IndexedDB (one-time)
    this._migrateLegacyPhotos();

    // --- Onboarding for first-time users ---
    this._initOnboarding();

    // --- Custom rally editor ---
    RallyEditor.init();

    // --- Join from shared URL ---
    this._bindJoinEvents();
    if (this._checkJoinUrl()) return;

    // --- Shortcut: open editor from manifest shortcut ---
    if (window.location.hash === "#/editor") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
      RallyEditor.init && RallyEditor.init();
      this.showScreen("editor-list");
      return;
    }

    // --- Rally selection logic ---
    const lastRally = localStorage.getItem("rallyPhoto_lastRally");
    if (lastRally && RALLIES.find(r => r.id === lastRally)) {
      this._selectRally(lastRally);
    } else if (RALLIES.length === 1) {
      this._selectRally(RALLIES[0].id);
    } else {
      this.showScreen("select");
    }
  },

  // --- Rally selection ---
  _renderRallySelection() {
    const container = document.getElementById("rally-cards");
    container.innerHTML = "";
    RALLIES.forEach(rally => {
      const card = document.createElement("div");
      card.className = "rally-card";

      const totalPts = rally.checkpoints.reduce((s, c) => s + c.points, 0);
      const totalBonus = rally.checkpoints.reduce((s, c) => s + (c.bonusPoints || 0), 0);

      // Check existing progress
      const savedState = localStorage.getItem("rallyPhoto_" + rally.id);
      let progressHtml = "";
      if (savedState) {
        try {
          const state = JSON.parse(savedState);
          const completed = Object.keys(state.completed || {}).length;
          if (state.finished) {
            progressHtml = '<span class="rally-card-progress finished">Termine !</span>';
          } else if (completed > 0) {
            progressHtml = `<span class="rally-card-progress">${completed}/${rally.checkpoints.length} etapes</span>`;
          }
        } catch {}
      }

      card.innerHTML = `
        <div class="rally-card-color" style="background: linear-gradient(135deg, ${_escAttr(rally.theme.primary)}, ${_escAttr(rally.theme.primaryLight || rally.theme.primary)})">
          <span class="rally-card-count">${rally.checkpoints.length} etapes</span>
          ${rally._custom ? '<span class="rally-card-custom-badge">Personnalise</span>' : ''}
        </div>
        <div class="rally-card-body">
          <h3>${_esc(rally.name)}</h3>
          <p>${_esc(rally.subtitle || '')}</p>
          <span class="rally-card-pts">${totalPts + totalBonus} pts max</span>
          ${progressHtml}
        </div>
      `;
      card.addEventListener("click", () => this._selectRally(rally.id));

      // Share button on each rally card
      const shareBtn = document.createElement("button");
      shareBtn.className = "btn btn-outline btn-small rally-card-share";
      shareBtn.textContent = "Partager";
      shareBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        RallyEditor.shareRally(rally.id);
      });
      card.querySelector(".rally-card-body").appendChild(shareBtn);

      container.appendChild(card);
    });

    // "Create a rally" card
    const createCard = document.createElement("div");
    createCard.className = "rally-card rally-card-create";
    createCard.innerHTML = `
      <div class="rally-card-body" style="text-align:center;padding:1.5rem 1rem">
        <span style="font-size:2rem;line-height:1">+</span>
        <p style="margin-top:0.3rem;font-weight:600">Creer un rally</p>
      </div>
    `;
    createCard.addEventListener("click", () => App.showScreen("editor-list"));
    container.appendChild(createCard);
  },

  _selectRally(rallyId) {
    setCurrentRally(rallyId);
    localStorage.setItem("rallyPhoto_lastRally", rallyId);
    this._applyRallyTheme();

    // Force map reinit on next game screen
    if (this._mapInitialized) {
      RallyMap.destroy();
      this._mapInitialized = false;
    }

    // Load state for this rally
    GameState.load();
    Teams.load();

    // Populate welcome screen
    this._populateWelcome();
    this._checkStorageQuota();

    // Show/hide change rally button
    document.getElementById("btn-change-rally").classList.toggle("hidden", RALLIES.length <= 1);

    const state = GameState.get();
    if (state.started && !state.finished) {
      this.showScreen("welcome");
      this._showResumePrompt(state.teamName);
    } else if (state.finished) {
      this.showScreen("finish");
    } else {
      this.showScreen("welcome");
    }
  },

  _populateWelcome() {
    if (!currentRally) return;
    document.getElementById("welcome-title").innerHTML = _esc(currentRally.name).replace(/(Rally Photo)\s+/, "$1<br/>");
    document.getElementById("welcome-subtitle").textContent = currentRally.subtitle;
    document.getElementById("welcome-rules-text").textContent =
      `${currentRally.rulesIntro} ${currentRally.rulesHighlight}. A chaque etape, prenez une photo comme preuve de votre passage. Validez chaque arret pour gagner des points et debloquer la prochaine destination. Des defis bonus vous rapportent des points supplementaires !`;
    document.title = currentRally.name;
  },

  _goToRallySelection() {
    this._resetRallyTheme();
    localStorage.removeItem("rallyPhoto_lastRally");
    if (this._mapInitialized) {
      RallyMap.destroy();
      this._mapInitialized = false;
    }
    this.showScreen("select");
  },

  // --- Join rally from shared URL ---
  _checkJoinUrl() {
    const hash = window.location.hash;
    if (!hash || !hash.startsWith("#/join/")) return false;

    const compressed = hash.substring(7);
    if (!compressed) return false;

    try {
      const json = LZString.decompressFromEncodedURIComponent(compressed);
      if (!json) {
        this._showToast("Lien de rally invalide");
        this._clearJoinHash();
        return false;
      }
      const rallyData = JSON.parse(json);
      if (!rallyData || !rallyData.name || !rallyData.checkpoints || rallyData.checkpoints.length < 2) {
        this._showToast("Donnees de rally invalides");
        this._clearJoinHash();
        return false;
      }
      const validErr = _validateRallyData(rallyData);
      if (validErr) {
        this._showToast(validErr);
        this._clearJoinHash();
        return false;
      }
      this._pendingJoinRally = rallyData;
      this._showJoinConfirmation(rallyData);
      return true;
    } catch (e) {
      console.error("[Rally Photo] Erreur decodage lien:", e);
      this._showToast("Lien de rally invalide");
      this._clearJoinHash();
      return false;
    }
  },

  _clearJoinHash() {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  },

  _showJoinConfirmation(rallyData) {
    const totalPts = rallyData.checkpoints.reduce((s, c) => s + c.points + (c.bonusPoints || 0), 0);
    const preview = document.getElementById("join-confirm-preview");
    preview.innerHTML =
      '<div class="join-preview-name">' + _esc(rallyData.name) + '</div>' +
      '<div class="join-preview-stats">' +
        (rallyData.subtitle ? _esc(rallyData.subtitle) + '<br>' : '') +
        rallyData.checkpoints.length + ' etapes &middot; ' + totalPts + ' pts max' +
      '</div>';
    document.getElementById("join-confirm-dialog").classList.remove("hidden");
  },

  _acceptJoinRally() {
    if (!this._pendingJoinRally) return;
    const rallyData = this._pendingJoinRally;
    this._pendingJoinRally = null;

    // Check if this rally already exists (by source ID, or by own ID)
    const sourceId = rallyData._sourceId || rallyData.id;
    const existing = sourceId
      ? RALLIES.find(r => r._custom && (r.id === sourceId || r._sourceId === sourceId))
      : null;
    if (existing) {
      this._clearJoinHash();
      document.getElementById("join-confirm-dialog").classList.add("hidden");
      this._selectRally(existing.id);
      this._showToast("Ce rally est deja importe !");
      return;
    }

    // Build custom rally
    rallyData.id = "custom_" + Date.now();
    rallyData._custom = true;
    rallyData._createdAt = new Date().toISOString();
    rallyData._updatedAt = rallyData._createdAt;
    rallyData.checkpoints.forEach((cp, i) => { cp.id = i + 1; });
    if (!rallyData.shortName) rallyData.shortName = rallyData.name.substring(0, 20);
    if (!rallyData.mapCenter) {
      const placed = rallyData.checkpoints.filter(c => c.lat && c.lng);
      if (placed.length) {
        rallyData.mapCenter = [
          placed.reduce((s, c) => s + c.lat, 0) / placed.length,
          placed.reduce((s, c) => s + c.lng, 0) / placed.length,
        ];
      } else {
        rallyData.mapCenter = [46.8, 2.3];
      }
    }
    if (!rallyData.mapZoom) rallyData.mapZoom = 10;
    if (!rallyData.theme) rallyData.theme = { primary: "#1e3a5f", primaryLight: "#2c5282", accent: "#d97706", accentLight: "#fbbf24" };
    if (!rallyData.rulesIntro) rallyData.rulesIntro = "Suivez le parcours a travers";
    if (!rallyData.rulesHighlight) rallyData.rulesHighlight = rallyData.checkpoints.length + " etapes";

    RallyEditor._saveRally(rallyData);

    this._clearJoinHash();
    document.getElementById("join-confirm-dialog").classList.add("hidden");
    this._showToast("Rally importe : " + rallyData.name);
    this._selectRally(rallyData.id);
  },

  _cancelJoinRally() {
    this._pendingJoinRally = null;
    this._clearJoinHash();
    document.getElementById("join-confirm-dialog").classList.add("hidden");
    // Show selection screen since we interrupted init
    if (RALLIES.length === 1) {
      this._selectRally(RALLIES[0].id);
    } else {
      this.showScreen("select");
    }
  },

  _bindJoinEvents() {
    // Join confirmation dialog
    document.getElementById("btn-accept-join").addEventListener("click", () => this._acceptJoinRally());
    document.getElementById("btn-cancel-join-confirm").addEventListener("click", () => this._cancelJoinRally());

    // "Rejoindre un rally" button on selection screen
    document.getElementById("btn-join-rally").addEventListener("click", () => {
      document.getElementById("join-rally-dialog").classList.remove("hidden");
      document.getElementById("join-link-input").value = "";
      document.getElementById("join-link-input").focus();
    });

    // "Rejoindre" from pasted link
    document.getElementById("btn-confirm-join-link").addEventListener("click", () => {
      const input = document.getElementById("join-link-input").value.trim();
      if (!input) return;
      const hashIdx = input.indexOf("#/join/");
      if (hashIdx === -1) {
        this._showToast("Lien invalide. Le lien doit contenir #/join/...");
        return;
      }
      const compressed = input.substring(hashIdx + 7);
      document.getElementById("join-rally-dialog").classList.add("hidden");
      window.location.hash = "#/join/" + compressed;
      this._checkJoinUrl();
    });

    document.getElementById("btn-cancel-join").addEventListener("click", () => {
      document.getElementById("join-rally-dialog").classList.add("hidden");
    });
  },

  // --- Rally theming ---
  _applyRallyTheme() {
    if (!currentRally || !currentRally.theme) return;
    const root = document.documentElement;
    const t = currentRally.theme;
    const safe = (c) => /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : null;
    if (safe(t.primary)) root.style.setProperty("--blue", t.primary);
    if (safe(t.primaryLight)) root.style.setProperty("--blue-light", t.primaryLight);
    if (safe(t.accent)) root.style.setProperty("--gold", t.accent);
    if (safe(t.accentLight)) root.style.setProperty("--gold-light", t.accentLight);
    // Update meta theme-color
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && safe(t.primary)) meta.setAttribute("content", t.primary);
  },

  _resetRallyTheme() {
    const root = document.documentElement;
    root.style.removeProperty("--blue");
    root.style.removeProperty("--blue-light");
    root.style.removeProperty("--gold");
    root.style.removeProperty("--gold-light");
  },

  showScreen(name) {
    document.querySelectorAll(".screen").forEach((el) => el.classList.add("hidden"));
    const screen = document.getElementById("screen-" + name);
    screen.classList.remove("hidden");
    this._currentScreen = name;

    if (name === "select") {
      this._renderRallySelection();
    }

    if (name === "editor-list") {
      RallyEditor._renderCustomRallyList();
    }

    if (name === "game") {
      if (!this._mapInitialized) {
        RallyMap.init();
        this._mapInitialized = true;
      }
      RallyMap.invalidateSize();
      RallyMap.refreshMarkers();
      this._updateHUD();
      this._closePanel();
      const state = GameState.get();
      if (!state.finished) {
        this._startTimer();
      } else {
        // Show final elapsed time, don't tick
        document.getElementById("hud-timer").textContent = formatElapsed(GameState.getElapsedTime());
      }
      setTimeout(() => RallyMap.fitAll(), 200);
      this._updateTileButton();
    } else {
      this._stopTimer();
    }

    if (name === "gallery") {
      Photos.renderGallery();
    }

    if (name === "finish") {
      this._renderFinish();
    }

    if (name === "leaderboard") {
      this._renderLeaderboard();
    }

    if (name === "achievements") {
      this._renderAchievements();
    }

    if (name === "stats") {
      this._renderStats();
    }
  },

  // --- Timer ---
  _startTimer() {
    this._stopTimer();
    const timerEl = document.getElementById("hud-timer");
    this._timerInterval = setInterval(() => {
      const elapsed = GameState.getElapsedTime();
      timerEl.textContent = formatElapsed(elapsed);
    }, 1000);
    // immediate update
    timerEl.textContent = formatElapsed(GameState.getElapsedTime());
  },

  _stopTimer() {
    if (this._timerInterval) {
      clearInterval(this._timerInterval);
      this._timerInterval = null;
    }
  },

  // --- Game start ---
  _startGame() {
    const input = document.getElementById("team-name");
    const teamName = input.value.trim();
    if (!teamName) {
      input.classList.add("shake");
      input.focus();
      setTimeout(() => input.classList.remove("shake"), 500);
      return;
    }
    const freeMode = document.getElementById("free-mode-toggle").checked;
    GameState.startGame(teamName, freeMode);
    this.showScreen("game");
  },

  // --- HUD ---
  _updateHUD() {
    const state = GameState.get();
    const completed = GameState.getCompletedCount();
    const total = CHECKPOINTS.length;
    const pct = Math.round((completed / total) * 100);

    document.getElementById("hud-team").textContent = state.teamName;
    document.getElementById("hud-score").textContent = GameState.getTotalScore();
    document.getElementById("hud-progress-fill").style.width = pct + "%";
    document.getElementById("hud-progress-text").textContent = `${completed} / ${total}`;

    // ETA: estimate remaining time based on average pace
    const etaEl = document.getElementById("hud-eta");
    if (completed >= 2 && completed < total && !state.finished) {
      const elapsed = GameState.getElapsedTime();
      const avgPerCp = elapsed / completed;
      const remaining = (total - completed) * avgPerCp;
      etaEl.textContent = "~" + formatElapsed(remaining) + " restant";
    } else {
      etaEl.textContent = "";
    }
  },

  // --- Checkpoint Panel ---
  async openCheckpointPanel(cpId) {
    const cp = CHECKPOINTS.find((c) => c.id === cpId);
    if (!cp) return;

    const state = GameState.get();
    const panel = document.getElementById("checkpoint-panel");
    const isCompleted = GameState.isCompleted(cpId);
    const isCurrent = GameState.isCurrent(cpId);
    const isLocked = GameState.isLocked(cpId);

    document.getElementById("cp-name").textContent = cp.name;
    document.getElementById("cp-desc").textContent = cp.description;
    document.getElementById("cp-points").textContent = "Etape " + cp.id + "/" + CHECKPOINTS.length + " \u2022 " + cp.points + " pts";
    document.getElementById("cp-hint").textContent = cp.photoHint;

    // Structured info
    const infoEl = document.getElementById("cp-info");
    infoEl.innerHTML = this._renderInfo(cp.info);
    infoEl.classList.toggle("hidden", !cp.info || Object.keys(cp.info).length === 0);

    // Status badge
    const badge = document.getElementById("cp-status");
    if (isCompleted) {
      badge.textContent = "Valide";
      badge.className = "cp-badge completed";
    } else if (isCurrent) {
      badge.textContent = "Etape actuelle";
      badge.className = "cp-badge current";
    } else {
      badge.textContent = "Verrouille";
      badge.className = "cp-badge locked";
    }

    // Progressive hints
    const hintsSection = document.getElementById("cp-hints-section");
    const hintsList = document.getElementById("cp-hints-list");
    const hintBtn = document.getElementById("btn-use-hint");
    hintsList.innerHTML = "";
    if (cp.hints && cp.hints.length > 0 && !isCompleted && !isLocked) {
      hintsSection.classList.remove("hidden");
      const used = GameState.getHintsUsed(cpId);
      for (let i = 0; i < used; i++) {
        const div = document.createElement("div");
        div.className = "cp-hint-item";
        div.textContent = cp.hints[i].text;
        hintsList.appendChild(div);
      }
      if (used < cp.hints.length) {
        const nextPenalty = cp.hints[used].penalty;
        hintBtn.textContent = "Utiliser un indice (-" + nextPenalty + " pts)";
        hintBtn.classList.remove("hidden");
      } else {
        hintBtn.classList.add("hidden");
      }
    } else {
      hintsSection.classList.add("hidden");
    }

    // Bonus challenge
    const bonusSection = document.getElementById("cp-bonus-section");
    const bonusText = document.getElementById("cp-bonus-text");
    if (cp.bonusChallenge) {
      bonusText.textContent = cp.bonusChallenge;
      bonusSection.classList.remove("hidden");
    } else {
      bonusSection.classList.add("hidden");
    }

    // Show/hide photo controls
    const photoSection = document.getElementById("cp-photo-section");
    const completedPhoto = document.getElementById("cp-completed-photo");
    const bonusControls = document.getElementById("cp-bonus-controls");

    if (isCompleted) {
      photoSection.classList.add("hidden");
      completedPhoto.classList.remove("hidden");
      // Load photo from IndexedDB (fallback to legacy localStorage data)
      const mainPhoto = await PhotoStore.getPhoto("main_" + cpId);
      completedPhoto.querySelector("img").src = mainPhoto || state.completed[cpId].photoData || "";
      // Show bonus controls if bonus not yet validated
      if (cp.bonusChallenge && !state.completed[cpId].bonusValidated) {
        bonusControls.classList.remove("hidden");
      } else {
        bonusControls.classList.add("hidden");
      }
      if (state.completed[cpId].bonusValidated) {
        bonusSection.innerHTML = '<span class="cp-badge completed" style="font-size:0.7rem">Bonus valide !</span>';
      }
    } else if (!isLocked) {
      photoSection.classList.remove("hidden");
      completedPhoto.classList.add("hidden");
      bonusControls.classList.add("hidden");
      Photos.clearPending();
    } else {
      photoSection.classList.add("hidden");
      completedPhoto.classList.add("hidden");
      bonusControls.classList.add("hidden");
    }

    // Quiz controls
    const quizControls = document.getElementById("cp-quiz-controls");
    const quizDone = document.getElementById("cp-quiz-done");
    quizControls.classList.add("hidden");
    quizDone.classList.add("hidden");

    if (isCompleted && cp.quiz) {
      const quizState = state.quizCompleted && state.quizCompleted[cpId];
      if (quizState) {
        quizDone.classList.remove("hidden");
        if (quizState.correct) {
          const pts = QUIZ_POINTS[cp.quiz.difficulty] || 0;
          quizDone.className = "cp-quiz-done correct";
          quizDone.textContent = "Quiz reussi ! +" + pts + " pts";
        } else {
          quizDone.className = "cp-quiz-done wrong";
          quizDone.textContent = "Quiz : mauvaise reponse";
        }
      } else {
        quizControls.classList.remove("hidden");
      }
    }

    // Notes personnelles (visible only for completed checkpoints)
    const notesSection = document.getElementById("cp-notes-section");
    const noteInput = document.getElementById("cp-note-input");
    const noteCount = document.getElementById("cp-note-count");
    if (isCompleted) {
      notesSection.classList.remove("hidden");
      noteInput.value = GameState.getNote(cpId);
      noteCount.textContent = noteInput.value.length + " / 500";
    } else {
      notesSection.classList.add("hidden");
    }

    // Navigation button
    document.getElementById("btn-navigate").classList.toggle("hidden", isCompleted);

    panel.dataset.cpId = cpId;
    panel.classList.remove("hidden");
    RallyMap.flyTo(cpId);
    // Focus first interactive element for keyboard accessibility
    setTimeout(() => {
      const firstBtn = panel.querySelector("button:not(.hidden):not(.cp-close), .btn:not(.hidden)");
      if (firstBtn) firstBtn.focus();
    }, 100);
  },

  _renderInfo(info) {
    if (!info) return "";
    const labels = {
      horaires: "Horaires",
      tarifs: "Tarifs",
      reouverture: "Reouverture",
      duree: "Duree visite",
      notes: "Notes",
    };
    let html = '<div class="cp-info-grid">';
    for (const [key, val] of Object.entries(info)) {
      if (!val) continue;
      const label = labels[key] || key;
      html += `<div class="cp-info-label">${_esc(label)}</div><div class="cp-info-value">${_esc(val)}</div>`;
    }
    html += "</div>";
    return html;
  },

  _closePanel() {
    document.getElementById("checkpoint-panel").classList.add("hidden");
    Photos.clearPending();
  },

  async _validateCheckpoint() {
    const panel = document.getElementById("checkpoint-panel");
    const cpId = parseInt(panel.dataset.cpId, 10);
    const photo = Photos.getPendingPhoto();
    if (!photo) return;

    await GameState.completeCheckpoint(cpId, photo);
    Photos.clearPending();
    RallyMap.refreshMarker(cpId);
    const nextCpObj = CHECKPOINTS[CHECKPOINTS.findIndex((c) => c.id === cpId) + 1];
    if (nextCpObj) RallyMap.refreshMarker(nextCpObj.id);
    RallyMap._updateRouteLine();
    this._updateHUD();
    this._vibrate([50, 30, 100]);
    SoundFX.playValidation();

    // Score pop animation
    const scoreEl = document.getElementById("hud-score");
    scoreEl.classList.remove("score-pop");
    void scoreEl.offsetWidth;
    scoreEl.classList.add("score-pop");

    const state = GameState.get();
    this._checkNewAchievements();
    if (state.finished) {
      this._vibrate([100, 50, 100, 50, 200]);
      SoundFX.playFinish();
      this._closePanel();
      setTimeout(() => this.showScreen("finish"), 600);
    } else {
      this._showToast("Checkpoint valide ! +" + CHECKPOINTS.find((c) => c.id === cpId).points + " pts");
      this._checkBackupReminder();
      // Re-open panel to show bonus controls
      this.openCheckpointPanel(cpId);
      if (!state.freeMode) {
        setTimeout(() => RallyMap.flyTo(state.currentCheckpoint), 400);
      }
    }
  },

  async _validateBonus() {
    const panel = document.getElementById("checkpoint-panel");
    const cpId = parseInt(panel.dataset.cpId, 10);
    const photo = Photos.getPendingPhoto();
    if (!photo) return;

    await GameState.validateBonus(cpId, photo);
    Photos.clearPending();
    this._updateHUD();
    this._vibrate([30, 20, 60]);
    SoundFX.playBonus();

    const scoreEl = document.getElementById("hud-score");
    scoreEl.classList.remove("score-pop");
    void scoreEl.offsetWidth;
    scoreEl.classList.add("score-pop");

    this._checkNewAchievements();
    const cp = CHECKPOINTS.find((c) => c.id === cpId);
    this._showToast("Bonus valide ! +" + (cp.bonusPoints || 0) + " pts bonus");
    this.openCheckpointPanel(cpId);
  },

  // --- Quiz ---
  _openQuiz() {
    const panel = document.getElementById("checkpoint-panel");
    const cpId = parseInt(panel.dataset.cpId, 10);
    const cp = CHECKPOINTS.find((c) => c.id === cpId);
    if (!cp || !cp.quiz) return;

    const quiz = cp.quiz;
    const overlay = document.getElementById("quiz-dialog");
    const diffLabels = { 1: "Facile", 2: "Moyen", 3: "Difficile" };
    const diffClasses = { 1: "easy", 2: "medium", 3: "hard" };
    const pts = QUIZ_POINTS[quiz.difficulty] || 0;

    const diffBadge = document.getElementById("quiz-difficulty");
    diffBadge.textContent = diffLabels[quiz.difficulty] || "Moyen";
    diffBadge.className = "quiz-difficulty-badge " + (diffClasses[quiz.difficulty] || "medium");
    document.getElementById("quiz-points-badge").textContent = pts + " pts";

    document.getElementById("quiz-question").textContent = quiz.question;

    const choicesContainer = document.getElementById("quiz-choices");
    choicesContainer.innerHTML = "";
    const feedback = document.getElementById("quiz-feedback");
    feedback.classList.add("hidden");
    feedback.className = "quiz-feedback hidden";

    quiz.choices.forEach((choice, i) => {
      const btn = document.createElement("button");
      btn.className = "quiz-choice-btn";
      btn.textContent = choice;
      btn.addEventListener("click", () => this._answerQuiz(cpId, i));
      choicesContainer.appendChild(btn);
    });

    overlay.classList.remove("hidden");
  },

  _answerQuiz(cpId, chosenIndex) {
    const cp = CHECKPOINTS.find((c) => c.id === cpId);
    if (!cp || !cp.quiz) return;

    const result = GameState.validateQuiz(cpId, chosenIndex);
    if (!result) return;

    const choicesContainer = document.getElementById("quiz-choices");
    const buttons = choicesContainer.querySelectorAll(".quiz-choice-btn");
    const feedback = document.getElementById("quiz-feedback");

    buttons.forEach((btn, i) => {
      btn.classList.add("disabled");
      if (i === cp.quiz.answer) {
        btn.classList.add(result.correct ? "correct" : "reveal-correct");
      }
      if (i === chosenIndex && !result.correct) {
        btn.classList.add("wrong");
      }
    });

    feedback.classList.remove("hidden");
    if (result.correct) {
      feedback.className = "quiz-feedback correct";
      feedback.textContent = "Bonne reponse ! +" + result.points + " pts";
      SoundFX.playQuizCorrect();
      this._vibrate([30, 20, 60]);
    } else {
      feedback.className = "quiz-feedback wrong";
      feedback.textContent = "Mauvaise reponse ! La bonne reponse etait : " + cp.quiz.choices[cp.quiz.answer];
      SoundFX.playQuizWrong();
      this._vibrate([100]);
    }

    this._updateHUD();

    if (result.correct) {
      const scoreEl = document.getElementById("hud-score");
      scoreEl.classList.remove("score-pop");
      void scoreEl.offsetWidth;
      scoreEl.classList.add("score-pop");
    }

    this._checkNewAchievements();

    setTimeout(() => {
      document.getElementById("quiz-dialog").classList.add("hidden");
      this.openCheckpointPanel(cpId);
    }, 2000);
  },

  // --- Navigation to Google/Apple Maps ---
  _navigateToCheckpoint() {
    const panel = document.getElementById("checkpoint-panel");
    const cpId = parseInt(panel.dataset.cpId, 10);
    const cp = CHECKPOINTS.find((c) => c.id === cpId);
    if (!cp) return;

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const url = isIOS
      ? `maps://maps.apple.com/?daddr=${cp.lat},${cp.lng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${cp.lat},${cp.lng}`;
    window.open(url, "_blank");
  },

  // --- Use progressive hint ---
  _useHint() {
    const panel = document.getElementById("checkpoint-panel");
    const cpId = parseInt(panel.dataset.cpId, 10);
    const hint = GameState.useHint(cpId);
    if (hint) {
      this._updateHUD();
      this._showToast("Indice revele ! -" + hint.penalty + " pts");
      this.openCheckpointPanel(cpId);
    }
  },

  // --- Swipe to close panel ---
  _initSwipe() {
    const panel = document.getElementById("checkpoint-panel");
    let startY = 0;
    let currentY = 0;
    let swiping = false;

    panel.addEventListener("touchstart", (e) => {
      if (panel.scrollTop > 0) return;
      startY = e.touches[0].clientY;
      currentY = startY;
      swiping = true;
    }, { passive: true });

    panel.addEventListener("touchmove", (e) => {
      if (!swiping) return;
      currentY = e.touches[0].clientY;
      const diff = currentY - startY;
      if (diff > 0) {
        panel.style.transform = `translateY(${diff}px)`;
      }
    }, { passive: true });

    panel.addEventListener("touchend", () => {
      if (!swiping) return;
      swiping = false;
      const diff = currentY - startY;
      if (diff > 100) {
        this._closePanel();
      }
      panel.style.transform = "";
      currentY = 0;
    });
  },

  // --- Checkpoint List ---
  _toggleCheckpointList() {
    const list = document.getElementById("checkpoint-list");
    this._checkpointListOpen = !this._checkpointListOpen;
    list.classList.toggle("hidden", !this._checkpointListOpen);
    if (this._checkpointListOpen) {
      this._renderCheckpointList();
    }
  },

  _initCpSearch() {
    if (this._cpSearchInit) return;
    this._cpSearchInit = true;
    document.getElementById("cplist-search").addEventListener("input", () => this._renderCheckpointList());
  },

  _renderCheckpointList() {
    this._initCpSearch();
    const ul = document.getElementById("cplist-items");
    ul.innerHTML = "";
    const query = (document.getElementById("cplist-search").value || "").toLowerCase().trim();
    CHECKPOINTS.filter(cp => !query || cp.name.toLowerCase().includes(query)).forEach((cp) => {
      const isCompleted = GameState.isCompleted(cp.id);
      const isCurrent = GameState.isCurrent(cp.id);
      const isLocked = GameState.isLocked(cp.id);
      const li = document.createElement("li");
      li.className = `cplist-item ${isCompleted ? "done" : isCurrent ? "active" : "locked"}`;
      const num = document.createElement("span");
      num.className = "cplist-num";
      num.textContent = cp.id;
      const name = document.createElement("span");
      name.className = "cplist-name";
      name.textContent = cp.name;
      const pts = document.createElement("span");
      pts.className = "cplist-pts";
      if (isCompleted) {
        const state = GameState.get();
        const bonusDone = state.completed[cp.id] && state.completed[cp.id].bonusValidated;
        pts.textContent = bonusDone ? "\u2713\u2B50" : "\u2713";
        if (bonusDone) pts.title = "Etape + bonus valides";
      } else {
        pts.textContent = cp.points + " pts";
      }
      li.append(num, name, pts);
      if (!isLocked) {
        li.setAttribute("tabindex", "0");
        li.setAttribute("role", "button");
        const openCp = () => {
          this._toggleCheckpointList();
          this.openCheckpointPanel(cp.id);
        };
        li.addEventListener("click", openCp);
        li.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openCp();
          }
        });
      }
      ul.appendChild(li);
    });
  },

  // --- Proximity toast ---
  showProximityToast(cp) {
    if (this._proximityNotified[cp.id]) return;
    this._proximityNotified[cp.id] = true;
    this._showToast(`Vous approchez de : ${cp.name} !`);
    // Reset after 2 minutes
    setTimeout(() => { delete this._proximityNotified[cp.id]; }, 120000);
  },

  // --- Toast queue ---
  _toastQueue: [],
  _toastActive: false,

  _showToast(message) {
    this._toastQueue.push(message);
    if (!this._toastActive) this._processToastQueue();
  },

  _processToastQueue() {
    if (this._toastQueue.length === 0) {
      this._toastActive = false;
      return;
    }
    this._toastActive = true;
    const toast = document.getElementById("toast");
    toast.textContent = this._toastQueue.shift();
    toast.classList.remove("hidden");
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => {
        toast.classList.add("hidden");
        this._processToastQueue();
      }, 300);
    }, 2500);
  },

  // --- Finish screen ---
  _renderFinish() {
    const state = GameState.get();
    document.getElementById("finish-team").textContent = state.teamName;
    const totalScore = GameState.getTotalScore();
    const maxScore = TOTAL_POINTS + TOTAL_BONUS + TOTAL_QUIZ;
    this._animateCount("finish-score", 0, totalScore, 1500, " / " + maxScore);
    document.getElementById("finish-time").textContent = formatElapsed(GameState.getElapsedTime());

    // Animate score ring
    const ringFill = document.getElementById("finish-ring-fill");
    if (ringFill) {
      const circumference = 2 * Math.PI * 52; // ~326.73
      const pct = Math.min(totalScore / maxScore, 1);
      ringFill.style.strokeDasharray = circumference;
      ringFill.style.strokeDashoffset = circumference;
      setTimeout(() => {
        ringFill.style.strokeDashoffset = circumference * (1 - pct);
      }, 100);
    }
    Photos.renderFinishMosaic();

    // Show unlocked achievements
    const achContainer = document.getElementById("finish-achievements");
    achContainer.innerHTML = "";
    const unlocked = Achievements.getUnlocked(state);
    unlocked.forEach((ach) => {
      const badge = document.createElement("span");
      badge.className = "finish-ach-badge";
      const icon = document.createElement("span");
      icon.textContent = ach.icon;
      const label = document.createElement("span");
      label.textContent = ach.name;
      badge.append(icon, label);
      achContainer.appendChild(badge);
    });

    setTimeout(() => this._launchConfetti(), 400);
  },

  // --- Animated counter ---
  _animateCount(elId, from, to, duration, suffix) {
    const el = document.getElementById(elId);
    const start = performance.now();
    const step = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(from + (to - from) * eased) + (suffix || "");
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },

  // --- Check reduced motion preference ---
  _prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  },

  // --- Confetti effect ---
  _launchConfetti() {
    if (this._prefersReducedMotion()) return;
    const canvas = document.createElement("canvas");
    canvas.id = "confetti-canvas";
    canvas.style.cssText = "position:fixed;inset:0;z-index:9999;pointer-events:none;";
    document.body.appendChild(canvas);
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext("2d");
    const colors = ["#d97706", "#fbbf24", "#16a34a", "#22c55e", "#1e3a5f", "#3b82f6", "#ef4444", "#ec4899"];
    const particles = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      w: Math.random() * 8 + 4,
      h: Math.random() * 6 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 3 + 2,
      rot: Math.random() * 360,
      rotV: (Math.random() - 0.5) * 10,
    }));
    let frame = 0;
    const maxFrames = 180;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, 1 - frame / maxFrames);
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05;
        p.rot += p.rotV;
      });
      frame++;
      if (frame < maxFrames) {
        requestAnimationFrame(animate);
      } else {
        canvas.remove();
      }
    };
    requestAnimationFrame(animate);
  },

  // --- Export rally image ---
  async _buildMosaicCanvas() {
    const state = GameState.get();
    const photos = await GameState.getPhotosWithData();
    const withData = photos.filter(p => p.photoData);
    const cols = 4;
    const rows = Math.ceil(Math.max(withData.length, 1) / cols);
    const thumbSize = 150;
    const headerH = 100;
    const canvas = document.createElement("canvas");
    canvas.width = cols * thumbSize;
    canvas.height = headerH + rows * thumbSize;
    const ctx = canvas.getContext("2d");

    // Header
    const headerColor = currentRally ? currentRally.theme.primary : "#1e3a5f";
    ctx.fillStyle = headerColor;
    ctx.fillRect(0, 0, canvas.width, headerH);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(currentRally ? currentRally.name : "Rally Photo", canvas.width / 2, 35);
    ctx.font = "18px sans-serif";
    ctx.fillStyle = "#fbbf24";
    ctx.fillText("Equipe : " + state.teamName, canvas.width / 2, 60);
    ctx.fillText("Score : " + GameState.getTotalScore() + " pts | Temps : " + formatElapsed(GameState.getElapsedTime()), canvas.width / 2, 85);

    if (withData.length === 0) return canvas;

    // Mosaic
    await Promise.all(withData.map((photo, i) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          ctx.drawImage(img, col * thumbSize, headerH + row * thumbSize, thumbSize, thumbSize);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = photo.photoData;
      });
    }));

    return canvas;
  },

  async _exportRally() {
    const canvas = await this._buildMosaicCanvas();
    this._downloadCanvas(canvas);
  },

  _downloadCanvas(canvas) {
    const link = document.createElement("a");
    link.download = "rally-photo-" + (currentRally ? currentRally.id : "export") + ".png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  },

  // --- Export PDF / printable summary ---
  async _exportPDF() {
    const state = GameState.get();
    const photos = await GameState.getPhotosWithData();
    const rallyName = currentRally ? currentRally.name : "Rally Photo";
    const totalScore = GameState.getTotalScore();
    const maxScore = TOTAL_POINTS + TOTAL_BONUS + TOTAL_QUIZ;
    const elapsed = formatElapsed(GameState.getElapsedTime());
    const completedCount = GameState.getCompletedCount();
    const total = CHECKPOINTS.length;
    const bonusCount = Object.values(state.completed).filter(c => c.bonusValidated).length;
    const unlocked = Achievements.getUnlocked(state);
    const primaryColor = currentRally && currentRally.theme ? currentRally.theme.primary : "#1e3a5f";
    const accentColor = currentRally && currentRally.theme ? currentRally.theme.accent : "#d97706";
    const dateStr = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

    // Build checkpoint rows
    let checkpointRows = "";
    for (const cp of CHECKPOINTS) {
      const done = state.completed[cp.id];
      if (!done) continue;
      const photo = photos.find(p => p.checkpoint.id === cp.id);
      const timeStr = new Date(done.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      const bonusLabel = done.bonusValidated ? "Oui" : "Non";
      const note = GameState.getNote(cp.id);
      const photoSrc = photo && photo.photoData ? photo.photoData : "";
      checkpointRows += `
        <tr>
          <td style="text-align:center;font-weight:700;color:${_escAttr(primaryColor)}">${cp.id}</td>
          <td>
            <strong>${_esc(cp.name)}</strong>
            ${note ? '<br><em style="font-size:0.8em;color:#666">' + _esc(note) + "</em>" : ""}
          </td>
          <td style="text-align:center">${cp.points} pts</td>
          <td style="text-align:center">${bonusLabel}</td>
          <td style="text-align:center;font-size:0.85em">${timeStr}</td>
          <td style="text-align:center">${photoSrc ? '<img src="' + photoSrc + '" style="width:80px;height:60px;object-fit:cover;border-radius:4px">' : "-"}</td>
        </tr>`;
    }

    // Build achievements
    let achHtml = "";
    if (unlocked.length > 0) {
      achHtml = '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:12px">';
      unlocked.forEach(a => {
        achHtml += `<span style="background:#fef3c7;padding:4px 10px;border-radius:14px;font-size:0.85em;font-weight:600;color:${_escAttr(accentColor)}">${_esc(a.icon)} ${_esc(a.name)}</span>`;
      });
      achHtml += "</div>";
    }

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>${_esc(rallyName)} - Souvenir</title>
<style>
  @page { size: A4; margin: 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif; color: #1a1a1a; font-size: 11pt; line-height: 1.5; }
  .header { background: ${_escAttr(primaryColor)}; color: #fff; padding: 24px 28px; border-radius: 10px; text-align: center; margin-bottom: 20px; }
  .header h1 { font-size: 22pt; margin-bottom: 4px; }
  .header .subtitle { font-size: 11pt; opacity: 0.85; }
  .summary { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; justify-content: center; }
  .summary-card { background: #f8f5f0; border-radius: 8px; padding: 12px 20px; text-align: center; flex: 1; min-width: 120px; }
  .summary-card .value { font-size: 16pt; font-weight: 800; color: ${_escAttr(primaryColor)}; }
  .summary-card .value.gold { color: ${_escAttr(accentColor)}; }
  .summary-card .label { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5px; color: #666; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10pt; }
  th { background: ${_escAttr(primaryColor)}; color: #fff; padding: 8px 10px; text-align: left; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.5px; }
  th:first-child { border-radius: 6px 0 0 0; }
  th:last-child { border-radius: 0 6px 0 0; }
  td { padding: 8px 10px; border-bottom: 1px solid #e5e1da; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) td { background: #fdfaf6; }
  .footer { text-align: center; font-size: 9pt; color: #999; margin-top: 20px; padding-top: 12px; border-top: 1px solid #e5e1da; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
    tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <div class="no-print" style="text-align:center;padding:16px">
    <button onclick="window.print()" style="padding:10px 28px;font-size:12pt;font-weight:700;background:${_escAttr(primaryColor)};color:#fff;border:none;border-radius:8px;cursor:pointer">Imprimer / Enregistrer en PDF</button>
  </div>
  <div class="header">
    <h1>${_esc(rallyName)}</h1>
    <div class="subtitle">Equipe <strong>${_esc(state.teamName)}</strong> &mdash; ${dateStr}</div>
  </div>
  <div class="summary">
    <div class="summary-card">
      <div class="value gold">${totalScore} / ${maxScore}</div>
      <div class="label">Score</div>
    </div>
    <div class="summary-card">
      <div class="value">${elapsed}</div>
      <div class="label">Temps total</div>
    </div>
    <div class="summary-card">
      <div class="value">${completedCount} / ${total}</div>
      <div class="label">Etapes</div>
    </div>
    <div class="summary-card">
      <div class="value gold">${bonusCount} / ${total}</div>
      <div class="label">Bonus</div>
    </div>
  </div>
  ${achHtml}
  <table>
    <thead>
      <tr>
        <th style="width:40px">#</th>
        <th>Etape</th>
        <th style="width:60px">Points</th>
        <th style="width:50px">Bonus</th>
        <th style="width:60px">Heure</th>
        <th style="width:90px">Photo</th>
      </tr>
    </thead>
    <tbody>
      ${checkpointRows}
    </tbody>
  </table>
  <div class="footer">
    ${_esc(rallyName)} &mdash; Souvenir genere le ${dateStr}
  </div>
</body>
</html>`;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      this._showToast("Autorisez les pop-ups pour exporter le PDF");
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
  },

  // --- Leaderboard ---
  _renderLeaderboard() {
    const list = document.getElementById("leaderboard-list");
    const teams = Teams.getLeaderboard();
    list.innerHTML = "";
    if (teams.length === 0) {
      list.innerHTML = '<p class="gallery-empty">Aucune equipe enregistree.</p>';
      return;
    }
    const medals = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];
    teams.forEach((team, i) => {
      const li = document.createElement("li");
      li.className = "lb-item";
      if (i < 3) {
        const medalLabels = ["Or", "Argent", "Bronze"];
        const medal = document.createElement("span");
        medal.className = "lb-medal";
        medal.textContent = medals[i];
        medal.setAttribute("role", "img");
        medal.setAttribute("aria-label", "Medaille " + medalLabels[i]);
        li.appendChild(medal);
      }
      const rank = document.createElement("span");
      rank.className = "lb-rank";
      rank.textContent = i + 1;
      const name = document.createElement("span");
      name.className = "lb-name";
      name.textContent = team.name;
      const score = document.createElement("span");
      score.className = "lb-score";
      score.textContent = team.score + " pts";
      li.append(rank, name, score);
      if (team.elapsed) {
        const elapsed = document.createElement("span");
        elapsed.className = "lb-elapsed";
        elapsed.textContent = formatElapsed(team.elapsed);
        li.appendChild(elapsed);
      }
      if (team.timestamp) {
        const time = document.createElement("span");
        time.className = "lb-time";
        time.textContent = new Date(team.timestamp).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
        li.appendChild(time);
      }
      const del = document.createElement("button");
      del.className = "lb-delete";
      del.innerHTML = "&times;";
      del.title = "Supprimer";
      del.setAttribute("aria-label", "Supprimer l'equipe " + team.name);
      del.addEventListener("click", async (e) => {
        e.stopPropagation();
        const confirmed = await this._confirm("Supprimer", `Supprimer l'equipe "${team.name}" du classement ?`);
        if (confirmed) {
          Teams.removeTeam(team.name);
          this._renderLeaderboard();
        }
      });
      li.appendChild(del);
      list.appendChild(li);
    });
  },

  // --- GPS toggle ---
  _toggleGps() {
    const btn = document.getElementById("btn-toggle-gps");
    if (RallyMap.isGpsPaused()) {
      RallyMap.resumeGeolocation();
      btn.classList.remove("gps-paused");
      btn.title = "GPS actif";
      btn.setAttribute("aria-label", "Desactiver le GPS");
      this._showToast("GPS reactive");
    } else {
      RallyMap.pauseGeolocation();
      btn.classList.add("gps-paused");
      btn.title = "GPS en pause";
      btn.setAttribute("aria-label", "Reactiver le GPS");
      document.getElementById("hud-distance").textContent = "";
      document.getElementById("hud-gps-accuracy").textContent = "";
      this._showToast("GPS en pause (economie de batterie)");
    }
  },

  // --- Offline tile download ---
  _tileCacheKey() {
    return "rallyTilesCached_" + (currentRally ? currentRally.id : "default");
  },

  _updateTileButton() {
    const btn = document.getElementById("btn-download-tiles");
    const cached = localStorage.getItem(this._tileCacheKey());
    if (!navigator.onLine) {
      btn.classList.add("hidden");
      return;
    }
    btn.classList.remove("hidden");
    if (cached) {
      btn.classList.add("tiles-cached");
      btn.title = "Carte hors-ligne prete";
      btn.setAttribute("aria-label", "Carte hors-ligne deja telechargee");
    } else {
      btn.classList.remove("tiles-cached");
      btn.title = "Telecharger la carte hors-ligne";
      btn.setAttribute("aria-label", "Telecharger la carte pour utilisation hors-ligne");
    }
  },

  _tileDownloading: false,

  async _downloadTiles() {
    if (this._tileDownloading) return;

    // If already cached, open management dialog
    if (localStorage.getItem(this._tileCacheKey())) {
      this._openTileCacheDialog();
      return;
    }

    await this._startTileDownload();
  },

  async _startTileDownload() {
    this._tileDownloading = true;
    const btn = document.getElementById("btn-download-tiles");
    const progressEl = document.getElementById("download-progress");
    btn.classList.add("downloading");
    progressEl.classList.remove("hidden");
    progressEl.textContent = "0%";

    try {
      await RallyMap.precacheTiles((done, total) => {
        const pct = Math.round((done / total) * 100);
        progressEl.textContent = pct + "%";
      });
      localStorage.setItem(this._tileCacheKey(), "1");
      this._showToast("Carte telechargee pour utilisation hors-ligne !");
    } catch {
      this._showToast("Erreur lors du telechargement de la carte");
    }

    btn.classList.remove("downloading");
    progressEl.classList.add("hidden");
    this._tileDownloading = false;
    this._updateTileButton();
  },

  async _openTileCacheDialog() {
    const dialog = document.getElementById("tile-cache-dialog");
    const statsEl = document.getElementById("tile-cache-stats");
    dialog.classList.remove("hidden");
    statsEl.innerHTML = "Calcul en cours...";

    try {
      const cache = await caches.open("rally-tiles");
      const keys = await cache.keys();
      const count = keys.length;

      // Estimate size: sample up to 20 tiles then extrapolate
      let sampleSize = 0;
      const sampleCount = Math.min(20, count);
      for (let i = 0; i < sampleCount; i++) {
        const resp = await cache.match(keys[i]);
        if (resp) {
          const blob = await resp.blob();
          sampleSize += blob.size;
        }
      }
      const avgSize = sampleCount > 0 ? sampleSize / sampleCount : 0;
      const totalSize = avgSize * count;
      const sizeMB = (totalSize / (1024 * 1024)).toFixed(1);

      statsEl.innerHTML =
        '<span class="tile-cache-size">' + sizeMB + ' Mo</span>' +
        count + ' tuiles en cache';
    } catch {
      statsEl.textContent = "Impossible de lire le cache";
    }
  },

  async _clearTileCache() {
    try {
      await caches.delete("rally-tiles");
      // Clear all rally tile cache flags
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("rallyTilesCached_")) {
          localStorage.removeItem(key);
        }
      }
      this._showToast("Cache de tuiles supprime");
    } catch {
      this._showToast("Erreur lors de la suppression du cache");
    }
    document.getElementById("tile-cache-dialog").classList.add("hidden");
    this._updateTileButton();
  },

  // --- Backup reminder (every 5 validated checkpoints) ---
  _checkBackupReminder() {
    const INTERVAL = 5;
    const completed = GameState.getCompletedCount();
    if (completed > 0 && completed % INTERVAL === 0 && completed !== this._lastBackupReminder) {
      this._lastBackupReminder = completed;
      const banner = document.getElementById("backup-reminder");
      banner.classList.remove("hidden");
      // Auto-dismiss after 15 seconds
      setTimeout(() => banner.classList.add("hidden"), 15000);
    }
  },

  // --- Storage quota indicator ---
  async _checkStorageQuota() {
    const indicator = document.getElementById("storage-indicator");
    if (!indicator) return;
    if (!navigator.storage || !navigator.storage.estimate) {
      indicator.classList.add("hidden");
      return;
    }
    try {
      const { usage, quota } = await navigator.storage.estimate();
      const pct = quota > 0 ? (usage / quota) * 100 : 0;
      const usageMB = (usage / (1024 * 1024)).toFixed(1);
      const quotaMB = (quota / (1024 * 1024)).toFixed(0);

      const fill = document.getElementById("storage-bar-fill");
      const text = document.getElementById("storage-text");
      fill.style.width = Math.min(pct, 100) + "%";

      fill.classList.remove("warning", "critical");
      text.classList.remove("warning", "critical");

      if (pct >= 90) {
        fill.classList.add("critical");
        text.classList.add("critical");
        text.textContent = "Stockage presque plein : " + usageMB + " / " + quotaMB + " Mo (" + Math.round(pct) + "%)";
      } else if (pct >= 70) {
        fill.classList.add("warning");
        text.classList.add("warning");
        text.textContent = "Stockage : " + usageMB + " / " + quotaMB + " Mo (" + Math.round(pct) + "%)";
      } else {
        text.textContent = "Stockage : " + usageMB + " / " + quotaMB + " Mo";
      }
      indicator.classList.remove("hidden");
    } catch {
      indicator.classList.add("hidden");
    }
  },

  // --- Dark mode ---
  _toggleDarkMode() {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    document.documentElement.setAttribute("data-theme", isDark ? "light" : "dark");
    localStorage.setItem("rallyTheme", isDark ? "light" : "dark");
    const btn = document.getElementById("btn-dark-mode");
    btn.innerHTML = isDark ? "&#9790;" : "&#9788;";
  },

  _restoreTheme() {
    const saved = localStorage.getItem("rallyTheme");
    if (saved === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
      const btn = document.getElementById("btn-dark-mode");
      if (btn) btn.innerHTML = "&#9788;";
    }
  },

  // --- Haptic feedback ---
  _vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  },

  // --- Achievements ---
  _renderAchievements() {
    const grid = document.getElementById("ach-grid");
    grid.innerHTML = "";
    const state = GameState.get();
    const unlocked = Achievements.getUnlocked(state).map(a => a.id);

    Achievements.getAll().forEach((ach) => {
      const isUnlocked = unlocked.includes(ach.id);
      const card = document.createElement("div");
      card.className = "ach-card" + (isUnlocked ? " unlocked" : " locked");
      const icon = document.createElement("span");
      icon.className = "ach-card-icon";
      icon.textContent = isUnlocked ? ach.icon : "?";
      icon.setAttribute("role", "img");
      icon.setAttribute("aria-label", isUnlocked ? ach.name : "Succes verrouille");
      const name = document.createElement("span");
      name.className = "ach-card-name";
      name.textContent = isUnlocked ? ach.name : "???";
      const desc = document.createElement("span");
      desc.className = "ach-card-desc";
      desc.textContent = isUnlocked ? Achievements.getDesc(ach) : (ach.hint || Achievements.getDesc(ach));
      card.append(icon, name, desc);
      grid.appendChild(card);
    });
  },

  _checkNewAchievements() {
    const state = GameState.get();
    const fresh = Achievements.getNew(state);
    if (fresh.length > 0) {
      this._showAchievementQueue(fresh);
    }
  },

  _achQueue: [],
  _achActive: false,

  _showAchievementQueue(achievements) {
    this._achQueue.push(...achievements);
    if (!this._achActive) this._processAchQueue();
  },

  _processAchQueue() {
    if (this._achQueue.length === 0) {
      this._achActive = false;
      return;
    }
    this._achActive = true;
    const ach = this._achQueue.shift();
    this._showAchievementPopup(ach, () => this._processAchQueue());
  },

  _showAchievementPopup(ach, onDone) {
    const popup = document.getElementById("ach-popup");
    document.getElementById("ach-popup-icon").textContent = ach.icon;
    document.getElementById("ach-popup-name").textContent = ach.name;
    document.getElementById("ach-popup-desc").textContent = Achievements.getDesc(ach);
    popup.classList.remove("hidden");
    popup.classList.add("show");
    this._vibrate([30, 50, 30]);
    setTimeout(() => {
      popup.classList.remove("show");
      setTimeout(() => {
        popup.classList.add("hidden");
        if (onDone) onDone();
      }, 500);
    }, 3000);
  },

  // --- Share ---
  async _shareRally() {
    const state = GameState.get();
    const rallyName = currentRally ? currentRally.name : "Rally Photo";
    const text = rallyName + "\nEquipe : " + state.teamName +
      "\nScore : " + GameState.getTotalScore() + " / " + (TOTAL_POINTS + TOTAL_BONUS + TOTAL_QUIZ) +
      " pts\nTemps : " + formatElapsed(GameState.getElapsedTime());

    if (navigator.share) {
      try {
        // Try to share with mosaic image
        const canvas = await this._buildMosaicCanvas();
        if (canvas && navigator.canShare) {
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
          const file = new File([blob], "rally-" + (currentRally ? currentRally.id : "photo") + ".png", { type: "image/png" });
          const shareData = { title: rallyName, text: text, files: [file] };
          if (navigator.canShare(shareData)) {
            await navigator.share(shareData);
            return;
          }
        }
        // Fallback: text only
        await navigator.share({ title: rallyName, text: text });
      } catch (e) {
        if (e.name !== "AbortError") {
          this._shareToClipboard(text);
        }
      }
    } else {
      this._shareToClipboard(text);
    }
  },

  _shareToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      this._showToast("Resultat copie dans le presse-papier !");
    }).catch(() => {
      this._showToast("Partage non disponible");
    });
  },

  // --- Uncomplete checkpoint ---
  async _uncompleteCheckpoint() {
    const panel = document.getElementById("checkpoint-panel");
    const cpId = parseInt(panel.dataset.cpId, 10);
    if (!cpId || !GameState.isCompleted(cpId)) return;

    const cp = CHECKPOINTS.find((c) => c.id === cpId);
    const state = GameState.get();
    const bonusDone = state.completed[cpId] && state.completed[cpId].bonusValidated;
    const quizDone = state.quizCompleted && state.quizCompleted[cpId];
    const quizPts = (quizDone && quizDone.correct && cp.quiz) ? (QUIZ_POINTS[cp.quiz.difficulty] || 0) : 0;
    const lostPoints = cp.points + (bonusDone ? (cp.bonusPoints || 0) : 0) + quizPts;

    const confirmed = await this._confirm(
      "Annuler la validation",
      `Annuler la validation de "${cp.name}" ? Vous perdrez ${lostPoints} pts et la photo associee.`
    );
    if (!confirmed) return;

    await GameState.uncompleteCheckpoint(cpId);
    RallyMap.refreshMarkers();
    this._updateHUD();
    this._showToast("Validation annulee : " + cp.name);
    this._closePanel();

    // Restart timer if game was finished and is now unfinished
    const newState = GameState.get();
    if (!newState.finished && this._currentScreen === "game") {
      this._startTimer();
    }
  },

  // --- Photo retake ---
  _retakePhoto() {
    const panel = document.getElementById("checkpoint-panel");
    const cpId = parseInt(panel.dataset.cpId, 10);
    if (!cpId || !GameState.isCompleted(cpId)) return;

    // Switch to retake mode: open camera, on photo taken replace existing
    this._retakeCpId = cpId;
    Photos.openCamera("retake");
  },

  async _handleRetake(photoData) {
    const cpId = this._retakeCpId;
    if (!cpId) return;
    await GameState.replacePhoto(cpId, photoData);
    this._retakeCpId = null;
    this._showToast("Photo remplacee !");
    this.openCheckpointPanel(cpId);
  },

  // --- Stats screen ---
  _renderStats() {
    const grid = document.getElementById("stats-grid");
    grid.innerHTML = "";
    const state = GameState.get();
    const completed = GameState.getCompletedCount();
    const total = CHECKPOINTS.length;
    const totalScore = GameState.getTotalScore();
    const maxScore = TOTAL_POINTS + TOTAL_BONUS + TOTAL_QUIZ;
    const elapsed = GameState.getElapsedTime();
    const bonusCount = Object.values(state.completed).filter(c => c.bonusValidated).length;
    const totalQuizzes = CHECKPOINTS.filter(cp => cp.quiz).length;
    const quizCorrect = state.quizCompleted ? Object.values(state.quizCompleted).filter(q => q.correct).length : 0;

    // Score card
    grid.innerHTML += `
      <div class="stat-card">
        <span class="stat-icon">&#127942;</span>
        <span class="stat-value gold">${totalScore} / ${maxScore}</span>
        <span class="stat-label">Score</span>
      </div>
      <div class="stat-card">
        <span class="stat-icon">&#9200;</span>
        <span class="stat-value">${formatElapsed(elapsed)}</span>
        <span class="stat-label">Temps ecoule</span>
      </div>
      <div class="stat-card">
        <span class="stat-icon">&#128205;</span>
        <span class="stat-value green">${completed} / ${total}</span>
        <span class="stat-label">Etapes validees</span>
      </div>
      <div class="stat-card">
        <span class="stat-icon">&#11088;</span>
        <span class="stat-value gold">${bonusCount} / ${total}</span>
        <span class="stat-label">Bonus valides</span>
      </div>
      <div class="stat-card">
        <span class="stat-icon">&#128247;</span>
        <span class="stat-value">${completed + bonusCount}</span>
        <span class="stat-label">Photos prises</span>
      </div>
      <div class="stat-card">
        <span class="stat-icon">&#9889;</span>
        <span class="stat-value">${completed > 0 && elapsed ? formatElapsed(Math.round(elapsed / completed)) : "--:--:--"}</span>
        <span class="stat-label">Temps moyen / etape</span>
      </div>
      ${totalQuizzes > 0 ? `<div class="stat-card">
        <span class="stat-icon">&#129504;</span>
        <span class="stat-value">${quizCorrect} / ${totalQuizzes}</span>
        <span class="stat-label">Quiz reussis</span>
      </div>` : ""}
    `;

    // Fastest / slowest checkpoint
    const photos = GameState.getPhotos();
    if (photos.length >= 2) {
      const sorted = [...photos].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      let fastest = null, slowest = null, fastestTime = Infinity, slowestTime = 0;
      for (let i = 1; i < sorted.length; i++) {
        const diff = new Date(sorted[i].timestamp) - new Date(sorted[i - 1].timestamp);
        if (diff < fastestTime) { fastestTime = diff; fastest = sorted[i]; }
        if (diff > slowestTime) { slowestTime = diff; slowest = sorted[i]; }
      }
      if (fastest) {
        grid.innerHTML += `
          <div class="stat-card">
            <span class="stat-icon">&#9889;</span>
            <span class="stat-value green">${formatElapsed(fastestTime)}</span>
            <span class="stat-label">Etape la plus rapide</span>
            <span class="stat-sublabel">${_esc(fastest.checkpoint.name)}</span>
          </div>`;
      }
      if (slowest) {
        grid.innerHTML += `
          <div class="stat-card">
            <span class="stat-icon">&#128034;</span>
            <span class="stat-value gold">${formatElapsed(slowestTime)}</span>
            <span class="stat-label">Etape la plus lente</span>
            <span class="stat-sublabel">${_esc(slowest.checkpoint.name)}</span>
          </div>`;
      }
    }

    // Estimated route distance
    const completedCps = CHECKPOINTS.filter(cp => GameState.isCompleted(cp.id));
    if (completedCps.length >= 2) {
      let totalDist = 0;
      for (let i = 1; i < completedCps.length; i++) {
        totalDist += RallyMap._distance(completedCps[i - 1].lat, completedCps[i - 1].lng, completedCps[i].lat, completedCps[i].lng);
      }
      const distKm = (totalDist / 1000).toFixed(1);
      grid.innerHTML += `
        <div class="stat-card">
          <span class="stat-icon">&#128663;</span>
          <span class="stat-value">${distKm} km</span>
          <span class="stat-label">Distance parcourue</span>
        </div>`;
    }

    // Timeline
    if (photos.length > 0) {
      let timelineHtml = '<div class="stat-card full-width"><span class="stat-icon">&#128337;</span><span class="stat-label" style="margin-bottom:0.5rem">Chronologie</span><ul class="stat-timeline">';
      photos.forEach((photo) => {
        const t = new Date(photo.timestamp);
        const timeStr = t.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
        timelineHtml += `
          <li>
            <span class="stat-timeline-num">${photo.checkpoint.id}</span>
            <span class="stat-timeline-name">${_esc(photo.checkpoint.name)}</span>
            <span class="stat-timeline-time">${timeStr}</span>
          </li>`;
      });
      timelineHtml += '</ul></div>';
      grid.innerHTML += timelineHtml;
    }
  },

  // --- Resume prompt ---
  async _showResumePrompt(teamName) {
    const completed = GameState.getCompletedCount();
    const confirmed = await this._confirm(
      "Partie en cours",
      `Reprendre la partie de "${teamName}" ? (${completed}/${CHECKPOINTS.length} etapes)`
    );
    if (confirmed) {
      this.showScreen("game");
    }
  },

  // --- Data Export/Import ---
  async _exportData() {
    const allPhotos = await PhotoStore.getAllPhotos().catch(() => ({}));
    const data = {
      version: 3,
      rallyId: currentRally ? currentRally.id : "normandie",
      exportDate: new Date().toISOString(),
      gameState: JSON.parse(localStorage.getItem(getStorageKey()) || "null"),
      teams: JSON.parse(localStorage.getItem(getTeamsKey()) || "[]"),
      achievementsSeen: JSON.parse(localStorage.getItem(getAchievementsSeenKey()) || "[]"),
      photos: allPhotos,
    };
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const link = document.createElement("a");
    link.download = `rally-${currentRally ? currentRally.id : "photo"}-sauvegarde.json`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    this._showToast("Donnees exportees !");
  },

  async _importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";

    const confirmed = await this._confirm(
      "Restaurer",
      "Ceci remplacera toutes vos donnees actuelles. Continuer ?"
    );
    if (!confirmed) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.version || !data.gameState) {
        this._showToast("Fichier invalide");
        return;
      }

      // Determine target rally
      let targetRallyId = currentRally ? currentRally.id : "normandie";
      if (data.version >= 3 && data.rallyId) {
        targetRallyId = data.rallyId;
      }

      const storageKey = "rallyPhoto_" + targetRallyId;
      const teamsKey = "rallyPhoto_" + targetRallyId + "_teams";
      const achKey = "rallyAchievements_" + targetRallyId;

      localStorage.setItem(storageKey, JSON.stringify(data.gameState));
      localStorage.setItem(teamsKey, JSON.stringify(data.teams || []));
      if (data.achievementsSeen) {
        localStorage.setItem(achKey, JSON.stringify(data.achievementsSeen));
      }
      // Restore photos to IndexedDB (v2/v3 format includes photos map)
      if (data.photos && typeof data.photos === "object") {
        // Switch to target rally's DB
        if (targetRallyId !== (currentRally ? currentRally.id : null)) {
          // Temporarily set the rally so PhotoStore opens the right DB
          const prevRally = currentRally;
          setCurrentRally(targetRallyId);
          await PhotoStore.clear().catch(() => {});
          for (const [key, dataUrl] of Object.entries(data.photos)) {
            await PhotoStore.savePhoto(key, dataUrl);
          }
          if (prevRally) setCurrentRally(prevRally.id);
        } else {
          await PhotoStore.clear().catch(() => {});
          for (const [key, dataUrl] of Object.entries(data.photos)) {
            await PhotoStore.savePhoto(key, dataUrl);
          }
        }
      }
      // Also handle legacy v1 format: photos embedded in gameState.completed
      if (data.version === 1 && data.gameState && data.gameState.completed) {
        await PhotoStore.clear().catch(() => {});
        for (const [cpId, cpData] of Object.entries(data.gameState.completed)) {
          if (cpData.photoData) {
            await PhotoStore.savePhoto("main_" + cpId, cpData.photoData);
          }
          if (cpData.bonusPhotoData) {
            await PhotoStore.savePhoto("bonus_" + cpId, cpData.bonusPhotoData);
          }
        }
      }
      GameState.load();
      Teams.load();
      this._showToast("Donnees restaurees ! Rechargement...");
      setTimeout(() => location.reload(), 1500);
    } catch {
      this._showToast("Erreur lors de la lecture du fichier");
    }
  },

  // --- Confirmation Dialog ---
  _confirm(title, message) {
    return new Promise((resolve) => {
      const overlay = document.getElementById("confirm-dialog");
      document.getElementById("confirm-title").textContent = title;
      document.getElementById("confirm-message").textContent = message;
      overlay.classList.remove("hidden");

      const cleanup = (result) => {
        overlay.classList.add("hidden");
        okBtn.removeEventListener("click", onOk);
        cancelBtn.removeEventListener("click", onCancel);
        resolve(result);
      };

      const onOk = () => cleanup(true);
      const onCancel = () => cleanup(false);

      const okBtn = document.getElementById("confirm-ok");
      const cancelBtn = document.getElementById("confirm-cancel");
      okBtn.addEventListener("click", onOk);
      cancelBtn.addEventListener("click", onCancel);
    });
  },

  // --- Onboarding / Tutorial ---
  _initOnboarding() {
    if (localStorage.getItem("rallyOnboardingSeen")) return;
    const overlay = document.getElementById("onboarding-overlay");
    const steps = overlay.querySelectorAll(".onboarding-step");
    const dotsContainer = document.getElementById("onboarding-dots");
    let current = 0;

    // Create dots
    dotsContainer.innerHTML = "";
    for (let i = 0; i < steps.length; i++) {
      const dot = document.createElement("span");
      dot.className = "onboarding-dot" + (i === 0 ? " active" : "");
      dotsContainer.appendChild(dot);
    }
    const dots = dotsContainer.querySelectorAll(".onboarding-dot");

    const showStep = (idx) => {
      steps.forEach((s, i) => s.classList.toggle("hidden", i !== idx));
      dots.forEach((d, i) => d.classList.toggle("active", i === idx));
      const nextBtn = document.getElementById("btn-onboarding-next");
      nextBtn.textContent = idx === steps.length - 1 ? "C'est parti !" : "Suivant";
    };

    const close = () => {
      overlay.classList.add("hidden");
      localStorage.setItem("rallyOnboardingSeen", "1");
    };

    document.getElementById("btn-onboarding-next").addEventListener("click", () => {
      if (current < steps.length - 1) {
        current++;
        showStep(current);
      } else {
        close();
      }
    });

    document.getElementById("btn-onboarding-skip").addEventListener("click", close);

    overlay.classList.remove("hidden");
  },

  // --- Migrate legacy storage keys to rally-prefixed keys ---
  _migrateStorageKeys() {
    if (localStorage.getItem("rallyMultiMigrated")) return;

    // Migrate old fixed keys to rally-prefixed keys
    const old = localStorage.getItem("rallyPhotoNormandy");
    if (old && !localStorage.getItem("rallyPhoto_normandie")) {
      localStorage.setItem("rallyPhoto_normandie", old);
    }
    const oldTeams = localStorage.getItem("rallyPhotoNormandy_teams");
    if (oldTeams && !localStorage.getItem("rallyPhoto_normandie_teams")) {
      localStorage.setItem("rallyPhoto_normandie_teams", oldTeams);
    }
    const oldAch = localStorage.getItem("rallyAchievementsSeen");
    if (oldAch && !localStorage.getItem("rallyAchievements_normandie")) {
      localStorage.setItem("rallyAchievements_normandie", oldAch);
    }

    // Migrate legacy photo migration flag
    if (localStorage.getItem("rallyPhotoMigrated")) {
      localStorage.setItem("rallyPhotoMigrated_normandie", "1");
    }

    localStorage.setItem("rallyMultiMigrated", "1");
  },

  // --- Migrate legacy localStorage photos to IndexedDB ---
  async _migrateLegacyPhotos() {
    if (!currentRally) return;
    const state = GameState.get();
    const migrateKey = "rallyPhotoMigrated_" + currentRally.id;
    if (!state.completed || localStorage.getItem(migrateKey)) return;

    // Also migrate from old DB name for Normandie
    if (currentRally.id === "normandie") {
      await this._migrateIndexedDB();
    }

    let migrated = false;
    for (const [cpId, cpData] of Object.entries(state.completed)) {
      if (cpData.photoData) {
        await PhotoStore.savePhoto("main_" + cpId, cpData.photoData).catch(() => {});
        delete cpData.photoData;
        migrated = true;
      }
      if (cpData.bonusPhotoData) {
        await PhotoStore.savePhoto("bonus_" + cpId, cpData.bonusPhotoData).catch(() => {});
        delete cpData.bonusPhotoData;
        migrated = true;
      }
    }

    if (migrated) {
      GameState.save();
      localStorage.setItem(migrateKey, "1");
    }
  },

  // Migrate old IndexedDB "rallyPhotoNormandie" to "rallyPhoto_normandie"
  async _migrateIndexedDB() {
    try {
      const oldName = "rallyPhotoNormandie";
      // Try to open old DB
      const oldDb = await new Promise((resolve, reject) => {
        const req = indexedDB.open(oldName, 1);
        req.onupgradeneeded = (e) => {
          // DB didn't exist, nothing to migrate
          e.target.transaction.abort();
          reject(new Error("no old db"));
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = () => reject(req.error);
      });

      // Read all entries from old DB
      const entries = await new Promise((resolve, reject) => {
        const tx = oldDb.transaction("photos", "readonly");
        const store = tx.objectStore("photos");
        const results = {};
        const req = store.openCursor();
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            results[cursor.key] = cursor.value;
            cursor.continue();
          } else {
            resolve(results);
          }
        };
        req.onerror = () => reject(req.error);
      });

      oldDb.close();

      if (Object.keys(entries).length === 0) return;

      // Write to new DB via PhotoStore
      for (const [key, value] of Object.entries(entries)) {
        await PhotoStore.savePhoto(key, value);
      }
    } catch {
      // Old DB doesn't exist or migration failed — that's fine
    }
  },

  // --- Reset ---
  async _resetGame() {
    const confirmed = await this._confirm(
      "Nouveau Rally",
      "Toutes vos donnees de progression, photos et scores seront perdus. Continuer ?"
    );
    if (!confirmed) return;

    GameState.reset();
    RallyMap.stopGeolocation();
    if (this._mapInitialized) {
      RallyMap.destroy();
      this._mapInitialized = false;
    }
    this._proximityNotified = {};
    document.getElementById("team-name").value = "";

    // If multiple rallies, go back to selection
    if (RALLIES.length > 1) {
      this._goToRallySelection();
    } else {
      this.showScreen("welcome");
    }
  },
};

// --- Global error handlers ---
(function() {
  let _lastErrorToast = 0;
  function _errorToast() {
    const now = Date.now();
    if (now - _lastErrorToast < 5000) return;
    _lastErrorToast = now;
    try { if (App && App._showToast) App._showToast("Une erreur est survenue"); } catch(e) { /* not ready */ }
  }
  window.onerror = function(message, source, lineno, colno, error) {
    console.error("[Rally Photo] Erreur:", { message, source, lineno, colno, error });
    _errorToast();
    return false;
  };
  window.addEventListener("unhandledrejection", function(event) {
    console.error("[Rally Photo] Promise rejetee:", event.reason);
    _errorToast();
  });
})();

// Boot
document.addEventListener("DOMContentLoaded", () => App.init());

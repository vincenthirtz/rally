// Rally Photo — Game State Management

const GameState = {
  _state: null,

  _defaults() {
    return {
      teamName: "",
      currentCheckpoint: 1,
      completed: {},        // { checkpointId: { photoData, timestamp, bonusValidated } }
      score: 0,
      bonusScore: 0,
      started: false,
      finished: false,
      freeMode: false,      // true = all checkpoints unlocked
      startTime: null,      // ISO string
      endTime: null,        // ISO string
      hintsUsed: {},        // { checkpointId: numberOfHintsUsed }
      notes: {},            // { checkpointId: "user note text" }
    };
  },

  load() {
    try {
      const raw = localStorage.getItem(getStorageKey());
      this._state = raw ? JSON.parse(raw) : this._defaults();
    } catch {
      this._state = this._defaults();
    }
    return this._state;
  },

  save() {
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(this._state));
    } catch (e) {
      if (e.name === "QuotaExceededError" || e.code === 22) {
        App._showToast("Stockage plein ! Certaines photos ne seront pas sauvegardees.");
      }
    }
  },

  get() {
    if (!this._state) this.load();
    return this._state;
  },

  startGame(teamName, freeMode) {
    this._state = this._defaults();
    this._state.teamName = teamName;
    this._state.freeMode = freeMode;
    this._state.started = true;
    this._state.startTime = new Date().toISOString();
    this.save();
    // Save to teams list
    Teams.addTeam(teamName);
  },

  async completeCheckpoint(checkpointId, photoData) {
    const cp = CHECKPOINTS.find((c) => c.id === checkpointId);
    if (!cp) return;

    // Store photo in IndexedDB, keep only metadata in state
    await PhotoStore.savePhoto("main_" + checkpointId, photoData);

    this._state.completed[checkpointId] = {
      timestamp: new Date().toISOString(),
      bonusValidated: false,
    };
    this._state.score += cp.points;

    if (!this._state.freeMode) {
      const nextIndex = CHECKPOINTS.findIndex((c) => c.id === checkpointId) + 1;
      if (nextIndex < CHECKPOINTS.length) {
        this._state.currentCheckpoint = CHECKPOINTS[nextIndex].id;
      }
    }

    // Check if all completed
    if (Object.keys(this._state.completed).length >= CHECKPOINTS.length) {
      this._state.finished = true;
      this._state.endTime = new Date().toISOString();
    }

    this.save();
    Teams.updateTeamScore(this._state.teamName, this._state.score + this._state.bonusScore);
    if (this._state.finished) {
      Teams.updateTeamElapsed(this._state.teamName, this.getElapsedTime());
    }
  },

  async validateBonus(checkpointId, bonusPhotoData) {
    const cp = CHECKPOINTS.find((c) => c.id === checkpointId);
    if (!cp || !this._state.completed[checkpointId]) return;

    await PhotoStore.savePhoto("bonus_" + checkpointId, bonusPhotoData);

    this._state.completed[checkpointId].bonusValidated = true;
    this._state.bonusScore += (cp.bonusPoints || 0);
    this.save();
    Teams.updateTeamScore(this._state.teamName, this._state.score + this._state.bonusScore);
  },

  async replacePhoto(checkpointId, photoData) {
    if (!this._state.completed[checkpointId]) return;
    await PhotoStore.savePhoto("main_" + checkpointId, photoData);
  },

  async deleteBonusPhoto(checkpointId) {
    const cp = CHECKPOINTS.find((c) => c.id === checkpointId);
    if (!cp || !this._state.completed[checkpointId]) return;
    if (!this._state.completed[checkpointId].bonusValidated) return;
    await PhotoStore.deletePhoto("bonus_" + checkpointId).catch(() => {});
    this._state.completed[checkpointId].bonusValidated = false;
    this._state.bonusScore -= (cp.bonusPoints || 0);
    this.save();
    Teams.updateTeamScore(this._state.teamName, this._state.score + this._state.bonusScore);
  },

  async uncompleteCheckpoint(checkpointId) {
    const cp = CHECKPOINTS.find((c) => c.id === checkpointId);
    if (!cp || !this._state.completed[checkpointId]) return;

    // Remove points
    this._state.score -= cp.points;
    if (this._state.completed[checkpointId].bonusValidated) {
      this._state.bonusScore -= (cp.bonusPoints || 0);
    }

    // Delete photos from IndexedDB
    await PhotoStore.deletePhoto("main_" + checkpointId).catch(() => {});
    await PhotoStore.deletePhoto("bonus_" + checkpointId).catch(() => {});

    // Remove completion entry
    delete this._state.completed[checkpointId];

    // Reset finished state if it was set
    if (this._state.finished) {
      this._state.finished = false;
      this._state.endTime = null;
    }

    // In sequential mode, reset currentCheckpoint to this one if needed
    if (!this._state.freeMode) {
      const cpIndex = CHECKPOINTS.findIndex((c) => c.id === checkpointId);
      const currentIndex = CHECKPOINTS.findIndex(
        (c) => c.id === this._state.currentCheckpoint
      );
      if (cpIndex < currentIndex || currentIndex === -1) {
        this._state.currentCheckpoint = checkpointId;
      }
    }

    this.save();
    Teams.updateTeamScore(this._state.teamName, this._state.score + this._state.bonusScore);
  },

  useHint(checkpointId) {
    if (!this._state.hintsUsed) this._state.hintsUsed = {};
    const current = this._state.hintsUsed[checkpointId] || 0;
    const cp = CHECKPOINTS.find((c) => c.id === checkpointId);
    if (!cp || !cp.hints || current >= cp.hints.length) return null;
    const hint = cp.hints[current];
    this._state.hintsUsed[checkpointId] = current + 1;
    this._state.score = Math.max(0, this._state.score - hint.penalty);
    this.save();
    Teams.updateTeamScore(this._state.teamName, this._state.score + this._state.bonusScore);
    return hint;
  },

  getHintsUsed(checkpointId) {
    if (!this._state.hintsUsed) return 0;
    return this._state.hintsUsed[checkpointId] || 0;
  },

  setNote(checkpointId, text) {
    if (!this._state.notes) this._state.notes = {};
    const trimmed = (text || "").trim();
    if (trimmed) {
      this._state.notes[checkpointId] = trimmed;
    } else {
      delete this._state.notes[checkpointId];
    }
    this.save();
  },

  getNote(checkpointId) {
    if (!this._state.notes) return "";
    return this._state.notes[checkpointId] || "";
  },

  isCompleted(checkpointId) {
    return !!this._state.completed[checkpointId];
  },

  isCurrent(checkpointId) {
    if (this._state.freeMode) return !this.isCompleted(checkpointId);
    return this._state.currentCheckpoint === checkpointId;
  },

  isLocked(checkpointId) {
    if (this._state.freeMode) return false;
    if (this.isCompleted(checkpointId)) return false;
    const cpIndex = CHECKPOINTS.findIndex((c) => c.id === checkpointId);
    const currentIndex = CHECKPOINTS.findIndex(
      (c) => c.id === this._state.currentCheckpoint
    );
    return cpIndex > currentIndex;
  },

  getCompletedCount() {
    return Object.keys(this._state.completed).length;
  },

  getPhotos() {
    // Returns metadata only (no photo data). Use getPhotosWithData() for full data.
    return CHECKPOINTS.filter((cp) => this._state.completed[cp.id]).map(
      (cp) => ({
        checkpoint: cp,
        ...this._state.completed[cp.id],
      })
    );
  },

  async getPhotosWithData() {
    const metas = this.getPhotos();
    if (metas.length === 0) return [];
    // Build keys to fetch
    const keys = [];
    metas.forEach((m) => {
      keys.push("main_" + m.checkpoint.id);
      if (m.bonusValidated) keys.push("bonus_" + m.checkpoint.id);
    });
    const photoMap = await PhotoStore.getPhotos(keys);
    return metas.map((m) => ({
      ...m,
      photoData: photoMap["main_" + m.checkpoint.id] || m.photoData || null,
      bonusPhotoData: m.bonusValidated ? (photoMap["bonus_" + m.checkpoint.id] || m.bonusPhotoData || null) : null,
    }));
  },

  getElapsedTime() {
    if (!this._state.startTime) return null;
    const start = new Date(this._state.startTime);
    const end = this._state.endTime ? new Date(this._state.endTime) : new Date();
    return end - start;
  },

  getTotalScore() {
    return this._state.score + this._state.bonusScore;
  },

  reset() {
    this._state = this._defaults();
    this.save();
    PhotoStore.clear().catch(() => {});
  },
};

// --- Multi-team Management ---
const Teams = {
  _teams: null,

  load() {
    try {
      const raw = localStorage.getItem(getTeamsKey());
      this._teams = raw ? JSON.parse(raw) : [];
    } catch {
      this._teams = [];
    }
    return this._teams;
  },

  save() {
    localStorage.setItem(getTeamsKey(), JSON.stringify(this._teams));
  },

  get() {
    if (!this._teams) this.load();
    return this._teams;
  },

  addTeam(name) {
    this.get();
    if (!this._teams.find((t) => t.name === name)) {
      this._teams.push({ name, score: 0, timestamp: new Date().toISOString(), elapsed: null });
      this.save();
    }
  },

  updateTeamScore(name, score) {
    this.get();
    const team = this._teams.find((t) => t.name === name);
    if (team) {
      team.score = score;
      this.save();
    }
  },

  updateTeamElapsed(name, elapsed) {
    this.get();
    const team = this._teams.find((t) => t.name === name);
    if (team) {
      team.elapsed = elapsed;
      this.save();
    }
  },

  removeTeam(name) {
    this.get();
    this._teams = this._teams.filter((t) => t.name !== name);
    this.save();
  },

  getLeaderboard() {
    this.get();
    return [...this._teams].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aTime = a.elapsed || Infinity;
      const bTime = b.elapsed || Infinity;
      return aTime - bTime;
    });
  },

  clear() {
    this._teams = [];
    this.save();
  },
};

// --- Achievements System ---
const Achievements = {
  _defs: [
    { id: "first_step", icon: "\u{1F3C1}", name: "Premier pas", desc: "Valider votre premiere etape", hint: "Validez une etape pour commencer", check: (s) => Object.keys(s.completed).length >= 1 },
    { id: "halfway", icon: "\u{1F4AA}", name: "Mi-parcours", desc: () => "Atteindre la moitie du rally", hint: "Continuez le parcours... vous y etes presque", check: (s) => Object.keys(s.completed).length >= Math.ceil(CHECKPOINTS.length / 2) },
    { id: "completionist", icon: "\u{1F3C6}", name: "Completiste", desc: () => `Terminer les ${CHECKPOINTS.length} etapes`, hint: "Parcourez tout le rally", check: (s) => s.finished },
    { id: "bonus_first", icon: "\u2B50", name: "Bonus debloque", desc: "Valider un premier defi bonus", hint: "Tentez un defi bonus sur une etape validee", check: (s) => Object.values(s.completed).some(c => c.bonusValidated) },
    { id: "bonus_hunter", icon: "\u{1F525}", name: "Chasseur de bonus", desc: () => `Valider ${Math.ceil(CHECKPOINTS.length / 2)} defis bonus`, hint: "Accumulez les defis bonus...", check: (s) => Object.values(s.completed).filter(c => c.bonusValidated).length >= Math.ceil(CHECKPOINTS.length / 2) },
    { id: "bonus_master", icon: "\u{1F48E}", name: "Maitre bonus", desc: "Valider TOUS les defis bonus", hint: "Aucun bonus ne doit vous echapper", check: (s) => Object.values(s.completed).filter(c => c.bonusValidated).length >= CHECKPOINTS.length },
    { id: "speed_3", icon: "\u26A1", name: "Eclair", desc: "3 etapes en moins de 30 min", hint: "La vitesse est votre alliee", check: (s) => Achievements._speedCheck(s, 3, 30) },
    { id: "speed_demon", icon: "\u{1F3CE}\uFE0F", name: "Bolide", desc: "Finir en moins de 8h", hint: "Terminez le rally a toute allure", check: (s) => s.finished && s.endTime && (new Date(s.endTime) - new Date(s.startTime)) < 8 * 3600000 },
    { id: "high_score", icon: "\u{1F451}", name: "Score royal", desc: () => `Depasser ${Math.round((TOTAL_POINTS + TOTAL_BONUS) * 0.75)} points`, hint: "Visez haut, les bonus comptent", check: (s) => (s.score + s.bonusScore) >= Math.round((TOTAL_POINTS + TOTAL_BONUS) * 0.75) },
    { id: "perfect", icon: "\u{1F31F}", name: "Perfection", desc: () => `Score maximum : ${TOTAL_POINTS + TOTAL_BONUS} pts`, hint: "Etapes + bonus, rien ne doit manquer", check: (s) => (s.score + s.bonusScore) >= (TOTAL_POINTS + TOTAL_BONUS) },
  ],

  _speedCheck(state, count, minutes) {
    const times = Object.values(state.completed).map(c => new Date(c.timestamp).getTime()).sort((a, b) => a - b);
    if (times.length < count) return false;
    for (let i = count - 1; i < times.length; i++) {
      if (times[i] - times[i - count + 1] < minutes * 60000) return true;
    }
    return false;
  },

  getDesc(ach) {
    return typeof ach.desc === "function" ? ach.desc() : ach.desc;
  },

  getUnlocked(state) {
    return this._defs.filter(a => a.check(state));
  },

  getAll() {
    return this._defs;
  },

  _seenCache: null,
  _seenCacheKey: null,

  _getSeenIds() {
    const key = getAchievementsSeenKey();
    if (this._seenCache && this._seenCacheKey === key) return this._seenCache;
    try { this._seenCache = JSON.parse(localStorage.getItem(key)) || []; } catch { this._seenCache = []; }
    this._seenCacheKey = key;
    return this._seenCache;
  },

  getNew(state) {
    const key = getAchievementsSeenKey();
    const seen = this._getSeenIds();
    const unlocked = this.getUnlocked(state).map(a => a.id);
    const fresh = unlocked.filter(id => !seen.includes(id));
    if (fresh.length > 0) {
      this._seenCache = unlocked;
      this._seenCacheKey = key;
      localStorage.setItem(key, JSON.stringify(unlocked));
    }
    return fresh.map(id => this._defs.find(a => a.id === id));
  },
};

// --- Timer formatting ---
function formatElapsed(ms) {
  if (!ms || ms < 0) return "00:00:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

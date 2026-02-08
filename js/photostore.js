// Rally Photo — IndexedDB Photo Storage
// Stores photos in IndexedDB instead of localStorage to avoid quota limits.
// DB name is dynamic per rally.

const PhotoStore = {
  _db: null,
  _DB_VERSION: 1,
  _STORE_NAME: "photos",
  _pendingOpen: null,
  _pendingDbName: null,

  _getDbName() {
    return "rallyPhoto_" + (currentRally ? currentRally.id : "normandie");
  },

  open() {
    const dbName = this._getDbName();
    // Reopen if rally changed
    if (this._db && this._db.name === dbName) return Promise.resolve(this._db);
    // If an open is already in flight for the same DB, return the same promise
    if (this._pendingOpen && this._pendingDbName === dbName) return this._pendingOpen;
    this._db = null;
    this._pendingDbName = dbName;
    this._pendingOpen = new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, this._DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this._STORE_NAME)) {
          db.createObjectStore(this._STORE_NAME);
        }
      };
      req.onsuccess = (e) => {
        this._db = e.target.result;
        this._pendingOpen = null;
        this._pendingDbName = null;
        resolve(this._db);
      };
      req.onerror = () => {
        this._pendingOpen = null;
        this._pendingDbName = null;
        reject(req.error);
      };
    });
    return this._pendingOpen;
  },

  // Check storage quota
  async checkQuota() {
    if (!navigator.storage || !navigator.storage.estimate) {
      return { ok: true, warning: false, pct: 0 };
    }
    try {
      const { usage, quota } = await navigator.storage.estimate();
      const pct = quota > 0 ? (usage / quota) * 100 : 0;
      return { ok: pct < 95, warning: pct >= 80, pct };
    } catch {
      return { ok: true, warning: false, pct: 0 };
    }
  },

  // Save a photo: key = "main_3" or "bonus_3"
  async savePhoto(key, dataUrl) {
    const quota = await this.checkQuota();
    if (!quota.ok) {
      if (typeof App !== "undefined" && App._showToast) {
        App._showToast("Stockage plein ! Liberez de l'espace pour sauvegarder des photos.");
      }
      throw new Error("QUOTA_EXCEEDED");
    }
    if (quota.warning) {
      if (typeof App !== "undefined" && App._showToast) {
        App._showToast("Attention : stockage presque plein (" + Math.round(quota.pct) + "%)");
      }
    }
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this._STORE_NAME, "readwrite");
      tx.objectStore(this._STORE_NAME).put(dataUrl, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  // Get a single photo by key
  async getPhoto(key) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this._STORE_NAME, "readonly");
      const req = tx.objectStore(this._STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  // Get multiple photos by keys
  async getPhotos(keys) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this._STORE_NAME, "readonly");
      const store = tx.objectStore(this._STORE_NAME);
      const results = {};
      let pending = keys.length;
      if (pending === 0) return resolve(results);
      keys.forEach((key) => {
        const req = store.get(key);
        req.onsuccess = () => {
          results[key] = req.result || null;
          if (--pending === 0) resolve(results);
        };
        req.onerror = () => reject(req.error);
      });
    });
  },

  // Get all photos as { key: dataUrl }
  async getAllPhotos() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this._STORE_NAME, "readonly");
      const store = tx.objectStore(this._STORE_NAME);
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
  },

  // Delete all photos (for game reset)
  async clear() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this._STORE_NAME, "readwrite");
      tx.objectStore(this._STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};

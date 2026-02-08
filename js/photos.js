// Rally Photo Normandy — Photo Capture & Gallery

const Photos = {
  _pendingPhoto: null,
  _mode: "main", // "main" or "bonus"
  _galleryPhotos: [],
  _lightboxIndex: 0,
  _qualityPresets: {
    low:    { maxSize: 800,  quality: 0.6 },
    medium: { maxSize: 1200, quality: 0.7 },
    high:   { maxSize: 1800, quality: 0.82 },
  },
  _currentQuality: "medium",

  setQuality(level) {
    if (this._qualityPresets[level]) {
      this._currentQuality = level;
    }
  },

  _getCompressSettings() {
    return this._qualityPresets[this._currentQuality] || this._qualityPresets.medium;
  },

  init() {
    const input = document.getElementById("photo-input");
    input.addEventListener("change", (e) => this._handleFile(e));
  },

  openCamera(mode) {
    this._mode = mode || "main";
    document.getElementById("photo-input").click();
  },

  _handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Show loading spinner
    const targetPreview = this._mode === "bonus" ? "bonus-preview" : "photo-preview";
    const previewEl = document.getElementById(targetPreview);
    previewEl.innerHTML = '<div class="photo-loading"></div>';
    previewEl.classList.remove("hidden");

    const reader = new FileReader();
    reader.onload = (ev) => {
      const settings = this._getCompressSettings();
      this._compressImage(ev.target.result, settings.maxSize, settings.quality).then((compressed) => {
        if (this._mode === "retake") {
          App._handleRetake(compressed);
          return;
        }
        this._pendingPhoto = compressed;
        if (this._mode === "bonus") {
          this._showBonusPreview(compressed);
        } else {
          this._showPreview(compressed);
        }
      });
    };
    reader.onerror = () => {
      previewEl.classList.add("hidden");
      App._showToast("Erreur lors de la lecture de la photo");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  },

  _worker: null,
  _supportsOffscreen: typeof OffscreenCanvas !== "undefined",

  _initWorker() {
    if (this._worker || !this._supportsOffscreen) return;
    try {
      this._worker = new Worker("js/compress-worker.js");
    } catch (e) {
      this._supportsOffscreen = false;
    }
  },

  _compressImage(dataUrl, maxSize, quality) {
    this._initWorker();
    if (this._worker && this._supportsOffscreen) {
      return this._compressInWorker(dataUrl, maxSize, quality);
    }
    return this._compressMainThread(dataUrl, maxSize, quality);
  },

  _compressInWorker(dataUrl, maxSize, quality) {
    return new Promise((resolve) => {
      fetch(dataUrl)
        .then((r) => r.blob())
        .then((blob) => createImageBitmap(blob))
        .then((bitmap) => {
          this._worker.onmessage = (e) => {
            if (e.data.error) {
              resolve(this._compressMainThread(dataUrl, maxSize, quality));
              return;
            }
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(e.data.blob);
          };
          this._worker.postMessage({ imageBitmap: bitmap, maxSize, quality }, [bitmap]);
        })
        .catch(() => resolve(this._compressMainThread(dataUrl, maxSize, quality)));
    });
  },

  _compressMainThread(dataUrl, maxSize, quality) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxSize || h > maxSize) {
          const ratio = Math.min(maxSize / w, maxSize / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  },

  _showPreview(dataUrl) {
    const preview = document.getElementById("photo-preview");
    preview.innerHTML = '<img id="preview-img" alt="Apercu photo" />';
    document.getElementById("preview-img").src = dataUrl;
    preview.classList.remove("hidden");
    document.getElementById("btn-validate").classList.remove("hidden");
  },

  _showBonusPreview(dataUrl) {
    const preview = document.getElementById("bonus-preview");
    preview.innerHTML = '<img id="bonus-preview-img" alt="Apercu bonus" />';
    document.getElementById("bonus-preview-img").src = dataUrl;
    preview.classList.remove("hidden");
    document.getElementById("btn-validate-bonus").classList.remove("hidden");
  },

  getPendingPhoto() {
    return this._pendingPhoto;
  },

  clearPending() {
    this._pendingPhoto = null;
    this._mode = "main";
    const preview = document.getElementById("photo-preview");
    preview.classList.add("hidden");
    document.getElementById("btn-validate").classList.add("hidden");
    const bonusPreview = document.getElementById("bonus-preview");
    if (bonusPreview) bonusPreview.classList.add("hidden");
    const btnBonus = document.getElementById("btn-validate-bonus");
    if (btnBonus) btnBonus.classList.add("hidden");
  },

  _currentFilter: "all",
  _PAGE_SIZE: 12,
  _displayedCount: 0,
  _allFilteredCards: [],

  initGalleryFilters() {
    if (this._filtersInit) return;
    this._filtersInit = true;
    document.getElementById("gallery-filters").addEventListener("click", (e) => {
      const btn = e.target.closest(".gallery-filter");
      if (!btn) return;
      document.querySelectorAll(".gallery-filter").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      this._currentFilter = btn.dataset.filter;
      this.renderGallery();
    });
  },

  _createGalleryCard(photo, idx, isBonus) {
    const card = document.createElement("div");
    card.className = "gallery-card" + (isBonus ? " gallery-card-bonus" : "");
    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", (isBonus ? "Bonus: " : "") + photo.checkpoint.name);
    const img = document.createElement("img");
    img.loading = "lazy";
    img.src = photo.photoData;
    img.alt = isBonus ? photo.checkpoint.name + " (bonus)" : photo.checkpoint.name;
    const label = document.createElement("div");
    label.className = "gallery-card-label";
    label.textContent = isBonus ? "Bonus: " + photo.checkpoint.name : photo.checkpoint.name;
    card.append(img, label);
    card.addEventListener("click", () => this._openLightbox(idx));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this._openLightbox(idx);
      }
    });
    return card;
  },

  async renderGallery() {
    this.initGalleryFilters();
    const photos = await GameState.getPhotosWithData();
    const grid = document.getElementById("gallery-grid");
    grid.innerHTML = "";
    this._galleryPhotos = [];
    this._allFilteredCards = [];
    this._displayedCount = 0;

    // Remove old "load more" button if present
    const oldBtn = document.getElementById("gallery-load-more");
    if (oldBtn) oldBtn.remove();

    if (photos.length === 0) {
      grid.innerHTML =
        '<p class="gallery-empty">Pas encore de photos. Lancez le rally et capturez votre aventure !</p>';
      return;
    }

    const filter = this._currentFilter;
    photos.forEach((photo) => {
      if (photo.photoData && (filter === "all" || filter === "main")) {
        const idx = this._galleryPhotos.length;
        this._galleryPhotos.push(photo);
        this._allFilteredCards.push(this._createGalleryCard(photo, idx, false));
      }
      if (photo.bonusPhotoData && (filter === "all" || filter === "bonus")) {
        const bIdx = this._galleryPhotos.length;
        this._galleryPhotos.push({ ...photo, photoData: photo.bonusPhotoData, _isBonus: true });
        this._allFilteredCards.push(this._createGalleryCard(
          { ...photo, photoData: photo.bonusPhotoData }, bIdx, true
        ));
      }
    });

    this._showMoreGalleryCards();
  },

  _showMoreGalleryCards() {
    const grid = document.getElementById("gallery-grid");
    const end = Math.min(this._displayedCount + this._PAGE_SIZE, this._allFilteredCards.length);
    for (let i = this._displayedCount; i < end; i++) {
      grid.appendChild(this._allFilteredCards[i]);
    }
    this._displayedCount = end;

    let btn = document.getElementById("gallery-load-more");
    if (this._displayedCount < this._allFilteredCards.length) {
      if (!btn) {
        btn = document.createElement("button");
        btn.id = "gallery-load-more";
        btn.className = "btn btn-outline btn-small gallery-load-more";
        btn.addEventListener("click", () => this._showMoreGalleryCards());
        grid.parentNode.insertBefore(btn, grid.nextSibling);
      }
      const remaining = this._allFilteredCards.length - this._displayedCount;
      btn.textContent = "Charger plus (" + remaining + " restantes)";
    } else if (btn) {
      btn.remove();
    }
  },

  _openLightbox(index) {
    this._lightboxIndex = index;
    this._renderLightboxAt(index);
    const lb = document.getElementById("lightbox");
    lb.classList.remove("hidden");
    this._initLightboxSwipe(lb);
    setTimeout(() => document.getElementById("lightbox-close").focus(), 100);
  },

  _initLightboxSwipe(lb) {
    if (this._lbSwipeInit) return;
    this._lbSwipeInit = true;
    let startX = 0;
    let startY = 0;
    lb.addEventListener("touchstart", (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });
    lb.addEventListener("touchend", (e) => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) this.lightboxNav(1);
        else this.lightboxNav(-1);
      }
    }, { passive: true });
  },

  _renderLightboxAt(index) {
    const photo = this._galleryPhotos[index];
    if (!photo) return;
    document.getElementById("lightbox-img").src = photo.photoData;
    const title = photo._isBonus ? "Bonus: " + photo.checkpoint.name : photo.checkpoint.name;
    document.getElementById("lightbox-title").textContent = title;
    document.getElementById("lightbox-date").textContent = new Date(
      photo.timestamp
    ).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    // Show note if exists
    const noteEl = document.getElementById("lightbox-note");
    const note = GameState.getNote(photo.checkpoint.id);
    if (note) {
      noteEl.textContent = note;
      noteEl.classList.remove("hidden");
    } else {
      noteEl.classList.add("hidden");
    }
    // Show/hide nav arrows
    document.getElementById("lightbox-prev").style.visibility = index > 0 ? "visible" : "hidden";
    document.getElementById("lightbox-next").style.visibility = index < this._galleryPhotos.length - 1 ? "visible" : "hidden";
  },

  lightboxNav(dir) {
    if (this._lbNavLocked) return;
    const newIdx = this._lightboxIndex + dir;
    if (newIdx < 0 || newIdx >= this._galleryPhotos.length) return;
    this._lbNavLocked = true;
    this._lightboxIndex = newIdx;
    this._renderLightboxAt(newIdx);
    setTimeout(() => { this._lbNavLocked = false; }, 200);
  },

  closeLightbox() {
    document.getElementById("lightbox").classList.add("hidden");
  },

  async deleteCurrentPhoto() {
    const photo = this._galleryPhotos[this._lightboxIndex];
    if (!photo) return;

    const isBonus = !!photo._isBonus;
    const cpName = photo.checkpoint.name;
    const message = isBonus
      ? 'Supprimer la photo bonus de "' + cpName + '" ? Les points bonus seront retires.'
      : 'Supprimer la photo de "' + cpName + '" ? Cela annulera la validation de cette etape.';

    const confirmed = await App._confirm("Supprimer la photo", message);
    if (!confirmed) return;

    if (isBonus) {
      await GameState.deleteBonusPhoto(photo.checkpoint.id);
      App._showToast("Photo bonus supprimee");
    } else {
      await GameState.uncompleteCheckpoint(photo.checkpoint.id);
      if (App._mapInitialized) RallyMap.refreshMarkers();
      App._showToast("Etape et photo supprimees");
    }
    App._updateHUD();
    this.closeLightbox();
    this.renderGallery();
  },

  async renderFinishMosaic() {
    const photos = await GameState.getPhotosWithData();
    const mosaic = document.getElementById("finish-mosaic");
    mosaic.innerHTML = "";

    photos.forEach((photo) => {
      if (!photo.photoData) return;
      const img = document.createElement("img");
      img.src = photo.photoData;
      img.alt = photo.checkpoint.name;
      img.title = photo.checkpoint.name;
      mosaic.appendChild(img);
    });
  },
};

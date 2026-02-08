// Rally Photo — Custom Rally Editor
// Global module: RallyEditor

const RallyEditor = {
  _editingRally: null,
  _currentStep: 0,
  _mapInstance: null,
  _markers: {},
  _placingCpIndex: null,
  _tempCheckpoints: [],
  _expandedCp: null,

  STEPS: ["metadata", "checkpoints", "map-review", "preview"],

  // ===== Init =====
  init() {
    document.getElementById("btn-editor-back").addEventListener("click", () => App.showScreen("select"));
    document.getElementById("btn-create-rally").addEventListener("click", () => this.openEditor(null));
    document.getElementById("btn-import-rally").addEventListener("click", () => document.getElementById("import-rally-input").click());
    document.getElementById("import-rally-input").addEventListener("change", (e) => {
      if (e.target.files[0]) this.importRally(e.target.files[0]);
      e.target.value = "";
    });
    document.getElementById("btn-editor-close").addEventListener("click", () => this._closeEditor());
    document.getElementById("btn-editor-prev").addEventListener("click", () => this._prevStep());
    document.getElementById("btn-editor-next").addEventListener("click", () => this._nextStep());
    document.getElementById("btn-editor-save").addEventListener("click", () => this._publishRally());
    document.getElementById("btn-add-checkpoint").addEventListener("click", () => this._addCheckpoint());
  },

  // ===== Storage =====
  _loadCustomRallies() {
    try {
      var raw = localStorage.getItem("rallyPhoto_customRallies");
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  },

  _saveCustomRallies(rallies) {
    try {
      localStorage.setItem("rallyPhoto_customRallies", JSON.stringify(rallies));
    } catch (e) {
      App._showToast("Espace de stockage insuffisant");
    }
  },

  _saveRally(rallyData) {
    var customs = this._loadCustomRallies();
    var idx = customs.findIndex(function (r) { return r.id === rallyData.id; });
    if (idx >= 0) {
      customs[idx] = rallyData;
    } else {
      customs.push(rallyData);
    }
    this._saveCustomRallies(customs);

    // Update RALLIES[] in memory
    var memIdx = RALLIES.findIndex(function (r) { return r.id === rallyData.id; });
    if (memIdx >= 0) {
      RALLIES[memIdx] = rallyData;
    } else {
      RALLIES.push(rallyData);
    }
  },

  _deleteRally(rallyId) {
    var customs = this._loadCustomRallies().filter(function (r) { return r.id !== rallyId; });
    this._saveCustomRallies(customs);

    // Remove from RALLIES[]
    var idx = RALLIES.findIndex(function (r) { return r.id === rallyId; });
    if (idx >= 0) RALLIES.splice(idx, 1);

    // Cleanup game data
    localStorage.removeItem("rallyPhoto_" + rallyId);
    localStorage.removeItem("rallyPhoto_" + rallyId + "_teams");
    localStorage.removeItem("rallyAchievements_" + rallyId);
    if (localStorage.getItem("rallyPhoto_lastRally") === rallyId) {
      localStorage.removeItem("rallyPhoto_lastRally");
    }
    try { indexedDB.deleteDatabase("rallyPhoto_" + rallyId); } catch (e) {}
  },

  // ===== Editor List Screen =====
  _renderCustomRallyList() {
    var customs = this._loadCustomRallies();
    var container = document.getElementById("custom-rally-list");
    var emptyMsg = document.getElementById("editor-empty-msg");
    container.innerHTML = "";

    if (customs.length === 0) {
      emptyMsg.classList.remove("hidden");
      return;
    }
    emptyMsg.classList.add("hidden");

    customs.forEach(function (rally) {
      var totalPts = rally.checkpoints.reduce(function (s, c) { return s + c.points; }, 0);
      var totalBonus = rally.checkpoints.reduce(function (s, c) { return s + (c.bonusPoints || 0); }, 0);

      var card = document.createElement("div");
      card.className = "custom-rally-card";
      card.innerHTML =
        '<div class="custom-rally-card-color" style="background:' + _escAttr(rally.theme ? rally.theme.primary : '#1e3a5f') + '"></div>' +
        '<div class="custom-rally-card-info">' +
          '<h4>' + _esc(rally.name) + '</h4>' +
          '<p>' + rally.checkpoints.length + ' etapes &middot; ' + (totalPts + totalBonus) + ' pts</p>' +
        '</div>' +
        '<div class="custom-rally-card-actions">' +
          '<button class="btn btn-outline btn-small ed-btn-edit">Modifier</button>' +
          '<button class="btn btn-outline btn-small ed-btn-export">Exporter</button>' +
          '<button class="btn btn-outline btn-small ed-btn-share">Partager</button>' +
          '<button class="btn btn-outline btn-small btn-danger-text ed-btn-delete">Supprimer</button>' +
        '</div>';

      card.querySelector(".ed-btn-edit").addEventListener("click", function () { RallyEditor.openEditor(rally.id); });
      card.querySelector(".ed-btn-export").addEventListener("click", function () { RallyEditor.exportRally(rally.id); });
      card.querySelector(".ed-btn-share").addEventListener("click", function () { RallyEditor.shareRally(rally.id); });
      card.querySelector(".ed-btn-delete").addEventListener("click", async function () {
        var confirmed = await App._confirm("Supprimer", 'Supprimer le rally "' + rally.name + '" et toutes ses donnees ?');
        if (!confirmed) return;
        RallyEditor._deleteRally(rally.id);
        RallyEditor._renderCustomRallyList();
        App._showToast("Rally supprime");
      });

      container.appendChild(card);
    });
  },

  // ===== Open / Close Editor =====
  openEditor(rallyId) {
    if (rallyId) {
      var customs = this._loadCustomRallies();
      var existing = customs.find(function (r) { return r.id === rallyId; });
      if (!existing) return;
      this._editingRally = JSON.parse(JSON.stringify(existing));
      this._tempCheckpoints = this._editingRally.checkpoints.slice();
      document.getElementById("editor-title").textContent = "Modifier le rally";
    } else {
      this._editingRally = null;
      this._tempCheckpoints = [];
      document.getElementById("editor-title").textContent = "Nouveau rally";
    }

    this._currentStep = 0;
    this._expandedCp = null;
    this._populateMetadata();
    this._showStep(0);
    App.showScreen("editor");
  },

  _closeEditor() {
    this._destroyEditorMap();
    this._editingRally = null;
    this._tempCheckpoints = [];
    App.showScreen("editor-list");
    this._renderCustomRallyList();
  },

  // ===== Wizard Steps =====
  _showStep(idx) {
    this._currentStep = idx;
    for (var i = 0; i < 4; i++) {
      document.getElementById("editor-step-" + i).classList.toggle("hidden", i !== idx);
    }
    // Update stepper dots
    document.querySelectorAll(".editor-stepper .step-dot").forEach(function (dot, i) {
      dot.classList.toggle("active", i === idx);
      dot.classList.toggle("done", i < idx);
    });
    // Navigation buttons
    document.getElementById("btn-editor-prev").classList.toggle("hidden", idx === 0);
    document.getElementById("btn-editor-next").classList.toggle("hidden", idx === 3);
    document.getElementById("btn-editor-save").classList.toggle("hidden", idx !== 3);

    if (idx === 1) this._renderCheckpointList();
    if (idx === 2) {
      this._initEditorMap();
      setTimeout(function () {
        if (RallyEditor._mapInstance) RallyEditor._mapInstance.invalidateSize();
        RallyEditor._refreshEditorMarkers();
      }, 150);
    }
    if (idx === 3) this._renderPreview();
  },

  _nextStep() {
    if (this._currentStep === 0 && !this._validateMetadata()) return;
    if (this._currentStep === 1) {
      this._saveExpandedCheckpoint();
      if (!this._validateCheckpoints()) return;
    }
    if (this._currentStep === 2 && !this._validateMap()) return;
    this._showStep(this._currentStep + 1);
  },

  _prevStep() {
    if (this._currentStep === 1) this._saveExpandedCheckpoint();
    if (this._currentStep > 0) this._showStep(this._currentStep - 1);
  },

  // ===== Step 1: Metadata =====
  _populateMetadata() {
    var r = this._editingRally;
    document.getElementById("ed-name").value = r ? r.name : "";
    document.getElementById("ed-shortname").value = r ? r.shortName : "";
    document.getElementById("ed-subtitle").value = r ? r.subtitle || "" : "";
    document.getElementById("ed-description").value = r ? r.description || "" : "";
    document.getElementById("ed-color-primary").value = r && r.theme ? r.theme.primary : "#1e3a5f";
    document.getElementById("ed-color-accent").value = r && r.theme ? r.theme.accent : "#d97706";
  },

  _collectMetadata() {
    var primary = document.getElementById("ed-color-primary").value;
    return {
      name: document.getElementById("ed-name").value.trim(),
      shortName: document.getElementById("ed-shortname").value.trim(),
      subtitle: document.getElementById("ed-subtitle").value.trim(),
      description: document.getElementById("ed-description").value.trim(),
      theme: {
        primary: primary,
        primaryLight: _lightenColor(primary, 20),
        accent: document.getElementById("ed-color-accent").value,
        accentLight: _lightenColor(document.getElementById("ed-color-accent").value, 30),
      },
    };
  },

  _validateMetadata() {
    var name = document.getElementById("ed-name").value.trim();
    var shortName = document.getElementById("ed-shortname").value.trim();
    if (!name) { App._showToast("Le nom du rally est requis"); document.getElementById("ed-name").focus(); return false; }
    if (!shortName) { App._showToast("Le nom court est requis"); document.getElementById("ed-shortname").focus(); return false; }
    return true;
  },

  // ===== Step 2: Checkpoints =====
  _addCheckpoint() {
    this._saveExpandedCheckpoint();
    this._tempCheckpoints.push({
      id: this._tempCheckpoints.length + 1,
      name: "",
      description: "",
      photoHint: "",
      lat: 0,
      lng: 0,
      points: 10,
      bonusChallenge: "",
      bonusPoints: 0,
      info: {},
      hints: [],
    });
    this._expandedCp = this._tempCheckpoints.length - 1;
    this._renderCheckpointList();
    // Scroll to new checkpoint
    var list = document.getElementById("editor-cp-list");
    setTimeout(function () { list.scrollTop = list.scrollHeight; }, 50);
  },

  _removeCheckpoint(index) {
    this._tempCheckpoints.splice(index, 1);
    this._renumberCheckpoints();
    if (this._expandedCp === index) this._expandedCp = null;
    else if (this._expandedCp > index) this._expandedCp--;
    this._renderCheckpointList();
  },

  _moveCheckpoint(index, dir) {
    var newIdx = index + dir;
    if (newIdx < 0 || newIdx >= this._tempCheckpoints.length) return;
    var tmp = this._tempCheckpoints[index];
    this._tempCheckpoints[index] = this._tempCheckpoints[newIdx];
    this._tempCheckpoints[newIdx] = tmp;
    this._renumberCheckpoints();
    if (this._expandedCp === index) this._expandedCp = newIdx;
    else if (this._expandedCp === newIdx) this._expandedCp = index;
    this._renderCheckpointList();
  },

  _renumberCheckpoints() {
    this._tempCheckpoints.forEach(function (cp, i) { cp.id = i + 1; });
  },

  _saveExpandedCheckpoint() {
    if (this._expandedCp === null) return;
    var i = this._expandedCp;
    var cp = this._tempCheckpoints[i];
    if (!cp) return;
    var prefix = "ed-cp-" + i + "-";
    var el = function (s) { return document.getElementById(prefix + s); };
    if (!el("name")) return;
    cp.name = el("name").value.trim();
    cp.description = el("desc").value.trim();
    cp.photoHint = el("hint").value.trim();
    cp.points = parseInt(el("points").value, 10) || 10;
    cp.bonusChallenge = el("bonus").value.trim();
    cp.bonusPoints = parseInt(el("bonuspts").value, 10) || 0;
    // Collect hints
    cp.hints = [];
    document.querySelectorAll(".ed-hint-row-" + i).forEach(function (row) {
      var text = row.querySelector(".ed-hint-text").value.trim();
      var penalty = parseInt(row.querySelector(".ed-hint-penalty").value, 10) || 5;
      if (text) cp.hints.push({ text: text, penalty: penalty });
    });
  },

  _renderCheckpointList() {
    var container = document.getElementById("editor-cp-list");
    container.innerHTML = "";
    var self = this;

    this._tempCheckpoints.forEach(function (cp, i) {
      var isExpanded = (self._expandedCp === i);
      var hasCoords = cp.lat && cp.lng;
      var coordsText = hasCoords ? cp.lat.toFixed(4) + ", " + cp.lng.toFixed(4) : "Non place";

      var card = document.createElement("div");
      card.className = "editor-cp-card";

      // Header
      var header = document.createElement("div");
      header.className = "editor-cp-card-header";
      header.innerHTML =
        '<span class="editor-cp-num">' + (i + 1) + '</span>' +
        '<span class="editor-cp-name">' + _esc(cp.name || "Etape " + (i + 1)) + '</span>' +
        '<span class="editor-cp-coords ' + (hasCoords ? '' : 'missing') + '">' + coordsText + '</span>' +
        '<span class="editor-cp-toggle">' + (isExpanded ? '&#9650;' : '&#9660;') + '</span>';
      header.addEventListener("click", function () {
        self._saveExpandedCheckpoint();
        self._expandedCp = (self._expandedCp === i) ? null : i;
        self._renderCheckpointList();
      });
      card.appendChild(header);

      // Body (only if expanded)
      if (isExpanded) {
        var body = document.createElement("div");
        body.className = "editor-cp-card-body";
        var prefix = "ed-cp-" + i + "-";

        var hintsHtml = "";
        (cp.hints || []).forEach(function (h, hi) {
          hintsHtml +=
            '<div class="editor-hint-row ed-hint-row-' + i + '">' +
              '<input type="text" class="ed-hint-text" value="' + _escAttr(h.text) + '" placeholder="Texte de l\'indice" />' +
              '<input type="number" class="ed-hint-penalty" value="' + h.penalty + '" min="0" max="50" title="Penalite" />' +
              '<button class="btn btn-outline btn-small ed-hint-remove" data-hi="' + hi + '">&#10005;</button>' +
            '</div>';
        });

        body.innerHTML =
          '<div class="input-group"><label>Nom *</label><input type="text" id="' + prefix + 'name" value="' + _escAttr(cp.name) + '" maxlength="80" /></div>' +
          '<div class="input-group"><label>Description</label><textarea id="' + prefix + 'desc" rows="2" maxlength="300">' + _esc(cp.description) + '</textarea></div>' +
          '<div class="input-group"><label>Indice photo</label><input type="text" id="' + prefix + 'hint" value="' + _escAttr(cp.photoHint) + '" maxlength="200" /></div>' +
          '<div class="input-group input-row"><div><label>Points</label><input type="number" id="' + prefix + 'points" value="' + cp.points + '" min="1" max="100" /></div>' +
          '<div><label>Defi bonus</label><input type="text" id="' + prefix + 'bonus" value="' + _escAttr(cp.bonusChallenge) + '" maxlength="200" /></div>' +
          '<div><label>Pts bonus</label><input type="number" id="' + prefix + 'bonuspts" value="' + (cp.bonusPoints || 0) + '" min="0" max="50" /></div></div>' +
          '<div class="input-group"><label>Indices (optionnel)</label>' +
            '<div class="editor-hint-list" id="' + prefix + 'hints">' + hintsHtml + '</div>' +
            '<button class="btn btn-outline btn-small ed-btn-add-hint" data-cp="' + i + '">+ Indice</button>' +
          '</div>' +
          '<div class="editor-cp-actions">' +
            (i > 0 ? '<button class="btn btn-outline btn-small ed-btn-up" data-i="' + i + '">&#9650; Monter</button>' : '') +
            (i < self._tempCheckpoints.length - 1 ? '<button class="btn btn-outline btn-small ed-btn-down" data-i="' + i + '">&#9660; Descendre</button>' : '') +
            '<button class="btn btn-outline btn-small ed-btn-place" data-i="' + i + '">Placer sur la carte</button>' +
            '<button class="btn btn-outline btn-small btn-danger-text ed-btn-rm" data-i="' + i + '">Supprimer</button>' +
          '</div>';

        card.appendChild(body);
      }

      container.appendChild(card);
    });

    // Bind action buttons
    container.querySelectorAll(".ed-btn-up").forEach(function (btn) {
      btn.addEventListener("click", function (e) { e.stopPropagation(); self._saveExpandedCheckpoint(); self._moveCheckpoint(parseInt(btn.dataset.i), -1); });
    });
    container.querySelectorAll(".ed-btn-down").forEach(function (btn) {
      btn.addEventListener("click", function (e) { e.stopPropagation(); self._saveExpandedCheckpoint(); self._moveCheckpoint(parseInt(btn.dataset.i), 1); });
    });
    container.querySelectorAll(".ed-btn-rm").forEach(function (btn) {
      btn.addEventListener("click", function (e) { e.stopPropagation(); self._removeCheckpoint(parseInt(btn.dataset.i)); });
    });
    container.querySelectorAll(".ed-btn-place").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        self._saveExpandedCheckpoint();
        self._placingCpIndex = parseInt(btn.dataset.i);
        self._showStep(2);
        App._showToast("Touchez la carte pour placer l'etape " + (self._placingCpIndex + 1));
        document.getElementById("editor-map").classList.add("editor-map-placing");
      });
    });
    container.querySelectorAll(".ed-btn-add-hint").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var ci = parseInt(btn.dataset.cp);
        self._saveExpandedCheckpoint();
        self._tempCheckpoints[ci].hints.push({ text: "", penalty: 5 });
        self._renderCheckpointList();
      });
    });
    container.querySelectorAll(".ed-hint-remove").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var ci = self._expandedCp;
        var hi = parseInt(btn.dataset.hi);
        self._saveExpandedCheckpoint();
        self._tempCheckpoints[ci].hints.splice(hi, 1);
        self._renderCheckpointList();
      });
    });
  },

  _validateCheckpoints() {
    if (this._tempCheckpoints.length < 2) {
      App._showToast("Ajoutez au moins 2 etapes");
      return false;
    }
    for (var i = 0; i < this._tempCheckpoints.length; i++) {
      if (!this._tempCheckpoints[i].name.trim()) {
        App._showToast("L'etape " + (i + 1) + " n'a pas de nom");
        this._expandedCp = i;
        this._renderCheckpointList();
        return false;
      }
    }
    return true;
  },

  // ===== Step 3: Map =====
  _initEditorMap() {
    if (this._mapInstance) return;
    var center = this._computeCenter();
    this._mapInstance = L.map("editor-map", { center: center, zoom: 6, zoomControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 18,
    }).addTo(this._mapInstance);

    var self = this;
    this._mapInstance.on("click", function (e) {
      if (self._placingCpIndex !== null) {
        self._tempCheckpoints[self._placingCpIndex].lat = Math.round(e.latlng.lat * 10000) / 10000;
        self._tempCheckpoints[self._placingCpIndex].lng = Math.round(e.latlng.lng * 10000) / 10000;
        document.getElementById("editor-map").classList.remove("editor-map-placing");
        App._showToast("Position enregistree !");
        self._placingCpIndex = null;
        self._refreshEditorMarkers();
      }
    });
  },

  _destroyEditorMap() {
    if (this._mapInstance) {
      this._mapInstance.remove();
      this._mapInstance = null;
    }
    this._markers = {};
    this._placingCpIndex = null;
  },

  _refreshEditorMarkers() {
    var self = this;
    Object.values(this._markers).forEach(function (m) { m.remove(); });
    this._markers = {};

    this._tempCheckpoints.forEach(function (cp, i) {
      if (!cp.lat || !cp.lng) return;
      var marker = L.marker([cp.lat, cp.lng], {
        draggable: true,
        icon: self._makeEditorIcon(i + 1),
      }).addTo(self._mapInstance);
      marker.bindPopup(_esc(cp.name || "Etape " + (i + 1)));
      marker.on("dragend", function (e) {
        var pos = e.target.getLatLng();
        self._tempCheckpoints[i].lat = Math.round(pos.lat * 10000) / 10000;
        self._tempCheckpoints[i].lng = Math.round(pos.lng * 10000) / 10000;
      });
      self._markers[i] = marker;
    });

    // Fit bounds
    var placed = this._tempCheckpoints.filter(function (cp) { return cp.lat && cp.lng; });
    if (placed.length > 0) {
      var bounds = L.latLngBounds(placed.map(function (cp) { return [cp.lat, cp.lng]; }));
      this._mapInstance.fitBounds(bounds, { padding: [40, 40] });
    }
  },

  _makeEditorIcon(number) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="44" viewBox="0 0 32 44">' +
      '<path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 28 16 28s16-16 16-28C32 7.16 24.84 0 16 0z" fill="#d97706" stroke="#fff" stroke-width="1.5"/>' +
      '<circle cx="16" cy="15" r="10" fill="#fff" opacity="0.9"/>' +
      '<text x="16" y="19" text-anchor="middle" font-size="12" font-weight="bold" fill="#d97706" font-family="sans-serif">' + number + '</text>' +
      '</svg>';
    return L.divIcon({ html: svg, className: "editor-marker", iconSize: [32, 44], iconAnchor: [16, 44], popupAnchor: [0, -44] });
  },

  _computeCenter() {
    var placed = this._tempCheckpoints.filter(function (cp) { return cp.lat && cp.lng; });
    if (placed.length === 0) return [46.8, 2.3]; // France center
    var lat = placed.reduce(function (s, c) { return s + c.lat; }, 0) / placed.length;
    var lng = placed.reduce(function (s, c) { return s + c.lng; }, 0) / placed.length;
    return [lat, lng];
  },

  _validateMap() {
    for (var i = 0; i < this._tempCheckpoints.length; i++) {
      if (!this._tempCheckpoints[i].lat || !this._tempCheckpoints[i].lng) {
        App._showToast("L'etape " + (i + 1) + " n'est pas placee sur la carte");
        return false;
      }
    }
    return true;
  },

  // ===== Step 4: Preview =====
  _renderPreview() {
    var meta = this._collectMetadata();
    var totalPts = this._tempCheckpoints.reduce(function (s, c) { return s + (c.points || 0); }, 0);
    var totalBonus = this._tempCheckpoints.reduce(function (s, c) { return s + (c.bonusPoints || 0); }, 0);

    var listHtml = "";
    this._tempCheckpoints.forEach(function (cp, i) {
      listHtml += '<div class="editor-preview-stat"><span>' + (i + 1) + '. ' + _esc(cp.name || "Etape") + '</span><span>' + cp.points + ' pts' + (cp.bonusPoints ? ' + ' + cp.bonusPoints : '') + '</span></div>';
    });

    document.getElementById("editor-preview").innerHTML =
      '<div class="editor-preview-card">' +
        '<div class="editor-preview-header" style="background: linear-gradient(135deg, ' + _escAttr(meta.theme.primary) + ', ' + _escAttr(meta.theme.primaryLight) + ')">' +
          '<h3>' + _esc(meta.name) + '</h3>' +
          '<p>' + _esc(meta.subtitle || '') + '</p>' +
        '</div>' +
        '<div class="editor-preview-body">' +
          '<div class="editor-preview-stat"><strong>Etapes</strong><strong>' + this._tempCheckpoints.length + '</strong></div>' +
          '<div class="editor-preview-stat"><strong>Points max</strong><strong>' + (totalPts + totalBonus) + '</strong></div>' +
          listHtml +
        '</div>' +
      '</div>';
  },

  // ===== Publish =====
  _publishRally() {
    var meta = this._collectMetadata();
    if (!meta.name || !meta.shortName) { App._showToast("Informations incompletes"); return; }
    this._saveExpandedCheckpoint();

    var isEdit = !!this._editingRally;
    var rally = {
      id: isEdit ? this._editingRally.id : "custom_" + Date.now(),
      name: meta.name,
      shortName: meta.shortName,
      subtitle: meta.subtitle,
      description: meta.description || (this._tempCheckpoints.length + " etapes"),
      rulesIntro: "Suivez le parcours a travers",
      rulesHighlight: this._tempCheckpoints.length + " etapes de " + meta.shortName,
      mapCenter: this._computeCenter(),
      mapZoom: 10,
      theme: meta.theme,
      _custom: true,
      _createdAt: isEdit ? this._editingRally._createdAt : new Date().toISOString(),
      _updatedAt: new Date().toISOString(),
      checkpoints: this._tempCheckpoints.map(function (cp, i) {
        return {
          id: i + 1,
          name: cp.name,
          description: cp.description || "",
          photoHint: cp.photoHint || "",
          lat: cp.lat,
          lng: cp.lng,
          points: cp.points || 10,
          bonusChallenge: cp.bonusChallenge || "",
          bonusPoints: cp.bonusPoints || 0,
          info: cp.info || {},
          hints: cp.hints || [],
        };
      }),
    };

    // If editing and checkpoint count changed, warn about progress reset
    if (isEdit) {
      var savedState = localStorage.getItem("rallyPhoto_" + rally.id);
      if (savedState) {
        try {
          var state = JSON.parse(savedState);
          if (state.started) {
            localStorage.removeItem("rallyPhoto_" + rally.id);
          }
        } catch (e) {}
      }
    }

    this._saveRally(rally);
    App._showToast(isEdit ? "Rally mis a jour !" : "Rally cree !");
    this._closeEditor();
  },

  // ===== Import / Export =====
  exportRally(rallyId) {
    var customs = this._loadCustomRallies();
    var rally = customs.find(function (r) { return r.id === rallyId; });
    if (!rally) return;

    var exported = JSON.parse(JSON.stringify(rally));
    exported._sourceId = rally.id;
    delete exported._custom;
    delete exported._createdAt;
    delete exported._updatedAt;

    var data = { type: "rally-photo-custom", version: 1, exportDate: new Date().toISOString(), rally: exported };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var link = document.createElement("a");
    link.download = "rally-" + rally.shortName.toLowerCase().replace(/\s+/g, "-") + ".json";
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    App._showToast("Rally exporte !");
  },

  // ===== Share Rally via QR / Link =====
  shareRally(rallyId) {
    var rally = RALLIES.find(function (r) { return r.id === rallyId; });
    if (!rally) {
      App._showToast("Rally introuvable");
      return;
    }
    this._showShareModal(rally);
  },

  _prepareShareData(rally) {
    var shareable = {
      name: rally.name,
      shortName: rally.shortName,
      subtitle: rally.subtitle || "",
      description: rally.description || "",
      mapCenter: rally.mapCenter,
      mapZoom: rally.mapZoom || 10,
      theme: rally.theme,
      checkpoints: rally.checkpoints.map(function (cp) {
        var obj = { id: cp.id, name: cp.name, lat: cp.lat, lng: cp.lng, points: cp.points };
        if (cp.description) obj.description = cp.description;
        if (cp.photoHint) obj.photoHint = cp.photoHint;
        if (cp.bonusChallenge) obj.bonusChallenge = cp.bonusChallenge;
        if (cp.bonusPoints) obj.bonusPoints = cp.bonusPoints;
        if (cp.info && Object.keys(cp.info).length > 0) obj.info = cp.info;
        if (cp.hints && cp.hints.length > 0) obj.hints = cp.hints;
        return obj;
      }),
    };
    if (rally.rulesIntro) shareable.rulesIntro = rally.rulesIntro;
    if (rally.rulesHighlight) shareable.rulesHighlight = rally.rulesHighlight;
    shareable._sourceId = rally.id;
    return shareable;
  },

  _generateShareUrl(rally) {
    var data = this._prepareShareData(rally);
    var json = JSON.stringify(data);
    var compressed = LZString.compressToEncodedURIComponent(json);
    var base = window.location.origin + window.location.pathname;
    return base + "#/join/" + compressed;
  },

  _showShareModal(rally) {
    var url = this._generateShareUrl(rally);
    var totalPts = rally.checkpoints.reduce(function (s, c) { return s + c.points + (c.bonusPoints || 0); }, 0);

    document.getElementById("share-rally-name").textContent = rally.name;
    document.getElementById("share-rally-info").textContent =
      rally.checkpoints.length + " etapes \u00B7 " + totalPts + " pts max";
    document.getElementById("share-link-input").value = url;

    var qrContainer = document.getElementById("share-qr-container");
    var canvas = document.getElementById("share-qr-canvas");
    var warning = document.getElementById("share-size-warning");

    var compressedPart = url.split("#/join/")[1] || "";
    var dataLength = compressedPart.length;

    if (dataLength > 4000) {
      qrContainer.classList.add("hidden");
      warning.classList.remove("hidden");
      warning.textContent = "Ce rally est trop volumineux pour un QR code (" +
        Math.round(dataLength / 1000) + " Ko). Utilisez le lien ou le partage direct.";
    } else {
      qrContainer.classList.remove("hidden");
      if (dataLength > 2500) {
        warning.classList.remove("hidden");
        warning.textContent = "QR code volumineux \u2014 le scan pourrait etre difficile sur certains appareils.";
      } else {
        warning.classList.add("hidden");
      }
      this._renderQRCode(url, canvas);
    }

    var nativeShareBtn = document.getElementById("btn-native-share");
    if (navigator.share) {
      nativeShareBtn.classList.remove("hidden");
    } else {
      nativeShareBtn.classList.add("hidden");
    }

    this._bindShareModalEvents(rally, url);
    document.getElementById("share-rally-dialog").classList.remove("hidden");
  },

  _renderQRCode(url, canvas) {
    var errorCorrection = url.length > 2000 ? "L" : "M";
    var qr = qrcode(0, errorCorrection);
    qr.addData(url);
    qr.make();

    var moduleCount = qr.getModuleCount();
    var cellSize = Math.max(2, Math.floor(200 / moduleCount));
    var size = moduleCount * cellSize + 16;

    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = "#000000";
    for (var r = 0; r < moduleCount; r++) {
      for (var c = 0; c < moduleCount; c++) {
        if (qr.isDark(r, c)) {
          ctx.fillRect(8 + c * cellSize, 8 + r * cellSize, cellSize, cellSize);
        }
      }
    }
  },

  _bindShareModalEvents(rally, url) {
    var dialog = document.getElementById("share-rally-dialog");

    document.getElementById("btn-close-share").onclick = function () {
      dialog.classList.add("hidden");
    };

    document.getElementById("btn-copy-share-link").onclick = function () {
      var input = document.getElementById("share-link-input");
      var btn = document.getElementById("btn-copy-share-link");
      navigator.clipboard.writeText(input.value).then(function () {
        App._showToast("Lien copie !");
        btn.textContent = "Copie !";
        setTimeout(function () { btn.textContent = "Copier"; }, 2000);
      }).catch(function () {
        input.select();
        document.execCommand("copy");
        App._showToast("Lien copie !");
      });
    };

    document.getElementById("btn-download-qr").onclick = function () {
      var canvas = document.getElementById("share-qr-canvas");
      var link = document.createElement("a");
      link.download = "rally-" + (rally.shortName || "photo").toLowerCase().replace(/\s+/g, "-") + "-qr.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
      App._showToast("QR code telecharge !");
    };

    document.getElementById("btn-native-share").onclick = function () {
      navigator.share({
        title: "Rejoindre : " + rally.name,
        text: "Rejoignez le rally photo \"" + rally.name + "\" !",
        url: url,
      }).catch(function (e) {
        if (e.name !== "AbortError") {
          App._showToast("Erreur de partage");
        }
      });
    };
  },

  async importRally(file) {
    try {
      var text = await file.text();
      var data = JSON.parse(text);
      if (data.type !== "rally-photo-custom" || !data.rally || !data.rally.checkpoints) {
        App._showToast("Fichier invalide");
        return;
      }
      var rally = data.rally;
      if (!rally.name || !rally.checkpoints || rally.checkpoints.length < 2) {
        App._showToast("Le rally doit avoir un nom et au moins 2 etapes");
        return;
      }
      var validErr = _validateRallyData(rally);
      if (validErr) {
        App._showToast(validErr);
        return;
      }
      rally.id = "custom_" + Date.now();
      rally._custom = true;
      rally._createdAt = new Date().toISOString();
      rally._updatedAt = rally._createdAt;
      rally.checkpoints.forEach(function (cp, i) { cp.id = i + 1; });
      if (!rally.shortName) rally.shortName = rally.name.substring(0, 20);
      if (!rally.mapCenter) {
        var placed = rally.checkpoints.filter(function (c) { return c.lat && c.lng; });
        if (placed.length) {
          rally.mapCenter = [
            placed.reduce(function (s, c) { return s + c.lat; }, 0) / placed.length,
            placed.reduce(function (s, c) { return s + c.lng; }, 0) / placed.length,
          ];
        } else {
          rally.mapCenter = [46.8, 2.3];
        }
      }
      if (!rally.mapZoom) rally.mapZoom = 10;
      if (!rally.theme) rally.theme = { primary: "#1e3a5f", primaryLight: "#2c5282", accent: "#d97706", accentLight: "#fbbf24" };
      if (!rally.rulesIntro) rally.rulesIntro = "Suivez le parcours a travers";
      if (!rally.rulesHighlight) rally.rulesHighlight = rally.checkpoints.length + " etapes";

      this._saveRally(rally);
      App._showToast("Rally importe : " + rally.name);
      this._renderCustomRallyList();
    } catch (e) {
      App._showToast("Erreur lors de l'import");
      console.error("[RallyEditor] Import error:", e);
    }
  },
};

// ===== Helpers =====
function _esc(s) { var d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; }
function _escAttr(s) { return (s || "").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function _validateRallyData(r) {
  var _s = function (v, max) { return typeof v === "string" && v.length <= (max || 500); };
  var _n = function (v, min, max) { return typeof v === "number" && isFinite(v) && v >= min && v <= max; };
  var _hex = function (v) { return typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v); };

  if (!r || typeof r !== "object") return "Donnees invalides";
  if (!_s(r.name, 100) || !r.name.trim()) return "Nom du rally manquant ou trop long";
  if (r.subtitle !== undefined && !_s(r.subtitle, 200)) return "Sous-titre trop long";
  if (r.description !== undefined && !_s(r.description, 2000)) return "Description trop longue";
  if (r.shortName !== undefined && !_s(r.shortName, 40)) return "Nom court trop long";
  if (r.rulesIntro !== undefined && !_s(r.rulesIntro, 500)) return "Texte regles trop long";
  if (r.rulesHighlight !== undefined && !_s(r.rulesHighlight, 500)) return "Texte regles trop long";

  if (r.theme) {
    if (typeof r.theme !== "object") return "Theme invalide";
    var colors = ["primary", "primaryLight", "accent", "accentLight"];
    for (var ci = 0; ci < colors.length; ci++) {
      if (r.theme[colors[ci]] !== undefined && !_hex(r.theme[colors[ci]])) return "Couleur de theme invalide : " + colors[ci];
    }
  }

  if (r.mapCenter) {
    if (!Array.isArray(r.mapCenter) || r.mapCenter.length !== 2 ||
      !_n(r.mapCenter[0], -90, 90) || !_n(r.mapCenter[1], -180, 180)) return "Coordonnees centre carte invalides";
  }
  if (r.mapZoom !== undefined && !_n(r.mapZoom, 1, 20)) return "Zoom carte invalide";

  if (!Array.isArray(r.checkpoints) || r.checkpoints.length < 2) return "Il faut au moins 2 etapes";
  if (r.checkpoints.length > 200) return "Trop d'etapes (max 200)";

  for (var i = 0; i < r.checkpoints.length; i++) {
    var cp = r.checkpoints[i];
    if (!cp || typeof cp !== "object") return "Etape " + (i + 1) + " invalide";
    if (!_s(cp.name, 100) || !cp.name.trim()) return "Etape " + (i + 1) + " : nom manquant ou trop long";
    if (cp.lat !== undefined && !_n(cp.lat, -90, 90)) return "Etape " + (i + 1) + " : latitude invalide";
    if (cp.lng !== undefined && !_n(cp.lng, -180, 180)) return "Etape " + (i + 1) + " : longitude invalide";
    if (cp.points !== undefined && !_n(cp.points, 0, 1000)) return "Etape " + (i + 1) + " : points invalides";
    if (cp.bonusPoints !== undefined && !_n(cp.bonusPoints, 0, 1000)) return "Etape " + (i + 1) + " : points bonus invalides";
    if (cp.description !== undefined && !_s(cp.description, 1000)) return "Etape " + (i + 1) + " : description trop longue";
    if (cp.photoHint !== undefined && !_s(cp.photoHint, 500)) return "Etape " + (i + 1) + " : indice photo trop long";
    if (cp.bonusChallenge !== undefined && !_s(cp.bonusChallenge, 500)) return "Etape " + (i + 1) + " : defi bonus trop long";
    if (cp.hints) {
      if (!Array.isArray(cp.hints) || cp.hints.length > 10) return "Etape " + (i + 1) + " : indices invalides";
      for (var hi = 0; hi < cp.hints.length; hi++) {
        var h = cp.hints[hi];
        if (!h || typeof h !== "object") return "Etape " + (i + 1) + " : indice " + (hi + 1) + " invalide";
        if (!_s(h.text, 500)) return "Etape " + (i + 1) + " : texte indice trop long";
        if (h.penalty !== undefined && !_n(h.penalty, 0, 100)) return "Etape " + (i + 1) + " : penalite indice invalide";
      }
    }
  }
  return null; // valid
}
function _lightenColor(hex, percent) {
  var num = parseInt(hex.replace("#", ""), 16);
  var r = Math.min(255, (num >> 16) + Math.round(2.55 * percent));
  var g = Math.min(255, ((num >> 8) & 0x00FF) + Math.round(2.55 * percent));
  var b = Math.min(255, (num & 0x0000FF) + Math.round(2.55 * percent));
  return "#" + (0x1000000 + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// Rally Photo — Leaflet Map, Markers & Geolocation

const RallyMap = {
  _map: null,
  _markers: {},
  _markerStatus: {},
  _routeLine: null,
  _userMarker: null,
  _watchId: null,
  _gpsPaused: false,
  _lastAccuracy: null,
  _gpsDebounceTimer: null,
  _pendingPosition: null,

  init() {
    const center = currentRally ? currentRally.mapCenter : [48.85, 0.0];
    const zoom = currentRally ? currentRally.mapZoom : 8;
    this._map = L.map("map", {
      center: center,
      zoom: zoom,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(this._map);

    this._drawRoute();
    this._addMarkers();
    this._startGeolocation();

    window.addEventListener("resize", () => {
      if (this._map) this._map.invalidateSize();
    });
  },

  destroy() {
    this.stopGeolocation();
    if (this._map) {
      this._map.remove();
      this._map = null;
    }
    this._markers = {};
    this._routeLine = null;
    this._completedLine = null;
    this._userMarker = null;
  },

  _makeIcon(status, number) {
    const colors = {
      locked: "#9ca3af",
      current: "#d97706",
      completed: "#16a34a",
    };
    const bg = colors[status] || colors.locked;
    // Accessible: use distinct inner content per status (not just color)
    let inner;
    if (status === "completed") {
      // Checkmark
      inner = `<path d="M11 15 l3 3 l7 -7" fill="none" stroke="${bg}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    } else if (status === "locked") {
      // Lock icon
      inner = `<rect x="12" y="14" width="8" height="6" rx="1" fill="${bg}"/><path d="M13.5 14v-2a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="${bg}" stroke-width="1.5"/>`;
    } else {
      // Current: show the number
      inner = `<text x="16" y="19" text-anchor="middle" font-size="12" font-weight="bold" fill="${bg}" font-family="sans-serif">${number}</text>`;
    }
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="44" viewBox="0 0 32 44">
        <path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 28 16 28s16-16 16-28C32 7.16 24.84 0 16 0z" fill="${bg}" stroke="#fff" stroke-width="1.5"/>
        <circle cx="16" cy="15" r="10" fill="#fff" opacity="0.9"/>
        ${inner}
      </svg>`;
    return L.divIcon({
      html: svg,
      className: "rally-marker",
      iconSize: [32, 44],
      iconAnchor: [16, 44],
      popupAnchor: [0, -44],
    });
  },

  _makeUserIcon() {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pulse = reduceMotion ? "" :
      '<animate attributeName="r" values="10;14;10" dur="2s" repeatCount="indefinite"/>' +
      '<animate attributeName="fill-opacity" values="0.2;0.08;0.2" dur="2s" repeatCount="indefinite"/>';
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="14" fill="#3b82f6" fill-opacity="0.12" stroke="#3b82f6" stroke-width="1.5" stroke-opacity="0.4">
          ${pulse}
        </circle>
        <circle cx="16" cy="16" r="6" fill="#3b82f6"/>
        <circle cx="16" cy="16" r="3" fill="#fff" fill-opacity="0.6"/>
      </svg>`;
    return L.divIcon({
      html: svg,
      className: "user-marker",
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  },

  _accuracyCircle: null,

  _getStatus(cp) {
    const state = GameState.get();
    if (state.completed[cp.id]) return "completed";
    if (GameState.isCurrent(cp.id)) return "current";
    return "locked";
  },

  _addMarkers() {
    CHECKPOINTS.forEach((cp) => {
      const status = this._getStatus(cp);
      const marker = L.marker([cp.lat, cp.lng], {
        icon: this._makeIcon(status, cp.id),
      }).addTo(this._map);

      marker.on("click", () => {
        App.openCheckpointPanel(cp.id);
      });

      this._markers[cp.id] = marker;
      this._markerStatus[cp.id] = status;
    });
  },

  _completedLine: null,

  _drawRoute() {
    const latlngs = CHECKPOINTS.map((cp) => [cp.lat, cp.lng]);
    const routeColor = currentRally ? currentRally.theme.primary : "#1e3a5f";
    // Remaining route (dashed)
    this._routeLine = L.polyline(latlngs, {
      color: routeColor,
      weight: 2,
      opacity: 0.4,
      dashArray: "8 6",
    }).addTo(this._map);
    // Completed route (solid green, drawn on top)
    this._completedLine = L.polyline([], {
      color: "#16a34a",
      weight: 3,
      opacity: 0.7,
    }).addTo(this._map);
    this._updateRouteLine();
  },

  _updateRouteLine() {
    if (!this._completedLine) return;
    const completedCoords = [];
    for (const cp of CHECKPOINTS) {
      if (GameState.isCompleted(cp.id)) {
        completedCoords.push([cp.lat, cp.lng]);
      } else {
        // Include the next uncompleted one to connect the line
        completedCoords.push([cp.lat, cp.lng]);
        break;
      }
    }
    this._completedLine.setLatLngs(completedCoords);
  },

  // --- Geolocation ---
  _startGeolocation() {
    if (!navigator.geolocation) {
      App._showToast("Geolocalisation non disponible sur cet appareil");
      return;
    }

    this._watchId = navigator.geolocation.watchPosition(
      (pos) => this._onPosition(pos),
      (err) => this._onGeoError(err),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
  },

  pauseGeolocation() {
    if (this._gpsPaused) return;
    this._gpsPaused = true;
    if (this._watchId != null) {
      navigator.geolocation.clearWatch(this._watchId);
      this._watchId = null;
    }
    if (this._gpsDebounceTimer) {
      clearTimeout(this._gpsDebounceTimer);
      this._gpsDebounceTimer = null;
      this._pendingPosition = null;
    }
  },

  resumeGeolocation() {
    if (!this._gpsPaused) return;
    this._gpsPaused = false;
    this._geoErrorShown = false;
    this._startGeolocation();
  },

  isGpsPaused() {
    return this._gpsPaused;
  },

  getLastAccuracy() {
    return this._lastAccuracy;
  },

  stopGeolocation() {
    if (this._watchId != null) {
      navigator.geolocation.clearWatch(this._watchId);
      this._watchId = null;
    }
    if (this._gpsDebounceTimer) {
      clearTimeout(this._gpsDebounceTimer);
      this._gpsDebounceTimer = null;
      this._pendingPosition = null;
    }
    if (this._userMarker) {
      this._userMarker.remove();
      this._userMarker = null;
    }
    if (this._accuracyCircle) {
      this._accuracyCircle.remove();
      this._accuracyCircle = null;
    }
    this._geoErrorShown = false;
  },

  _onGeoError(err) {
    if (this._geoErrorShown) return;
    this._geoErrorShown = true;
    const messages = {
      1: "Position refusee. Activez la localisation pour voir votre position.",
      2: "Position indisponible. Verifiez votre connexion GPS.",
      3: "Delai depasse. Reessayez en exterieur.",
    };
    App._showToast(messages[err.code] || "Erreur de geolocalisation");
  },

  _onPosition(pos) {
    this._pendingPosition = pos;
    if (!this._gpsDebounceTimer) {
      this._gpsDebounceTimer = setTimeout(() => {
        this._gpsDebounceTimer = null;
        if (this._pendingPosition) {
          this._processPosition(this._pendingPosition);
          this._pendingPosition = null;
        }
      }, 400);
    }
  },

  _processPosition(pos) {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const accuracy = pos.coords.accuracy;
    this._lastAccuracy = accuracy;

    if (!this._userMarker) {
      this._userMarker = L.marker([lat, lng], {
        icon: this._makeUserIcon(),
        zIndexOffset: -100,
      }).addTo(this._map);
    } else {
      this._userMarker.setLatLng([lat, lng]);
    }

    // Accuracy circle
    if (accuracy && accuracy < 500) {
      if (!this._accuracyCircle) {
        this._accuracyCircle = L.circle([lat, lng], {
          radius: accuracy,
          color: "#3b82f6",
          fillColor: "#3b82f6",
          fillOpacity: 0.06,
          weight: 1,
          opacity: 0.25,
        }).addTo(this._map);
      } else {
        this._accuracyCircle.setLatLng([lat, lng]);
        this._accuracyCircle.setRadius(accuracy);
      }
    }

    // Update GPS accuracy indicator in HUD
    this._updateGpsAccuracy(accuracy);

    // Check proximity to checkpoints (within ~200m)
    CHECKPOINTS.forEach((cp) => {
      if (GameState.isCompleted(cp.id)) return;
      if (GameState.isLocked(cp.id)) return;
      const dist = this._distance(lat, lng, cp.lat, cp.lng);
      if (dist < 200) {
        App.showProximityToast(cp);
      }
    });

    // Update distance to next target
    this._updateDistanceDisplay(lat, lng);
  },

  _distance(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  refreshMarker(cpId) {
    const cp = CHECKPOINTS.find((c) => c.id === cpId);
    if (!cp || !this._markers[cpId]) return;
    const newStatus = this._getStatus(cp);
    if (this._markerStatus[cpId] !== newStatus) {
      this._markers[cpId].setIcon(this._makeIcon(newStatus, cp.id));
      this._markerStatus[cpId] = newStatus;
    }
  },

  refreshMarkers() {
    CHECKPOINTS.forEach((cp) => {
      this.refreshMarker(cp.id);
    });
    this._updateRouteLine();
  },

  flyTo(checkpointId) {
    const cp = CHECKPOINTS.find((c) => c.id === checkpointId);
    if (cp) {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        this._map.setView([cp.lat, cp.lng], 11);
      } else {
        this._map.flyTo([cp.lat, cp.lng], 11, { duration: 1 });
      }
    }
  },

  fitAll() {
    const bounds = L.latLngBounds(CHECKPOINTS.map((cp) => [cp.lat, cp.lng]));
    this._map.fitBounds(bounds, { padding: [40, 40] });
  },

  invalidateSize() {
    if (this._map) this._map.invalidateSize();
  },

  centerOnUser() {
    if (this._userMarker) {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        this._map.setView(this._userMarker.getLatLng(), 13);
      } else {
        this._map.flyTo(this._userMarker.getLatLng(), 13, { duration: 1 });
      }
    }
  },

  _updateGpsAccuracy(accuracy) {
    const el = document.getElementById("hud-gps-accuracy");
    if (!el) return;
    el.className = "hud-gps-accuracy";
    if (accuracy <= 15) {
      el.textContent = "GPS \u25CF";
      el.classList.add("gps-good");
      el.title = "Precision GPS : excellente (" + Math.round(accuracy) + "m)";
    } else if (accuracy <= 50) {
      el.textContent = "GPS \u25CF";
      el.classList.add("gps-medium");
      el.title = "Precision GPS : moyenne (" + Math.round(accuracy) + "m)";
    } else {
      el.textContent = "GPS \u25CF";
      el.classList.add("gps-poor");
      el.title = "Precision GPS : faible (" + Math.round(accuracy) + "m)";
    }
  },

  _updateDistanceDisplay(lat, lng) {
    const el = document.getElementById("hud-distance");
    if (!el) return;
    // Find the nearest uncompleted & unlocked checkpoint
    let nearest = null;
    let minDist = Infinity;
    CHECKPOINTS.forEach((cp) => {
      if (GameState.isCompleted(cp.id)) return;
      if (GameState.isLocked(cp.id)) return;
      const d = this._distance(lat, lng, cp.lat, cp.lng);
      if (d < minDist) { minDist = d; nearest = cp; }
    });
    if (nearest) {
      el.textContent = minDist < 1000
        ? Math.round(minDist) + " m"
        : (minDist / 1000).toFixed(1) + " km";
    } else {
      el.textContent = "";
    }
  },

  // --- Offline tile pre-caching ---

  _latlngToTile(lat, lng, zoom) {
    const n = Math.pow(2, zoom);
    const x = Math.floor(((lng + 180) / 360) * n);
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    return { x, y };
  },

  _getTileUrls() {
    if (!CHECKPOINTS || CHECKPOINTS.length === 0) return [];

    // Bounding box from checkpoints with ~2km padding (~0.02 degrees)
    const PAD = 0.02;
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    CHECKPOINTS.forEach(cp => {
      if (cp.lat < minLat) minLat = cp.lat;
      if (cp.lat > maxLat) maxLat = cp.lat;
      if (cp.lng < minLng) minLng = cp.lng;
      if (cp.lng > maxLng) maxLng = cp.lng;
    });
    minLat -= PAD; maxLat += PAD;
    minLng -= PAD; maxLng += PAD;

    const subdomains = ["a", "b", "c"];
    const urls = [];
    let subIdx = 0;

    // Zoom 8–14: full bounding box
    for (let z = 8; z <= 14; z++) {
      const topLeft = this._latlngToTile(maxLat, minLng, z);
      const bottomRight = this._latlngToTile(minLat, maxLng, z);
      for (let x = topLeft.x; x <= bottomRight.x; x++) {
        for (let y = topLeft.y; y <= bottomRight.y; y++) {
          const s = subdomains[subIdx % 3];
          subIdx++;
          urls.push(`https://${s}.tile.openstreetmap.org/${z}/${x}/${y}.png`);
        }
      }
    }

    // Zoom 15–16: only around each checkpoint (~500m radius ≈ 0.005°)
    const CP_PAD = 0.005;
    for (let z = 15; z <= 16; z++) {
      const seen = new Set();
      CHECKPOINTS.forEach(cp => {
        const tl = this._latlngToTile(cp.lat + CP_PAD, cp.lng - CP_PAD, z);
        const br = this._latlngToTile(cp.lat - CP_PAD, cp.lng + CP_PAD, z);
        for (let x = tl.x; x <= br.x; x++) {
          for (let y = tl.y; y <= br.y; y++) {
            const key = `${z}/${x}/${y}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const s = subdomains[subIdx % 3];
            subIdx++;
            urls.push(`https://${s}.tile.openstreetmap.org/${z}/${x}/${y}.png`);
          }
        }
      });
    }

    return urls;
  },

  async precacheTiles(onProgress) {
    const urls = this._getTileUrls();
    if (urls.length === 0) return;

    const CACHE_NAME = "rally-tiles";
    const cache = await caches.open(CACHE_NAME);
    const CONCURRENCY = 6;
    let done = 0;
    const total = urls.length;

    if (onProgress) onProgress(0, total);

    // Filter out already-cached URLs
    const toFetch = [];
    for (const url of urls) {
      const existing = await cache.match(url);
      if (existing) {
        done++;
      } else {
        toFetch.push(url);
      }
    }

    if (onProgress) onProgress(done, total);
    if (toFetch.length === 0) return;

    // Fetch in batches of CONCURRENCY
    let i = 0;
    while (i < toFetch.length) {
      const batch = toFetch.slice(i, i + CONCURRENCY);
      await Promise.allSettled(
        batch.map(url =>
          fetch(url, { mode: "cors" }).then(res => {
            if (res.ok) {
              return cache.put(url, res);
            }
          })
        )
      );
      done += batch.length;
      if (onProgress) onProgress(done, total);
      i += CONCURRENCY;
    }
  },
};

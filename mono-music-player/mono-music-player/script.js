/* ── Helpers ────────────────────────────────────────── */

function titleFromFilename(path) {
  const filename = path.split("/").pop();
  const name = filename.replace(/\.[^/.]+$/, "");
  return name
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  }[character]));
}

function encodeAudioPath(path) {
  return path.split("/").map(segment => encodeURIComponent(segment)).join("/");
}

function formatTime(sec) {
  if (!sec || isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/* ── Build playlist data from songs array (defined in songs.js) ── */

let playlist = songs.map(path => ({
  title: titleFromFilename(path),
  artist: "Local Audio",
  src: path
}));

/* ── DOM references ────────────────────────────────── */

const $ = id => document.getElementById(id);

const audio        = $("audioPlayer");
const songTitle    = $("songTitle");
const songArtist   = $("songArtist");
const currentFavoriteBtn = $("currentFavoriteBtn");
const progressBar  = $("progressBar");
const currentTime  = $("currentTime");
const duration     = $("duration");
const playBtn      = $("playBtn");
const seekBackBtn  = $("seekBackBtn");
const seekForwardBtn = $("seekForwardBtn");
const prevBtn      = $("prevBtn");
const nextBtn      = $("nextBtn");
const shuffleBtn   = $("shuffleBtn");
const repeatBtn    = $("repeatBtn");
const volumeBar    = $("volumeBar");
const volumeValue  = $("volumeValue");
const searchInput  = $("searchInput");
const songCount    = $("songCount");
const headerSongCount = $("headerSongCount");
const allSongCount = $("allSongCount");
const favoriteCount = $("favoriteCount");
const allSongsFilterBtn = $("allSongsFilter");
const favoritesFilterBtn = $("favoritesFilter");
const addDeviceSongsBtn = $("addDeviceSongsBtn");
const deviceSongInput = $("deviceSongInput");
const playlistEl   = $("playlist");
const statusMsg    = $("statusMessage");

// Sidebar elements
const sidebar        = $("sidebar");
const sidebarOverlay = $("sidebarOverlay");
const sidebarToggle  = $("sidebarToggle");
const sidebarClose   = $("sidebarClose");
const appShell       = document.querySelector(".app");

/* ── State ─────────────────────────────────────────── */

let currentIndex  = -1;
let isPlaying     = false;
let isShuffle     = false;
let repeatMode    = 0;          // 0 = off, 1 = all, 2 = one
let filteredList  = [...playlist];
let sidebarOpen   = false;
let activePlaylistFilter = "all";

const FAVORITES_STORAGE_KEY = "mono-music-player-favorites";
function readFavoriteSources() {
  try {
    const saved = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || "[]");
    return new Set(Array.isArray(saved) ? saved.filter(source => typeof source === "string") : []);
  } catch (_) {
    return new Set();
  }
}

let favoriteSources = readFavoriteSources();
function favoriteKey(song) {
  return song.deviceSong ? `device:${song.id}` : song.src;
}

let deviceDatabasePromise = null;
let currentDeviceAudioUrl = null;

function getDeviceDatabase() {
  if (deviceDatabasePromise) return deviceDatabasePromise;
  if (!window.indexedDB) return Promise.reject(new Error("IndexedDB is unavailable in this browser."));

  deviceDatabasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open("mono-music-player-library", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("deviceSongs")) db.createObjectStore("deviceSongs", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open device storage."));
    request.onblocked = () => reject(new Error("Device storage is busy in another tab. Close the other player tab and try again."));
  });

  return deviceDatabasePromise;
}

async function getStoredDeviceSongs() {
  const db = await getDeviceDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("deviceSongs", "readonly");
    const request = transaction.objectStore("deviceSongs").getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error("Could not read saved songs."));
  });
}

async function storeDeviceSongs(records) {
  const db = await getDeviceDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("deviceSongs", "readwrite");
    const store = transaction.objectStore("deviceSongs");
    records.forEach(record => store.put(record));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Could not save songs."));
    transaction.onabort = () => reject(transaction.error || new Error("Song storage is full or unavailable."));
  });
}

async function deleteStoredDeviceSong(id) {
  const db = await getDeviceDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("deviceSongs", "readwrite");
    transaction.objectStore("deviceSongs").delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Could not remove the saved song."));
    transaction.onabort = () => reject(transaction.error || new Error("Could not remove the saved song."));
  });
}

function persistFavoriteSources() {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...favoriteSources]));
    return true;
  } catch (_) {
    return false;
  }
}

function pruneUnknownFavorites() {
  const validKeys = new Set(playlist.map(favoriteKey));
  favoriteSources = new Set([...favoriteSources].filter(key => validKeys.has(key)));
  persistFavoriteSources();
}

/* ── Status bar helper ─────────────────────────────── */

function showStatus(msg, ms = 3000) {
  statusMsg.textContent = msg;
  if (ms) setTimeout(() => { statusMsg.textContent = ""; }, ms);
}

/* ── Sidebar ───────────────────────────────────────── */

function openSidebar() {
  sidebarOpen = true;
  sidebar.inert = false;
  sidebar.classList.add("open");
  sidebarOverlay.classList.add("open");
  sidebarToggle.classList.add("active");
  sidebarToggle.setAttribute("aria-expanded", "true");
  document.body.style.overflow = "hidden";
  sidebarClose.focus();
}

function closeSidebar() {
  sidebarOpen = false;
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("open");
  sidebarToggle.classList.remove("active");
  sidebarToggle.setAttribute("aria-expanded", "false");
  document.body.style.overflow = "";
  sidebar.inert = true;
  sidebarToggle.focus();
}

function toggleSidebar() {
  sidebarOpen ? closeSidebar() : openSidebar();
}

sidebarToggle.addEventListener("click", toggleSidebar);
sidebarClose.addEventListener("click", closeSidebar);
sidebarOverlay.addEventListener("click", closeSidebar);

let swipeStart = null;

function rememberSwipeStart(event) {
  if (event.touches.length !== 1) {
    swipeStart = null;
    return;
  }
  const touch = event.touches[0];
  swipeStart = { x: touch.clientX, y: touch.clientY, time: Date.now() };
}

function finishSwipe(event, action) {
  if (!swipeStart || event.changedTouches.length !== 1) return;
  const touch = event.changedTouches[0];
  const deltaX = touch.clientX - swipeStart.x;
  const deltaY = touch.clientY - swipeStart.y;
  const elapsed = Date.now() - swipeStart.time;
  swipeStart = null;

  if (elapsed > 900 || Math.abs(deltaX) < 64 || Math.abs(deltaY) > Math.abs(deltaX) * 0.8) return;
  if (!window.matchMedia("(max-width: 700px)").matches) return;
  event.preventDefault();

  if (action === "open" && deltaX < -64 && !sidebarOpen) openSidebar();
  if (action === "close" && deltaX > 64 && sidebarOpen) closeSidebar();
}

appShell.addEventListener("touchstart", rememberSwipeStart, { passive: true });
appShell.addEventListener("touchend", event => finishSwipe(event, "open"), { passive: false });
appShell.addEventListener("touchcancel", () => { swipeStart = null; }, { passive: true });
sidebar.addEventListener("touchstart", rememberSwipeStart, { passive: true });
sidebar.addEventListener("touchend", event => finishSwipe(event, "close"), { passive: false });
sidebar.addEventListener("touchcancel", () => { swipeStart = null; }, { passive: true });
sidebarOverlay.addEventListener("touchstart", rememberSwipeStart, { passive: true });
sidebarOverlay.addEventListener("touchend", event => finishSwipe(event, "close"), { passive: false });
sidebarOverlay.addEventListener("touchcancel", () => { swipeStart = null; }, { passive: true });

function updateFavoriteControls() {
  const favorite = currentIndex >= 0 && favoriteSources.has(favoriteKey(playlist[currentIndex]));
  currentFavoriteBtn.disabled = currentIndex < 0;
  currentFavoriteBtn.classList.toggle("is-favorite", favorite);
  currentFavoriteBtn.setAttribute("aria-pressed", String(favorite));
  currentFavoriteBtn.setAttribute("aria-label", favorite ? "Remove current song from favorites" : "Add current song to favorites");
  allSongCount.textContent = playlist.length;
  favoriteCount.textContent = favoriteSources.size;
  allSongsFilterBtn.classList.toggle("active", activePlaylistFilter === "all");
  favoritesFilterBtn.classList.toggle("active", activePlaylistFilter === "favorites");
  allSongsFilterBtn.setAttribute("aria-pressed", String(activePlaylistFilter === "all"));
  favoritesFilterBtn.setAttribute("aria-pressed", String(activePlaylistFilter === "favorites"));
}

function updatePlaylistView() {
  const query = searchInput.value.toLowerCase().trim();
  filteredList = playlist.filter(song => {
    const matchesFilter = activePlaylistFilter === "all" || favoriteSources.has(favoriteKey(song));
    const matchesSearch = !query || song.title.toLowerCase().includes(query) || song.artist.toLowerCase().includes(query);
    return matchesFilter && matchesSearch;
  });
  renderPlaylist(filteredList);
}

function toggleFavorite(song) {
  if (!song) return;
  const key = favoriteKey(song);
  const wasFavorite = favoriteSources.has(key);
  if (wasFavorite) favoriteSources.delete(key);
  else favoriteSources.add(key);
  const persisted = persistFavoriteSources();

  updatePlaylistView();
  updateFavoriteControls();
  const action = wasFavorite ? `Removed ${song.title} from favorites.` : `Added ${song.title} to favorites.`;
  showStatus(persisted ? action : `${action} Favorites will reset when this page closes.`);
}

function deviceSongFromRecord(record) {
  return {
    id: record.id,
    deviceSong: true,
    title: record.title,
    artist: record.artist,
    fileName: record.fileName,
    mimeType: record.mimeType,
    blob: record.blob,
    src: null
  };
}

async function restoreDeviceSongs() {
  try {
    const records = await getStoredDeviceSongs();
    playlist.push(...records.map(deviceSongFromRecord));
    pruneUnknownFavorites();
    updatePlaylistView();
    if (records.length) showStatus(`Restored ${records.length} song${records.length === 1 ? "" : "s"} from this device.`);
  } catch (error) {
    console.warn("Could not restore device songs:", error);
    showStatus("Saved device songs could not be opened in this browser.", 5000);
  }
}

function audioMimeType(file) {
  if (file.type && file.type.startsWith("audio/")) return file.type;
  const extension = file.name.split(".").pop().toLowerCase();
  return ({ mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac" })[extension] || "application/octet-stream";
}

async function addDeviceSongs(files) {
  const audioFiles = files.filter(file => file.type.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(file.name));
  if (!audioFiles.length) {
    showStatus("No audio file selected. Open Browse or Files and choose an audio file.", 5000);
    return;
  }

  const records = audioFiles.map(file => {
    const mimeType = audioMimeType(file);
    return {
      id: window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: file.name.replace(/\.[^/.]+$/, "").replace(/[._-]+/g, " ").trim(),
      artist: "From this device",
      fileName: file.name,
      mimeType,
      size: file.size,
      blob: file.slice(0, file.size, mimeType),
      addedAt: Date.now()
    };
  });

  try {
    await storeDeviceSongs(records);
    playlist.push(...records.map(deviceSongFromRecord));
    activePlaylistFilter = "all";
    searchInput.value = "";
    updatePlaylistView();
    showStatus(`Added ${records.length} song${records.length === 1 ? "" : "s"}. Saved on this device.` , 5000);
  } catch (error) {
    console.error("Could not save device songs:", error);
    const message = error?.name === "QuotaExceededError"
      ? "There isn't enough storage on this device for these songs."
      : "Could not save the selected songs in this browser.";
    showStatus(message, 5000);
  }
}

async function removeDeviceSong(song) {
  if (!window.confirm(`Remove "${song.title}" from this device's playlist?`)) return;
  const index = playlist.indexOf(song);
  if (index < 0) return;

  try {
    await deleteStoredDeviceSong(song.id);
    if (currentIndex === index) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      if (currentDeviceAudioUrl) URL.revokeObjectURL(currentDeviceAudioUrl);
      currentDeviceAudioUrl = null;
      currentIndex = -1;
      isPlaying = false;
      songTitle.textContent = "Select a song";
      songArtist.textContent = "Your music collection";
      currentTime.textContent = "0:00";
      duration.textContent = "0:00";
      progressBar.value = 0;
      progressBar.disabled = true;
      seekBackBtn.disabled = true;
      seekForwardBtn.disabled = true;
      playBtn.disabled = true;
      updatePlayBtn();
    } else if (currentIndex > index) {
      currentIndex -= 1;
    }
    playlist.splice(index, 1);
    favoriteSources.delete(favoriteKey(song));
    persistFavoriteSources();
    updatePlaylistView();
    showStatus(`Removed ${song.title} from this device.`);
  } catch (error) {
    console.error("Could not remove device song:", error);
    showStatus("Could not remove this song from device storage.", 5000);
  }
}

/* ── Render playlist ───────────────────────────────── */

function renderPlaylist(list = filteredList) {
  playlistEl.innerHTML = "";
  updateFavoriteControls();

  if (list.length === 0) {
    const message = document.createElement("p");
    message.className = "empty-message";
    if (activePlaylistFilter === "favorites" && !searchInput.value.trim() && favoriteSources.size === 0) {
      message.textContent = "No favorites yet. Tap the heart on a song to save it here.";
    } else if (activePlaylistFilter === "favorites") {
      message.textContent = "No favorites match your search.";
    } else {
      message.textContent = "No songs match your search.";
    }
    playlistEl.appendChild(message);
    songCount.textContent = "0";
    headerSongCount.textContent = playlist.length;
    return;
  }

  songCount.textContent = list.length;
  headerSongCount.textContent = playlist.length;

  list.forEach((song, i) => {
    const globalIndex = playlist.indexOf(song);
    const item = document.createElement("div");
    item.className = "song-item" + (globalIndex === currentIndex ? " active" : "");
    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "song-select";
    selectButton.setAttribute("aria-current", globalIndex === currentIndex ? "true" : "false");
    selectButton.innerHTML = `
      <span class="song-number">${String(i + 1).padStart(2, "0")}</span>
      <div class="song-details">
        <h3>${escapeHTML(song.title)}</h3>
        <p>${escapeHTML(song.artist)}</p>
      </div>
      ${globalIndex === currentIndex && isPlaying ? '<span class="playing-indicator">♫</span>' : ""}
    `;
    selectButton.addEventListener("click", () => {
      loadSong(globalIndex);
      if (window.matchMedia("(max-width: 700px)").matches) closeSidebar();
    });
    const favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    const isFavorite = favoriteSources.has(favoriteKey(song));
    favoriteButton.className = "song-favorite-btn" + (isFavorite ? " is-favorite" : "");
    favoriteButton.setAttribute("aria-pressed", String(isFavorite));
    favoriteButton.setAttribute("aria-label", `${isFavorite ? "Remove from" : "Add to"} favorites: ${song.title}`);
    favoriteButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>';
    favoriteButton.addEventListener("click", () => toggleFavorite(song));
    item.append(selectButton, favoriteButton);
    if (song.deviceSong) {
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "song-remove-btn";
      removeButton.setAttribute("aria-label", `Remove ${song.title} from this device`);
      removeButton.title = "Remove from this device";
      removeButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3"/></svg>';
      removeButton.addEventListener("click", () => removeDeviceSong(song));
      item.appendChild(removeButton);
    }
    playlistEl.appendChild(item);
  });
}

/* ── Load & play a song ────────────────────────────── */

function loadSong(index) {
  if (index < 0 || index >= playlist.length) return;

  const song = playlist[index];

  let nextAudioSource;
  if (song.deviceSong) {
    if (!(song.blob instanceof Blob)) {
      showStatus("This saved song is unavailable in device storage.", 5000);
      return;
    }
    nextAudioSource = URL.createObjectURL(song.blob);
  } else {
    nextAudioSource = encodeAudioPath(song.src);
  }
  currentIndex = index;
  updateFavoriteControls();

  if (currentDeviceAudioUrl) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    URL.revokeObjectURL(currentDeviceAudioUrl);
    currentDeviceAudioUrl = null;
  }
  if (song.deviceSong) currentDeviceAudioUrl = nextAudioSource;
  audio.src = nextAudioSource;
  songTitle.textContent  = song.title;
  songArtist.textContent = song.artist;
  currentTime.textContent = "0:00";
  duration.textContent = "0:00";
  progressBar.value = 0;
  isPlaying = false;
  updatePlayBtn();

  playBtn.disabled     = false;
  progressBar.disabled = false;
  seekBackBtn.disabled = true;
  seekForwardBtn.disabled = true;

  audio.play()
    .then(() => {
      isPlaying = true;
      updatePlayBtn();
      renderPlaylist();
      showStatus(`Now playing: ${song.title}`);
    })
    .catch(err => {
      console.error("Playback error:", err);
      isPlaying = false;
      updatePlayBtn();
      renderPlaylist();
      showStatus("Could not play this file.");
    });
}

/* ── Play / Pause ──────────────────────────────────── */

function togglePlay() {
  if (currentIndex === -1) return;
  if (audio.paused) {
    audio.play()
      .then(() => {
        isPlaying = true;
        updatePlayBtn();
        renderPlaylist();
      })
      .catch(() => showStatus("Could not play this file."));
    return;
  } else {
    audio.pause();
    isPlaying = false;
  }
  updatePlayBtn();
  renderPlaylist();
}

function updatePlayBtn() {
  playBtn.innerHTML = isPlaying
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h3v14H8zm5 0h3v14h-3z" fill="currentColor"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5-12-7.5Z" fill="currentColor"/></svg>';
  playBtn.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
}

function skipBy(seconds) {
  if (currentIndex < 0 || !Number.isFinite(audio.duration)) return;
  audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + seconds));
  showStatus(seconds < 0 ? "Back 10 seconds" : "Forward 10 seconds", 1200);
}

/* ── Previous / Next ───────────────────────────────── */

function playNext() {
  if (playlist.length === 0) return;
  if (isShuffle) {
    loadSong(Math.floor(Math.random() * playlist.length));
  } else {
    loadSong((currentIndex + 1) % playlist.length);
  }
}

function playPrev() {
  if (playlist.length === 0) return;
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }
  loadSong((currentIndex - 1 + playlist.length) % playlist.length);
}

/* ── Progress bar ──────────────────────────────────── */

audio.addEventListener("timeupdate", () => {
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 1000;
  progressBar.value = pct;
  currentTime.textContent = formatTime(audio.currentTime);
});

audio.addEventListener("loadedmetadata", () => {
  duration.textContent = formatTime(audio.duration);
  seekBackBtn.disabled = false;
  seekForwardBtn.disabled = false;
});

audio.addEventListener("error", () => {
  if (currentIndex >= 0) showStatus("This song could not be loaded. Check the audio file and try again.", 5000);
});

progressBar.addEventListener("input", () => {
  if (!audio.duration) return;
  audio.currentTime = (progressBar.value / 1000) * audio.duration;
});

/* ── Song ended ────────────────────────────────────── */

audio.addEventListener("ended", () => {
  if (repeatMode === 2) {
    audio.currentTime = 0;
    audio.play();
  } else if (repeatMode === 1) {
    playNext();
  } else {
    if (currentIndex < playlist.length - 1 || isShuffle) {
      playNext();
    } else {
      isPlaying = false;
      updatePlayBtn();
      renderPlaylist();
      showStatus("Playlist ended.");
    }
  }
});

/* ── Volume ────────────────────────────────────────── */

let initialVolume = parseFloat(volumeBar.value);
try {
  const savedVolumeValue = localStorage.getItem("mono-player-volume");
  const savedVolume = Number(savedVolumeValue);
  if (savedVolumeValue !== null && Number.isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1) initialVolume = savedVolume;
} catch (_) {}
volumeBar.value = initialVolume;
audio.volume = initialVolume;
volumeValue.textContent = Math.round(initialVolume * 100) + "%";

volumeBar.addEventListener("input", () => {
  audio.volume = parseFloat(volumeBar.value);
  volumeValue.textContent = Math.round(audio.volume * 100) + "%";
  try { localStorage.setItem("mono-player-volume", volumeBar.value); } catch (_) {}
});

/* ── Shuffle & Repeat ──────────────────────────────── */

shuffleBtn.addEventListener("click", () => {
  isShuffle = !isShuffle;
  shuffleBtn.classList.toggle("active", isShuffle);
  shuffleBtn.setAttribute("aria-pressed", isShuffle);
  shuffleBtn.setAttribute("aria-label", `Shuffle ${isShuffle ? "on" : "off"}`);
  showStatus(isShuffle ? "Shuffle ON" : "Shuffle OFF");
});

const repeatLabels = ["Repeat off", "Repeat all", "Repeat one"];

repeatBtn.addEventListener("click", () => {
  repeatMode = (repeatMode + 1) % 3;
  repeatBtn.classList.toggle("active", repeatMode !== 0);
  repeatBtn.classList.toggle("repeat-one", repeatMode === 2);
  repeatBtn.setAttribute("aria-pressed", repeatMode !== 0);
  repeatBtn.setAttribute("aria-label", repeatLabels[repeatMode]);
  showStatus(repeatLabels[repeatMode]);
});

/* ── Search ────────────────────────────────────────── */

searchInput.addEventListener("input", () => {
  updatePlaylistView();
});

allSongsFilterBtn.addEventListener("click", () => {
  activePlaylistFilter = "all";
  updatePlaylistView();
});

favoritesFilterBtn.addEventListener("click", () => {
  activePlaylistFilter = "favorites";
  updatePlaylistView();
});

addDeviceSongsBtn.addEventListener("click", () => deviceSongInput.click());
deviceSongInput.addEventListener("change", async () => {
  const files = [...(deviceSongInput.files || [])];
  deviceSongInput.value = "";
  if (files.length) await addDeviceSongs(files);
});

/* ── Button wiring ─────────────────────────────────── */

playBtn.addEventListener("click", togglePlay);
nextBtn.addEventListener("click", playNext);
prevBtn.addEventListener("click", playPrev);
seekBackBtn.addEventListener("click", () => skipBy(-10));
seekForwardBtn.addEventListener("click", () => skipBy(10));
currentFavoriteBtn.addEventListener("click", () => {
  if (currentIndex >= 0) toggleFavorite(playlist[currentIndex]);
});

/* ── Keyboard shortcuts ────────────────────────────── */

document.addEventListener("keydown", e => {
  // Close sidebar on Escape
  if (e.key === "Escape" && sidebarOpen) {
    closeSidebar();
    return;
  }
  if (e.key === "/" && !e.target.matches("input, textarea, select")) {
    e.preventDefault();
    searchInput.focus();
    return;
  }
  if (e.target.matches("input, button, a, select, textarea")) return;
  switch (e.code) {
    case "Space":
      e.preventDefault();
      togglePlay();
      break;
    case "ArrowRight":
      skipBy(10);
      break;
    case "ArrowLeft":
      skipBy(-10);
      break;
  }
});

/* ── Init ──────────────────────────────────────────── */

renderPlaylist();
updatePlayBtn();
showStatus(`${playlist.length} songs loaded.`, 4000);
restoreDeviceSongs();

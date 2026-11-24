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

function formatTime(sec) {
  if (!sec || isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/* ── Build playlist data from songs array (defined in songs.js) ── */

const playlist = songs.map(path => ({
  title: titleFromFilename(path),
  artist: "Local Audio",
  src: path
}));

/* ── DOM references ────────────────────────────────── */

const $ = id => document.getElementById(id);

const audio        = $("audioPlayer");
const songTitle    = $("songTitle");
const songArtist   = $("songArtist");
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

/* ── Render playlist ───────────────────────────────── */

function renderPlaylist(list = filteredList) {
  playlistEl.innerHTML = "";

  if (list.length === 0) {
    playlistEl.innerHTML = '<p class="empty-message">No songs found.</p>';
    songCount.textContent = "0";
    headerSongCount.textContent = playlist.length;
    return;
  }

  songCount.textContent = list.length;
  headerSongCount.textContent = playlist.length;

  list.forEach((song, i) => {
    const globalIndex = playlist.indexOf(song);
    const item = document.createElement("button");
    item.type = "button";
    item.className = "song-item" + (globalIndex === currentIndex ? " active" : "");
    item.innerHTML = `
      <span class="song-number">${String(i + 1).padStart(2, "0")}</span>
      <div class="song-details">
      <h3>${escapeHTML(song.title)}</h3>
        <p>${escapeHTML(song.artist)}</p>
      </div>
      ${globalIndex === currentIndex && isPlaying ? '<span class="playing-indicator">♫</span>' : ""}
    `;
    item.addEventListener("click", () => {
      loadSong(globalIndex);
      if (window.matchMedia("(max-width: 700px)").matches) closeSidebar();
    });
    playlistEl.appendChild(item);
  });
}

/* ── Load & play a song ────────────────────────────── */

function loadSong(index) {
  if (index < 0 || index >= playlist.length) return;

  currentIndex = index;
  const song = playlist[index];

  audio.src = song.src;
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
  const q = searchInput.value.toLowerCase().trim();
  if (!q) {
    filteredList = [...playlist];
  } else {
    filteredList = playlist.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.artist.toLowerCase().includes(q)
    );
  }
  renderPlaylist();
});

/* ── Button wiring ─────────────────────────────────── */

playBtn.addEventListener("click", togglePlay);
nextBtn.addEventListener("click", playNext);
prevBtn.addEventListener("click", playPrev);
seekBackBtn.addEventListener("click", () => skipBy(-10));
seekForwardBtn.addEventListener("click", () => skipBy(10));

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

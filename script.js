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
const prevBtn      = $("prevBtn");
const nextBtn      = $("nextBtn");
const shuffleBtn   = $("shuffleBtn");
const repeatBtn    = $("repeatBtn");
const volumeBar    = $("volumeBar");
const volumeValue  = $("volumeValue");
const searchInput  = $("searchInput");
const songCount    = $("songCount");
const playlistEl   = $("playlist");
const statusMsg    = $("statusMessage");

// Sidebar elements
const sidebar        = $("sidebar");
const sidebarOverlay = $("sidebarOverlay");
const sidebarToggle  = $("sidebarToggle");
const sidebarClose   = $("sidebarClose");

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
  sidebar.classList.add("open");
  sidebarOverlay.classList.add("open");
  sidebarToggle.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeSidebar() {
  sidebarOpen = false;
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("open");
  sidebarToggle.classList.remove("active");
  document.body.style.overflow = "";
}

function toggleSidebar() {
  sidebarOpen ? closeSidebar() : openSidebar();
}

sidebarToggle.addEventListener("click", toggleSidebar);
sidebarClose.addEventListener("click", closeSidebar);
sidebarOverlay.addEventListener("click", closeSidebar);

/* ── Render playlist ───────────────────────────────── */

function renderPlaylist(list = filteredList) {
  playlistEl.innerHTML = "";

  if (list.length === 0) {
    playlistEl.innerHTML = '<p class="empty-message">No songs found.</p>';
    songCount.textContent = "0";
    return;
  }

  songCount.textContent = list.length;

  list.forEach((song, i) => {
    const globalIndex = playlist.indexOf(song);
    const item = document.createElement("div");
    item.className = "song-item" + (globalIndex === currentIndex ? " active" : "");
    item.setAttribute("role", "button");
    item.setAttribute("tabindex", "0");
    item.innerHTML = `
      <span class="song-number">${String(i + 1).padStart(2, "0")}</span>
      <div class="song-details">
        <h3>${song.title}</h3>
        <p>${song.artist}</p>
      </div>
      ${globalIndex === currentIndex && isPlaying ? '<span class="playing-indicator">♫</span>' : ""}
    `;
    item.addEventListener("click", () => loadSong(globalIndex));
    item.addEventListener("keydown", e => { if (e.key === "Enter") loadSong(globalIndex); });
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

  playBtn.disabled     = false;
  progressBar.disabled = false;

  audio.play()
    .then(() => {
      isPlaying = true;
      updatePlayBtn();
      renderPlaylist();
      showStatus(`Now playing: ${song.title}`);
    })
    .catch(err => {
      console.error("Playback error:", err);
      showStatus("Could not play this file.");
    });
}

/* ── Play / Pause ──────────────────────────────────── */

function togglePlay() {
  if (currentIndex === -1) return;
  if (audio.paused) {
    audio.play();
    isPlaying = true;
  } else {
    audio.pause();
    isPlaying = false;
  }
  updatePlayBtn();
  renderPlaylist();
}

function updatePlayBtn() {
  playBtn.textContent   = isPlaying ? "❚❚" : "▶";
  playBtn.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
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

audio.volume = parseFloat(volumeBar.value);

volumeBar.addEventListener("input", () => {
  audio.volume = parseFloat(volumeBar.value);
  volumeValue.textContent = Math.round(audio.volume * 100) + "%";
});

/* ── Shuffle & Repeat ──────────────────────────────── */

shuffleBtn.addEventListener("click", () => {
  isShuffle = !isShuffle;
  shuffleBtn.classList.toggle("active", isShuffle);
  shuffleBtn.setAttribute("aria-pressed", isShuffle);
  showStatus(isShuffle ? "Shuffle ON" : "Shuffle OFF");
});

const repeatLabels = ["Repeat OFF", "Repeat ALL", "Repeat ONE"];
const repeatSymbols = ["↻", "↻", "⟳"];

repeatBtn.addEventListener("click", () => {
  repeatMode = (repeatMode + 1) % 3;
  repeatBtn.classList.toggle("active", repeatMode !== 0);
  repeatBtn.textContent = repeatSymbols[repeatMode];
  repeatBtn.setAttribute("aria-pressed", repeatMode !== 0);
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

/* ── Keyboard shortcuts ────────────────────────────── */

document.addEventListener("keydown", e => {
  // Close sidebar on Escape
  if (e.key === "Escape" && sidebarOpen) {
    closeSidebar();
    return;
  }
  if (e.target.tagName === "INPUT") return;
  switch (e.code) {
    case "Space":
      e.preventDefault();
      togglePlay();
      break;
    case "ArrowRight":
      if (audio.duration) audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
      break;
    case "ArrowLeft":
      audio.currentTime = Math.max(0, audio.currentTime - 5);
      break;
  }
});

/* ── Init ──────────────────────────────────────────── */

renderPlaylist();
showStatus(`${playlist.length} songs loaded.`, 4000);

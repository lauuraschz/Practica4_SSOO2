// SpotESIfy — Frontend App
// ============================================================================

const API_BASE = '/api';
const audio = document.getElementById('audio');

let songs = [];
let playlists = [];
let currentSongIndex = -1;
let currentPlaylist = null;
let isPlaying = false;

// ── Inicialización ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  checkHealth();
  loadSongs();
  loadPlaylists();
  setupEventListeners();
  setupAudioEvents();
});

// ── API ─────────────────────────────────────────────────────────────────────
async function apiFetch(endpoint, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  } catch (err) {
    console.error(`[API] ${endpoint}:`, err.message);
    throw err;
  }
}

// ── Health Check ────────────────────────────────────────────────────────────
async function checkHealth() {
  const status = document.getElementById('status');
  try {
    const data = await apiFetch('/health');
    status.textContent = `● Conectado (Redis: ${data.redis})`;
    status.className = 'status connected';
  } catch (err) {
    status.textContent = `● Error: ${err.message}`;
    status.className = 'status error';
  }
}

// ── Canciones ───────────────────────────────────────────────────────────────
async function loadSongs() {
  const container = document.getElementById('songs');
  try {
    songs = await apiFetch('/songs');
    renderSongs(songs);
  } catch (err) {
    container.innerHTML = `<div class="error-msg">Error al cargar canciones: ${err.message}</div>`;
  }
}

function renderSongs(songList) {
  const container = document.getElementById('songs');

  if (songList.length === 0) {
    container.innerHTML = '<div class="empty-msg">No hay canciones disponibles</div>';
    return;
  }

  let html = `
    <div class="song-header">
      <span>#</span>
      <span>Título</span>
      <span>Artista</span>
      <span>Género</span>
      <span>Dur.</span>
    </div>
  `;

  songList.forEach((song, index) => {
    const isActive = currentSongIndex === index;
    html += `
      <div class="song-item ${isActive ? 'playing' : ''}"
           onclick="playSong(${index})"
           data-index="${index}">
        <span class="song-number">${isActive && isPlaying ? '♫' : index + 1}</span>
        <span class="song-title">${escapeHtml(song.title)}</span>
        <span class="song-artist">${escapeHtml(song.artist)}</span>
        <span class="song-genre">${escapeHtml(song.genre || '—')}</span>
        <span class="song-duration">${formatDuration(song.duration)}</span>
      </div>
    `;
  });

  container.innerHTML = html;
}

// ── Playlists ───────────────────────────────────────────────────────────────
async function loadPlaylists() {
  const container = document.getElementById('playlists');
  try {
    playlists = await apiFetch('/playlists');
    renderPlaylists();
  } catch (err) {
    container.innerHTML = `<div class="error-msg">Error: ${err.message}</div>`;
  }
}

function renderPlaylists() {
  const container = document.getElementById('playlists');

  let html = `
    <div class="playlist-item ${!currentPlaylist ? 'active' : ''}"
         onclick="showAllSongs()">
      🎵 Todas las canciones
    </div>
  `;

  playlists.forEach((pl) => {
    const isActive = currentPlaylist === pl.id;
    html += `
      <div class="playlist-item ${isActive ? 'active' : ''}"
           onclick="showPlaylist('${pl.id}')">
        📋 ${escapeHtml(pl.name)}
      </div>
    `;
  });

  container.innerHTML = html;
}

function showAllSongs() {
  currentPlaylist = null;
  document.getElementById('content-title').textContent = 'Todas las canciones';
  renderSongs(songs);
  renderPlaylists();
}

async function showPlaylist(id) {
  currentPlaylist = id;
  try {
    const pl = await apiFetch(`/playlists/${id}`);
    document.getElementById('content-title').textContent = pl.name;
    const playlistSongs = songs.filter((s) => pl.songs.includes(s.id));
    renderSongs(playlistSongs);
    renderPlaylists();
  } catch (err) {
    console.error('Error al cargar playlist:', err.message);
  }
}

// ── Reproducción ────────────────────────────────────────────────────────────
function playSong(index) {
  if (index < 0 || index >= songs.length) return;

  currentSongIndex = index;
  const song = songs[index];

  audio.src = `${API_BASE}/stream/${song.id}`;
  audio.play().catch((err) => console.error('Error al reproducir:', err.message));
  isPlaying = true;

  document.getElementById('player-title').textContent = song.title;
  document.getElementById('player-artist').textContent = song.artist;
  document.getElementById('btn-play').textContent = '⏸';

  renderSongs(songs);
}

function togglePlay() {
  if (!audio.src) return;

  if (isPlaying) {
    audio.pause();
    isPlaying = false;
    document.getElementById('btn-play').textContent = '▶';
  } else {
    audio.play();
    isPlaying = true;
    document.getElementById('btn-play').textContent = '⏸';
  }
  renderSongs(songs);
}

function playNext() {
  if (songs.length === 0) return;
  const next = (currentSongIndex + 1) % songs.length;
  playSong(next);
}

function playPrev() {
  if (songs.length === 0) return;
  const prev = currentSongIndex <= 0 ? songs.length - 1 : currentSongIndex - 1;
  playSong(prev);
}

// ── Upload ──────────────────────────────────────────────────────────────────
async function uploadSong() {
  const fileInput = document.getElementById('upload-file');
  const title = document.getElementById('upload-title').value;
  const artist = document.getElementById('upload-artist').value;
  const genre = document.getElementById('upload-genre').value;

  if (!fileInput.files[0]) {
    alert('Selecciona un fichero MP3');
    return;
  }

  const formData = new FormData();
  formData.append('song', fileInput.files[0]);
  formData.append('title', title || fileInput.files[0].name);
  formData.append('artist', artist || 'Desconocido');
  formData.append('genre', genre || '');

  try {
    await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData });
    closeModals();
    await loadSongs();
  } catch (err) {
    alert('Error al subir: ' + err.message);
  }
}

// ── Event Listeners ─────────────────────────────────────────────────────────
function setupEventListeners() {
  document.getElementById('btn-play').addEventListener('click', togglePlay);
  document.getElementById('btn-next').addEventListener('click', playNext);
  document.getElementById('btn-prev').addEventListener('click', playPrev);

  // Volume
  document.getElementById('volume').addEventListener('input', (e) => {
    audio.volume = e.target.value / 100;
  });

  // Progress bar (seek)
  document.getElementById('progress').addEventListener('input', (e) => {
    if (audio.duration) {
      audio.currentTime = (e.target.value / 100) * audio.duration;
    }
  });

  // Upload modal
  document.getElementById('btn-upload').addEventListener('click', () => {
    document.getElementById('modal-upload').style.display = 'flex';
  });
  document.getElementById('upload-cancel').addEventListener('click', closeModals);
  document.getElementById('upload-submit').addEventListener('click', uploadSong);

  // Playlist modal
  document.getElementById('btn-new-playlist').addEventListener('click', () => {
    document.getElementById('modal-playlist').style.display = 'flex';
  });
  document.getElementById('playlist-cancel').addEventListener('click', closeModals);
  document.getElementById('playlist-submit').addEventListener('click', async () => {
    const name = document.getElementById('playlist-name').value;
    if (!name) return;
    try {
      await apiFetch('/playlists', {
        method: 'POST',
        body: JSON.stringify({ name, songs: [] }),
      });
      closeModals();
      await loadPlaylists();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });

  // Close modals on backdrop click
  document.querySelectorAll('.modal').forEach((modal) => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModals();
    });
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.code === 'ArrowRight') playNext();
    if (e.code === 'ArrowLeft') playPrev();
  });
}

function setupAudioEvents() {
  audio.addEventListener('timeupdate', () => {
    if (!audio.duration) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    document.getElementById('progress').value = pct;
    document.getElementById('time-current').textContent = formatDuration(audio.currentTime);
    document.getElementById('time-total').textContent = formatDuration(audio.duration);
  });

  audio.addEventListener('ended', playNext);

  audio.addEventListener('error', () => {
    console.error('[Audio] Error al reproducir');
    document.getElementById('player-title').textContent = 'Error al reproducir';
  });
}

function closeModals() {
  document.querySelectorAll('.modal').forEach((m) => (m.style.display = 'none'));
}

// ── Utilidades ──────────────────────────────────────────────────────────────
function formatDuration(seconds) {
  const s = Math.floor(Number(seconds));
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Refresh health check every 30s
setInterval(checkHealth, 30000);

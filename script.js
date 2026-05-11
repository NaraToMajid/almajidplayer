// ── Supabase Configuration ──
const SUPABASE_URL = 'https://mqonelsoqyvrasrzrzfl.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xb25lbHNvcXl2cmFzcnpyemZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5NjEzOTQsImV4cCI6MjA4MTUzNzM5NH0.exHvN0BA3P71DcZbavZ0DMk8pUEpWQ6VCuH672wEdJ4';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── State Variables ──
let songs = [];
let currentIndex = -1;
let isPlaying = false;
let isShuffle = false;
let isRepeat = false;
let audioCtx = null;
let analyser = null;
let source = null;
let animFrameId = null;
let isAudioConnected = false;

const DEV_NAME = 'almajidnafi';
const DEV_PASS = 'Rantauprapat123';
let isLoggedIn = false;

// DOM Elements
const audio = document.getElementById('audio-player');
const bgBlur = document.getElementById('bg-blur');
const coverImg = document.getElementById('cover-img');
const coverPlaceholder = document.getElementById('cover-placeholder');
const coverDisc = document.getElementById('cover-disc');
const coverRing = document.getElementById('cover-ring');
const songTitle = document.getElementById('song-title');
const songArtist = document.getElementById('song-artist');
const progressFill = document.getElementById('progress-bar-fill');
const progressBg = document.getElementById('progress-bar-bg');
const timeCurrent = document.getElementById('time-current');
const timeTotal = document.getElementById('time-total');
const playlistContainer = document.getElementById('playlist-container');
const playlistCount = document.getElementById('playlist-count');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');
const visualizerWrap = document.getElementById('visualizer-wrap');
const btnPlayPause = document.getElementById('btn-play-pause');
const volSlider = document.getElementById('volume-slider');

// Set volume awal ke 70% dan pastikan tidak mute
audio.volume = 0.7;
volSlider.value = 70;
updateVolumeBackground(70);

function updateVolumeBackground(val) {
  volSlider.style.background = `linear-gradient(to right, var(--accent) 0%, var(--accent) ${val}%, var(--surface2) ${val}%)`;
}

// ── Visualizer Setup ──
const BAR_COUNT = 32;
const visBars = [];
visualizerWrap.innerHTML = '';
for (let i = 0; i < BAR_COUNT; i++) {
  const bar = document.createElement('div');
  bar.className = 'vis-bar';
  bar.style.height = '3px';
  visualizerWrap.appendChild(bar);
  visBars.push(bar);
}

// ── Inisialisasi AudioContext (ONLY untuk visualizer, TIDAK mengganggu audio) ──
async function initVisualizerContext() {
  if (audioCtx && audioCtx.state !== 'closed') return true;
  
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.4;
    console.log("Visualizer AudioContext created");
    return true;
  } catch (e) {
    console.error("Failed to init visualizer context:", e);
    return false;
  }
}

// ── Hubungkan audio ke visualizer (TANPA mengganggu playback) ──
async function connectAudioToVisualizer() {
  if (isAudioConnected) return true;
  if (!audioCtx || audioCtx.state === 'closed') {
    await initVisualizerContext();
  }
  
  try {
    // Putuskan koneksi lama jika ada
    if (source) {
      try { source.disconnect(); } catch(e) {}
    }
    
    // Buat koneksi baru
    source = audioCtx.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    isAudioConnected = true;
    console.log("Audio connected to visualizer - SUARA TETAP KELUAR");
    return true;
  } catch (e) {
    console.error("Failed to connect visualizer:", e);
    return false;
  }
}

// ── Visualizer Real-time (Berdasarkan frekuensi lagu) ──
function drawVisualizer() {
  if (!animFrameId) {
    animFrameId = requestAnimationFrame(drawVisualizer);
  }
  
  // Jika lagu tidak diputar, tampilkan animasi diam
  if (!isPlaying || !analyser) {
    for (let i = 0; i < BAR_COUNT; i++) {
      visBars[i].style.height = '3px';
      visBars[i].style.opacity = '0.3';
    }
    return;
  }
  
  try {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    
    for (let i = 0; i < BAR_COUNT; i++) {
      // Mapping index untuk distribusi yang merata
      const index = Math.floor(Math.pow(i / BAR_COUNT, 1.1) * dataArray.length);
      const value = dataArray[Math.min(index, dataArray.length - 1)] || 0;
      
      // Tinggi bar berdasarkan volume (3px - 55px)
      let height = 3 + (value / 255) * 52;
      height = Math.min(55, Math.max(3, height));
      
      // Warna berdasarkan intensitas
      const intensity = value / 255;
      if (intensity > 0.7) {
        visBars[i].style.background = '#ff6b9d';
      } else if (intensity > 0.3) {
        visBars[i].style.background = '#c8ff00';
      } else {
        visBars[i].style.background = '#00ffd2';
      }
      
      visBars[i].style.height = height + 'px';
      visBars[i].style.opacity = 0.4 + (intensity * 0.6);
    }
  } catch (e) {
    console.error("Visualizer draw error:", e);
  }
}

// Mulai visualizer
drawVisualizer();

// ── Helper Functions ──
function fmt(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

// ── Load Songs from Supabase ──
async function loadSongs() {
  playlistContainer.innerHTML = '<div class="loading-state"><div class="spinner"></div> Memuat lagu...</div>';
  try {
    const { data, error } = await db
      .from('songs')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    songs = data || [];
    renderPlaylist();
    console.log("Lagu dimuat:", songs.length);
    
    if (songs.length === 0) {
      toast("📁 Belum ada lagu. Klik Add Music untuk upload MP3!");
    }
  } catch (e) {
    console.error(e);
    playlistContainer.innerHTML = '<div class="loading-state">❌ Gagal memuat. Cek koneksi.</div>';
  }
}

// ── Render Playlist ──
function renderPlaylist() {
  playlistCount.textContent = `${songs.length} lagu`;
  if (songs.length === 0) {
    playlistContainer.innerHTML = `
      <div id="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
        </svg>
        <p>Playlist kosong</p>
        <small>Tekan "Add Music" untuk menambahkan lagu</small>
      </div>`;
    return;
  }
  playlistContainer.innerHTML = '';
  songs.forEach((song, idx) => {
    const item = document.createElement('div');
    item.className = `playlist-item ${idx === currentIndex ? 'active' : ''} ${idx === currentIndex && !isPlaying ? 'paused' : ''}`;
    item.dataset.idx = idx;

    const thumbHtml = song.cover_url
      ? `<div class="playlist-thumb"><img src="${song.cover_url}" alt="" loading="lazy" onerror="this.src=''" /></div>`
      : `<div class="playlist-thumb-placeholder"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>`;

    item.innerHTML = `
      ${thumbHtml}
      <div class="playlist-info">
        <div class="playlist-title">${escapeHtml(song.title)}</div>
        <div class="playlist-artist">${escapeHtml(song.artist || '—')}</div>
      </div>
      <div class="playing-wave">
        <div class="wave-bar"></div><div class="wave-bar"></div>
        <div class="wave-bar"></div><div class="wave-bar"></div>
      </div>
      <span class="playlist-duration">${song.duration ? fmt(song.duration) : ''}</span>
      ${isLoggedIn ? `<button class="delete-song-btn" data-id="${song.id}" data-idx="${idx}" title="Hapus"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>` : ''}
    `;
    item.addEventListener('click', (e) => {
      if (e.target.closest('.delete-song-btn')) return;
      playSong(idx);
    });
    if (isLoggedIn) {
      const delBtn = item.querySelector('.delete-song-btn');
      if (delBtn) delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const songId = delBtn.dataset.id;
        deleteSong(songId, idx);
      });
    }
    playlistContainer.appendChild(item);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// ── MAIN PLAY FUNCTION (SUARA PASTI KELUAR) ──
async function playSong(idx) {
  if (idx < 0 || idx >= songs.length) return;
  
  currentIndex = idx;
  const song = songs[idx];
  
  if (!song.audio_url) {
    toast("❌ File audio tidak ditemukan!");
    return;
  }
  
  console.log("Memutar:", song.title);
  
  // Hentikan audio yang sedang berjalan
  audio.pause();
  isAudioConnected = false;
  
  // Set source baru
  audio.src = song.audio_url;
  audio.volume = volSlider.value / 100;
  audio.load();
  
  // Update tampilan cover
  if (song.cover_url) {
    coverImg.src = song.cover_url;
    coverImg.style.display = 'block';
    coverPlaceholder.style.display = 'none';
    bgBlur.style.backgroundImage = `url(${song.cover_url})`;
  } else {
    coverImg.style.display = 'none';
    coverPlaceholder.style.display = 'flex';
    bgBlur.style.backgroundImage = 'none';
  }
  
  songTitle.textContent = song.title;
  songArtist.textContent = song.artist || '—';
  renderPlaylist();
  
  // Fungsi untuk memutar audio
  const startPlayback = async () => {
    try {
      // Inisialisasi visualizer context (TIDAK mengganggu suara)
      await initVisualizerContext();
      
      // Mainkan audio langsung (tanpa menunggu visualizer)
      await audio.play();
      setPlayState(true);
      
      // Setelah audio play, sambungkan ke visualizer (opsional)
      setTimeout(() => {
        connectAudioToVisualizer().catch(e => console.log("Visualizer optional:", e));
      }, 100);
      
      toast(`🎵 Memutar: ${song.title}`);
    } catch (err) {
      console.error("Play error:", err);
      toast("⚠️ Klik tombol play lagi");
      setPlayState(false);
    }
  };
  
  // Jika audio sudah siap, langsung play
  if (audio.readyState >= 2) {
    await startPlayback();
  } else {
    audio.oncanplay = startPlayback;
    // Timeout fallback
    setTimeout(() => {
      if (!isPlaying) startPlayback();
    }, 2000);
  }
  
  // Error handler
  audio.onerror = () => {
    console.error("Audio error");
    toast("❌ Gagal memutar file");
    setPlayState(false);
  };
}

function setPlayState(playing) {
  isPlaying = playing;
  if (playing) {
    iconPlay.style.display = 'none';
    iconPause.style.display = 'block';
    coverDisc.classList.add('spinning');
    coverRing.classList.add('spinning');
    
    // Resume AudioContext untuk visualizer
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  } else {
    iconPlay.style.display = 'block';
    iconPause.style.display = 'none';
    coverDisc.classList.remove('spinning');
    coverRing.classList.remove('spinning');
  }
  
  document.querySelectorAll('.playlist-item').forEach((el, i) => {
    if (i === currentIndex) {
      if (!playing) el.classList.add('paused');
      else el.classList.remove('paused');
    }
  });
}

// ── Player Controls ──
btnPlayPause.addEventListener('click', async () => {
  if (currentIndex === -1 && songs.length > 0) {
    await playSong(0);
    return;
  }
  
  if (isPlaying) {
    audio.pause();
    setPlayState(false);
  } else {
    try {
      await audio.play();
      setPlayState(true);
      
      // Sambungkan ke visualizer (opsional)
      if (audioCtx && audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      await connectAudioToVisualizer();
    } catch (err) {
      console.error("Resume error:", err);
      toast("Klik sekali lagi");
    }
  }
});

document.getElementById('btn-next').addEventListener('click', async () => {
  if (songs.length === 0) return;
  let next = isShuffle ? Math.floor(Math.random() * songs.length) : (currentIndex + 1) % songs.length;
  await playSong(next);
});

document.getElementById('btn-prev').addEventListener('click', async () => {
  if (songs.length === 0) return;
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }
  const prev = (currentIndex - 1 + songs.length) % songs.length;
  await playSong(prev);
});

document.getElementById('btn-shuffle').addEventListener('click', () => {
  isShuffle = !isShuffle;
  document.getElementById('btn-shuffle').classList.toggle('active-mode', isShuffle);
  toast(isShuffle ? '🔀 Acak aktif' : '🎵 Acak nonaktif');
});

document.getElementById('btn-repeat').addEventListener('click', () => {
  isRepeat = !isRepeat;
  document.getElementById('btn-repeat').classList.toggle('active-mode', isRepeat);
  toast(isRepeat ? '🔁 Ulang satu lagu' : '➡️ Ulang nonaktif');
});

audio.addEventListener('ended', async () => {
  if (isRepeat) {
    audio.currentTime = 0;
    await audio.play();
  } else {
    if (songs.length === 0) return;
    let next = isShuffle ? Math.floor(Math.random() * songs.length) : (currentIndex + 1) % songs.length;
    await playSong(next);
  }
});

// Progress bar
audio.addEventListener('timeupdate', () => {
  if (!audio.duration || isNaN(audio.duration)) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  progressFill.style.width = pct + '%';
  timeCurrent.textContent = fmt(audio.currentTime);
  timeTotal.textContent = fmt(audio.duration);
});

audio.addEventListener('loadedmetadata', () => {
  timeTotal.textContent = fmt(audio.duration);
});

progressBg.addEventListener('click', (e) => {
  const rect = progressBg.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  audio.currentTime = pct * audio.duration;
});

// Volume
volSlider.addEventListener('input', () => {
  const val = volSlider.value;
  audio.volume = val / 100;
  updateVolumeBackground(val);
});

// ── Login / Dashboard (Sama seperti sebelumnya) ──
document.getElementById('btn-add-music').addEventListener('click', () => {
  if (isLoggedIn) openDashboard();
  else document.getElementById('login-modal').classList.add('open');
});

function closeLogin() {
  document.getElementById('login-modal').classList.remove('open');
  document.getElementById('login-error').classList.remove('show');
  document.getElementById('dev-name').value = '';
  document.getElementById('dev-pass').value = '';
}

document.getElementById('btn-login').addEventListener('click', () => {
  const name = document.getElementById('dev-name').value.trim();
  const pass = document.getElementById('dev-pass').value;
  if (name === DEV_NAME && pass === DEV_PASS) {
    isLoggedIn = true;
    closeLogin();
    openDashboard();
    renderPlaylist();
    toast("✅ Login berhasil");
  } else {
    document.getElementById('login-error').classList.add('show');
  }
});

document.getElementById('btn-login-cancel').addEventListener('click', closeLogin);
document.getElementById('btn-dashboard-close').addEventListener('click', closeDashboard);
document.getElementById('logout-btn').addEventListener('click', logout);

function openDashboard() {
  document.getElementById('dashboard-modal').classList.add('open');
}
function closeDashboard() {
  document.getElementById('dashboard-modal').classList.remove('open');
  resetUploadForm();
}
function logout() {
  isLoggedIn = false;
  closeDashboard();
  renderPlaylist();
  toast('👋 Keluar dari dashboard');
}

// Upload cover preview
document.getElementById('upload-cover').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) {
    document.getElementById('cover-preview-wrap').style.display = 'none';
    return;
  }
  const reader = new FileReader();
  reader.onload = (ev) => {
    document.getElementById('cover-preview-img').src = ev.target.result;
    document.getElementById('cover-preview-name').textContent = file.name;
    document.getElementById('cover-preview-wrap').style.display = 'flex';
  };
  reader.readAsDataURL(file);
});

function resetUploadForm() {
  ['upload-title', 'upload-artist'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('upload-mp3').value = '';
  document.getElementById('upload-cover').value = '';
  document.getElementById('cover-preview-wrap').style.display = 'none';
  document.getElementById('upload-error').classList.remove('show');
  document.getElementById('upload-status').classList.remove('show');
  document.getElementById('btn-upload-label').textContent = 'Upload Lagu';
  document.getElementById('btn-upload').disabled = false;
}

// Upload song
document.getElementById('btn-upload').addEventListener('click', async () => {
  const title = document.getElementById('upload-title').value.trim();
  const artist = document.getElementById('upload-artist').value.trim();
  const mp3File = document.getElementById('upload-mp3').files[0];
  const coverFile = document.getElementById('upload-cover').files[0];
  const errEl = document.getElementById('upload-error');
  errEl.classList.remove('show');

  if (!title) { errEl.textContent = 'Judul lagu wajib diisi.'; errEl.classList.add('show'); return; }
  if (!mp3File) { errEl.textContent = 'File MP3 wajib dipilih.'; errEl.classList.add('show'); return; }

  const btn = document.getElementById('btn-upload');
  btn.disabled = true;
  document.getElementById('btn-upload-label').innerHTML = '<div class="spinner" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:6px;"></div> Uploading...';
  const statusEl = document.getElementById('upload-status');
  statusEl.textContent = 'Mengupload audio...';
  statusEl.classList.add('show');

  try {
    const mp3Ext = mp3File.name.split('.').pop();
    const mp3Path = `audio/${Date.now()}_${Math.random().toString(36).slice(2)}.${mp3Ext}`;
    const { error: mp3Err } = await db.storage.from('songs').upload(mp3Path, mp3File, { contentType: mp3File.type });
    if (mp3Err) throw new Error('Upload audio gagal: ' + mp3Err.message);
    const { data: mp3Data } = db.storage.from('songs').getPublicUrl(mp3Path);
    const audioUrl = mp3Data.publicUrl;
    
    let coverUrl = null;
    if (coverFile) {
      statusEl.textContent = 'Upload cover...';
      const covExt = coverFile.name.split('.').pop();
      const covPath = `covers/${Date.now()}_${Math.random().toString(36).slice(2)}.${covExt}`;
      const { error: covErr } = await db.storage.from('songs').upload(covPath, coverFile, { contentType: coverFile.type });
      if (!covErr) {
        const { data: covData } = db.storage.from('songs').getPublicUrl(covPath);
        coverUrl = covData.publicUrl;
      }
    }
    
    statusEl.textContent = 'Simpan ke database...';
    const { error: dbErr } = await db.from('songs').insert([{ title, artist: artist || null, audio_url: audioUrl, cover_url: coverUrl }]);
    if (dbErr) throw new Error('Gagal simpan data: ' + dbErr.message);
    
    statusEl.textContent = '✅ Lagu berhasil ditambahkan!';
    toast('Lagu berhasil ditambahkan');
    resetUploadForm();
    await loadSongs();
    setTimeout(() => statusEl.classList.remove('show'), 2500);
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.add('show');
    statusEl.classList.remove('show');
  } finally {
    document.getElementById('btn-upload-label').textContent = 'Upload Lagu';
    btn.disabled = false;
  }
});

// Delete song
async function deleteSong(id, idx) {
  if (!confirm('Hapus lagu ini dari playlist?')) return;
  const { error } = await db.from('songs').delete().eq('id', id);
  if (error) { toast('Gagal hapus: ' + error.message); return; }
  if (idx === currentIndex) {
    audio.pause();
    setPlayState(false);
    currentIndex = -1;
    songTitle.textContent = 'Pilih lagu untuk diputar';
    songArtist.textContent = '—';
    coverImg.style.display = 'none';
    coverPlaceholder.style.display = 'flex';
    bgBlur.style.backgroundImage = 'none';
  } else if (idx < currentIndex) {
    currentIndex--;
  }
  toast('🗑️ Lagu dihapus');
  await loadSongs();
}

// Close modals
document.getElementById('login-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeLogin(); });
document.getElementById('dashboard-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeDashboard(); });

// Initialize
loadSongs();
console.log("✅ Aplikasi siap - SUARA akan keluar saat play!");

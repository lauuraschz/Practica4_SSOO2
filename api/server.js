const express = require('express');
const Redis = require('ioredis');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// ── Configuración ───────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const REDIS_HOST = process.env.REDIS_HOST || 'db';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_PASS = process.env.REDIS_PASS || '';  // ← OJO: nombre de variable
const MUSIC_DIR = process.env.MUSIC_DIR || '/data/music';

// ── Conexión Redis ──────────────────────────────────────────────────────────
const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASS || undefined,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 5000);
    console.log(`[Redis] Reintentando conexión (#${times})...`);
    return delay;
  },
  maxRetriesPerRequest: 3,
});

redis.on('connect', () => console.log('[Redis] Conectado'));
redis.on('error', (err) => console.error('[Redis] Error:', err.message));

// ── Upload de canciones ─────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(MUSIC_DIR)) {
      fs.mkdirSync(MUSIC_DIR, { recursive: true });
    }
    cb(null, MUSIC_DIR);
  },
  filename: (req, file, cb) => {
    const id = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname);
    cb(null, `${id}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'audio/mpeg' || file.mimetype === 'audio/mp3') {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten ficheros MP3'), false);
    }
  },
});

// ── Endpoints ───────────────────────────────────────────────────────────────

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await redis.ping();
    res.json({
      status: 'ok',
      redis: 'connected',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      redis: 'disconnected',
      error: err.message,
    });
  }
});

// Listar canciones
app.get('/api/songs', async (req, res) => {
  try {
    const keys = await redis.keys('song:*');
    const songs = [];
    for (const key of keys) {
      const song = await redis.hgetall(key);
      if (song && song.title) {
        songs.push({
          id: key.replace('song:', ''),
          title: song.title,
          artist: song.artist,
          album: song.album || '',
          duration: parseInt(song.duration) || 0,
          genre: song.genre || '',
          filename: song.filename,
        });
      }
    }
    // Ordenar por título
    songs.sort((a, b) => a.title.localeCompare(b.title));
    res.json(songs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Detalle de una canción
app.get('/api/songs/:id', async (req, res) => {
  try {
    const song = await redis.hgetall(`song:${req.params.id}`);
    if (!song || !song.title) {
      return res.status(404).json({ error: 'Canción no encontrada' });
    }
    res.json({
      id: req.params.id,
      ...song,
      duration: parseInt(song.duration) || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Streaming de audio
app.get('/api/stream/:id', async (req, res) => {
  try {
    const song = await redis.hgetall(`song:${req.params.id}`);
    if (!song || !song.filename) {
      return res.status(404).json({ error: 'Canción no encontrada' });
    }

    const filepath = path.join(MUSIC_DIR, song.filename);
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({
        error: 'Fichero de audio no encontrado',
        path: filepath,
      });
    }

    const stat = fs.statSync(filepath);
    const range = req.headers.range;

    if (range) {
      // Streaming parcial (Range requests)
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunksize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'audio/mpeg',
      });
      fs.createReadStream(filepath, { start, end }).pipe(res);
    } else {
      // Descarga completa
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(filepath).pipe(res);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Subir canción
app.post('/api/upload', upload.single('song'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se envió ningún fichero' });
    }

    const id = path.basename(req.file.filename, path.extname(req.file.filename));
    const metadata = {
      title: req.body.title || req.file.originalname,
      artist: req.body.artist || 'Desconocido',
      album: req.body.album || '',
      genre: req.body.genre || '',
      duration: req.body.duration || '0',
      filename: req.file.filename,
      uploaded: new Date().toISOString(),
    };

    await redis.hset(`song:${id}`, metadata);

    res.status(201).json({ id, ...metadata });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Playlists ───────────────────────────────────────────────────────────────

// Listar playlists
app.get('/api/playlists', async (req, res) => {
  try {
    const keys = await redis.keys('playlist:*');
    const playlists = [];
    for (const key of keys) {
      const pl = await redis.hgetall(key);
      if (pl && pl.name) {
        playlists.push({
          id: key.replace('playlist:', ''),
          name: pl.name,
          songs: JSON.parse(pl.songs || '[]'),
          created: pl.created,
        });
      }
    }
    res.json(playlists);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear playlist
app.post('/api/playlists', async (req, res) => {
  try {
    const { name, songs } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });

    const id = crypto.randomBytes(4).toString('hex');
    const playlist = {
      name,
      songs: JSON.stringify(songs || []),
      created: new Date().toISOString(),
    };

    await redis.hset(`playlist:${id}`, playlist);
    res.status(201).json({ id, ...playlist, songs: songs || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener playlist
app.get('/api/playlists/:id', async (req, res) => {
  try {
    const pl = await redis.hgetall(`playlist:${req.params.id}`);
    if (!pl || !pl.name) {
      return res.status(404).json({ error: 'Playlist no encontrada' });
    }
    res.json({
      id: req.params.id,
      name: pl.name,
      songs: JSON.parse(pl.songs || '[]'),
      created: pl.created,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Actualizar playlist
app.put('/api/playlists/:id', async (req, res) => {
  try {
    const exists = await redis.exists(`playlist:${req.params.id}`);
    if (!exists) {
      return res.status(404).json({ error: 'Playlist no encontrada' });
    }

    const updates = {};
    if (req.body.name) updates.name = req.body.name;
    if (req.body.songs) updates.songs = JSON.stringify(req.body.songs);

    await redis.hset(`playlist:${req.params.id}`, updates);
    const pl = await redis.hgetall(`playlist:${req.params.id}`);
    res.json({
      id: req.params.id,
      name: pl.name,
      songs: JSON.parse(pl.songs || '[]'),
      created: pl.created,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar playlist
app.delete('/api/playlists/:id', async (req, res) => {
  try {
    const deleted = await redis.del(`playlist:${req.params.id}`);
    if (!deleted) {
      return res.status(404).json({ error: 'Playlist no encontrada' });
    }
    res.json({ message: 'Playlist eliminada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Auto-seed: registrar los MP3 del directorio de música ───────────────────
async function autoSeed() {
  try {
    const keys = await redis.keys('song:*');
    if (keys.length > 0) {
      console.log(`[Seed] Redis ya tiene ${keys.length} canciones, saltando seed.`);
      return;
    }
    console.log('[Seed] Redis vacío, escaneando directorio de música...');
    if (!fs.existsSync(MUSIC_DIR)) {
      console.log('[Seed] Directorio de música no encontrado:', MUSIC_DIR);
      return;
    }
    const files = fs.readdirSync(MUSIC_DIR).filter(f => f.endsWith('.mp3'));
    if (files.length === 0) {
      console.log('[Seed] No hay ficheros MP3 en', MUSIC_DIR);
      return;
    }
    for (const file of files) {
      const id = path.basename(file, '.mp3');
      const name = id.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      await redis.hset(`song:${id}`, {
        title: name,
        artist: 'Desconocido',
        album: 'SpotESIfy',
        genre: '',
        duration: '0',
        filename: file,
      });
      console.log(`  ✓ ${name} (${file})`);
    }
    console.log(`[Seed] ${files.length} canciones registradas.`);
  } catch (err) {
    console.error('[Seed] Error:', err.message);
  }
}

redis.on('connect', () => {
  autoSeed();
});

// ── Arrancar servidor ───────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SpotESIfy API] Escuchando en puerto ${PORT}`);
  console.log(`[SpotESIfy API] Directorio de música: ${MUSIC_DIR}`);
});

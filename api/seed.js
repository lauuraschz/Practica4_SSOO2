const Redis = require('ioredis');

const REDIS_HOST = process.env.REDIS_HOST || 'db';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_PASS = process.env.REDIS_PASS || '';

const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASS || undefined,
  retryStrategy(times) {
    if (times > 10) {
      console.error('[Seed] No se pudo conectar a Redis tras 10 intentos');
      process.exit(1);
    }
    return Math.min(times * 500, 3000);
  },
});

// Canciones precargadas (Creative Commons)
const songs = [
  {
    id: 'chill01',
    title: 'Sunset Waves',
    artist: 'Blue Dot Sessions',
    album: 'SpotESIfy Selects',
    genre: 'Lo-Fi',
    duration: '94',
    filename: 'sunset-waves.mp3',
  },
  {
    id: 'epic01',
    title: 'Digital Horizons',
    artist: 'Kevin MacLeod',
    album: 'SpotESIfy Selects',
    genre: 'Cinematic',
    duration: '67',
    filename: 'digital-horizons.mp3',
  },
  {
    id: 'jazz01',
    title: 'Midnight Coffee',
    artist: 'Broke For Free',
    album: 'SpotESIfy Selects',
    genre: 'Jazz',
    duration: '108',
    filename: 'midnight-coffee.mp3',
  },
  {
    id: 'electro01',
    title: 'Neon Pulse',
    artist: 'Podington Bear',
    album: 'SpotESIfy Selects',
    genre: 'Electronic',
    duration: '82',
    filename: 'neon-pulse.mp3',
  },
  {
    id: 'acoustic01',
    title: 'Morning Light',
    artist: 'Scott Buckley',
    album: 'SpotESIfy Selects',
    genre: 'Acoustic',
    duration: '75',
    filename: 'morning-light.mp3',
  },
];

// Playlist de ejemplo
const defaultPlaylist = {
  name: 'SpotESIfy Mix',
  songs: JSON.stringify(['chill01', 'jazz01', 'acoustic01']),
  created: new Date().toISOString(),
};

async function seed() {
  console.log('[Seed] Cargando datos iniciales en Redis...');

  for (const song of songs) {
    const { id, ...metadata } = song;
    await redis.hset(`song:${id}`, metadata);
    console.log(`  ✓ ${song.title} — ${song.artist}`);
  }

  await redis.hset('playlist:default', defaultPlaylist);
  console.log(`  ✓ Playlist: ${defaultPlaylist.name}`);

  console.log(`[Seed] ${songs.length} canciones y 1 playlist cargadas.`);
  process.exit(0);
}

redis.on('connect', () => {
  console.log('[Seed] Conectado a Redis');
  seed().catch((err) => {
    console.error('[Seed] Error:', err.message);
    process.exit(1);
  });
});

redis.on('error', (err) => {
  console.error('[Seed] Error de conexión:', err.message);
});

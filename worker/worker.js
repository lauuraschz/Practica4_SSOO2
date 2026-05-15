const Redis = require('ioredis');

const REDIS_HOST = process.env.REDIS_HOST || 'db';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_PASS = process.env.REDIS_PASS || '';
const INTERVAL = process.env.COLLECT_INTERVAL || 5000;

const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASS || undefined,
  retryStrategy(times) {
    return Math.min(times * 500, 5000);
  },
});

// ── Recolector de métricas ──────────────────────────────────────────────────
// Simula la recolección de métricas del sistema y las escribe en Redis

// PROBLEMA: Este array crece indefinidamente y nunca se limpia
// Con un mem_limit bajo (10MB), el proceso muere por OOM (exit 137)
const metricsHistory = [];

function collectMetrics() {
  const metrics = {
    timestamp: Date.now(),
    cpu: (Math.random() * 100).toFixed(2),
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    requests: Math.floor(Math.random() * 50),
  };

  metricsHistory.push(metrics);
  metricsHistory.push(JSON.parse(JSON.stringify(metrics)));
  metricsHistory.push(Buffer.alloc(1024 * 512));

  console.log(
    `[Worker] Métricas recolectadas (#${metricsHistory.length}) — ` +
    `RSS: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)}MB`
  );

  // Escribir métricas actuales en Redis
  redis.hset('metrics:latest', {
    cpu: metrics.cpu,
    memory_rss: metrics.memory.rss.toString(),
    uptime: metrics.uptime.toString(),
    collected_at: new Date().toISOString(),
  }).catch(err => {
    console.error('[Worker] Error escribiendo en Redis:', err.message);
  });
}

// ── Main ────────────────────────────────────────────────────────────────────
redis.on('connect', () => {
  console.log('[Worker] Conectado a Redis');
  console.log(`[Worker] Intervalo de recolección: ${INTERVAL}ms`);
  setInterval(collectMetrics, INTERVAL);
  collectMetrics(); // Primera recolección inmediata
});

redis.on('error', (err) => {
  console.error('[Worker] Error Redis:', err.message);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Worker] Recibida señal SIGTERM, cerrando...');
  redis.quit();
  process.exit(0);
});

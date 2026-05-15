#!/usr/bin/env bash
# ============================================================================
# seed_redis.sh — Precargar datos en Redis para SpotESIfy
# Se ejecuta durante el setup de la VM, ANTES de inyectar los errores.
# Usa una instancia temporal de Redis para cargar los datos.
# ============================================================================

set -euo pipefail

REDIS_PASS="spotesify123"
PROJECT_DIR="${HOME}/spotesify"

echo "[Seed] Cargando datos iniciales en Redis..."

# Esperar a que Redis esté listo
wait_for_redis() {
    local retries=0
    while ! docker exec spotesify-db redis-cli -a "$REDIS_PASS" ping 2>/dev/null | grep -q PONG; do
        retries=$((retries + 1))
        if [[ $retries -gt 30 ]]; then
            echo "[Seed] ERROR: Redis no respondió tras 30 intentos"
            exit 1
        fi
        echo "[Seed] Esperando a Redis... (intento ${retries})"
        sleep 1
    done
    echo "[Seed] Redis está listo."
}

# Función helper para insertar un hash en Redis
redis_hset() {
    local key="$1"
    shift
    docker exec spotesify-db redis-cli -a "$REDIS_PASS" HSET "$key" "$@" > /dev/null 2>&1
}

wait_for_redis

# ── Canciones ────────────────────────────────────────────────────────────────
echo "[Seed] Insertando canciones..."

redis_hset "song:chill01" \
    title "Sunset Waves" \
    artist "Blue Dot Sessions" \
    album "SpotESIfy Selects" \
    genre "Lo-Fi" \
    duration "94" \
    filename "sunset-waves.mp3"

redis_hset "song:epic01" \
    title "Digital Horizons" \
    artist "Kevin MacLeod" \
    album "SpotESIfy Selects" \
    genre "Cinematic" \
    duration "67" \
    filename "digital-horizons.mp3"

redis_hset "song:jazz01" \
    title "Midnight Coffee" \
    artist "Broke For Free" \
    album "SpotESIfy Selects" \
    genre "Jazz" \
    duration "108" \
    filename "midnight-coffee.mp3"

redis_hset "song:electro01" \
    title "Neon Pulse" \
    artist "Podington Bear" \
    album "SpotESIfy Selects" \
    genre "Electronic" \
    duration "82" \
    filename "neon-pulse.mp3"

redis_hset "song:acoustic01" \
    title "Morning Light" \
    artist "Scott Buckley" \
    album "SpotESIfy Selects" \
    genre "Acoustic" \
    duration "75" \
    filename "morning-light.mp3"

echo "  ✓ 5 canciones insertadas"

# ── Playlist de ejemplo ──────────────────────────────────────────────────────
redis_hset "playlist:default" \
    name "SpotESIfy Mix" \
    songs '["chill01","jazz01","acoustic01"]' \
    created "$(date -Iseconds)"

echo "  ✓ 1 playlist insertada"

# ── Verificar ────────────────────────────────────────────────────────────────
SONG_COUNT=$(docker exec spotesify-db redis-cli -a "$REDIS_PASS" KEYS "song:*" 2>/dev/null | wc -l)
echo "[Seed] Verificación: ${SONG_COUNT} canciones en Redis."
echo "[Seed] Datos cargados correctamente."

#!/bin/sh
set -e

CONFIG_DIR="${CONFIG_DIR:-/data}"
PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

mkdir -p "$CONFIG_DIR" 2>/dev/null || true

# If started as root, fix /data ownership and drop privileges to PUID:PGID.
# If started rootless (e.g. docker run --user), run directly.
if [ "$(id -u)" = "0" ]; then
  chown -R "${PUID}:${PGID}" "$CONFIG_DIR" 2>/dev/null || true
  exec su-exec "${PUID}:${PGID}" "$@"
fi

exec "$@"

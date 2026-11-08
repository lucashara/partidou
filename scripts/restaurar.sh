#!/usr/bin/env bash
# Restaura um backup do Partidou. Recusa arquivo de outro aplicativo ou corrompido e guarda cópia do banco atual.
set -euo pipefail

RAIZ=${PARTIDOU_RAIZ:-/opt/partidou}
DESTINO=${PARTIDOU_BACKUPS:-/root/backups/partidou}
APPLICATION_ID=1346458196
UID_APP=10791
ARQUIVO=${1:-}

[ -n "$ARQUIVO" ] && [ -f "$ARQUIVO" ] || { echo "Uso: restaurar.sh <arquivo-de-backup.db>" >&2; exit 2; }
if [ "$(sqlite3 "$ARQUIVO" 'PRAGMA integrity_check;')" != ok ] ||
  [ "$(sqlite3 "$ARQUIVO" 'PRAGMA application_id;')" != "$APPLICATION_ID" ]; then
  echo "Arquivo recusado: não é um backup íntegro do Partidou." >&2
  exit 1
fi

docker compose -f "$RAIZ/compose.yaml" stop app
if [ -f "$RAIZ/data/partidou.db" ]; then
  mkdir -p "$DESTINO"
  cp -p "$RAIZ/data/partidou.db" "$DESTINO/antes-da-restauracao-$(date +%Y%m%d-%H%M%S).db"
fi
rm -f "$RAIZ/data/partidou.db" "$RAIZ/data/partidou.db-wal" "$RAIZ/data/partidou.db-shm"
cp "$ARQUIVO" "$RAIZ/data/partidou.db"
chown "$UID_APP:$UID_APP" "$RAIZ/data/partidou.db"
chmod 600 "$RAIZ/data/partidou.db"
docker compose -f "$RAIZ/compose.yaml" up -d app
echo "Banco restaurado de $ARQUIVO"

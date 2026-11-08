#!/usr/bin/env bash
# Backup consistente do SQLite (API de backup, seguro com o app em uso). Mantém 14 dias.
set -euo pipefail

RAIZ=${PARTIDOU_RAIZ:-/opt/partidou}
ORIGEM="$RAIZ/data/partidou.db"
DESTINO=${PARTIDOU_BACKUPS:-/root/backups/partidou}
APPLICATION_ID=1346458196

[ -f "$ORIGEM" ] || { echo "Banco não encontrado: $ORIGEM" >&2; exit 1; }

ARQUIVO="$DESTINO/partidou-$(date +%Y%m%d-%H%M%S).db"
mkdir -p "$DESTINO"
chmod 700 "$DESTINO"
sqlite3 "$ORIGEM" ".timeout 5000" ".backup '$ARQUIVO'"
chmod 600 "$ARQUIVO"

if [ "$(sqlite3 "$ARQUIVO" 'PRAGMA integrity_check;')" != ok ] ||
  [ "$(sqlite3 "$ARQUIVO" 'PRAGMA application_id;')" != "$APPLICATION_ID" ]; then
  echo "Backup inválido, removido: $ARQUIVO" >&2
  rm -f "$ARQUIVO"
  exit 1
fi

find "$DESTINO" -maxdepth 1 -name 'partidou-*.db' -mtime +13 -delete
echo "$ARQUIVO"

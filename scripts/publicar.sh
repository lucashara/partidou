#!/usr/bin/env bash
# Roda no Mac. Valida o commit atual, envia o código ao servidor, publica com conferência e reverte se falhar.
# Uso: scripts/publicar.sh. PARTIDOU_SERVIDOR (alias SSH) é obrigatório; PARTIDOU_URL habilita a conferência pública.
# Os dois podem ficar em .local/publicar.env (fora do Git).
set -euo pipefail
cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
[ -f .local/publicar.env ] && . .local/publicar.env
SERVIDOR=${PARTIDOU_SERVIDOR:?Definir PARTIDOU_SERVIDOR com o alias SSH do servidor.}
URL=${PARTIDOU_URL-}
RAIZ=/opt/partidou

[ -z "$(git status --porcelain)" ] || { echo "Há alterações não commitadas. Commitar antes de publicar." >&2; exit 1; }
[ "$(git branch --show-current)" = main ] || { echo "Publicar só a partir da main." >&2; exit 1; }

npm run verificar
VERSAO=$(git rev-parse --short=12 HEAD)

git archive --format=tar HEAD | ssh "$SERVIDOR" "rm -rf $RAIZ/.novo && mkdir -p $RAIZ/.novo && tar -x -C $RAIZ/.novo"
ssh "$SERVIDOR" "bash $RAIZ/.novo/scripts/atualizar.sh $VERSAO"

if [ -n "$URL" ]; then
  for _ in $(seq 1 15); do
    if curl -fsS --max-time 5 "$URL/saude" | grep -q '"ok":true'; then
      echo "Conferido em $URL (versão $VERSAO)"
      exit 0
    fi
    sleep 2
  done
  echo "Publicado no servidor, mas $URL não respondeu. Conferir o túnel." >&2
  exit 1
fi

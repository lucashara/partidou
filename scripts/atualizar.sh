#!/usr/bin/env bash
# Roda no servidor. Constrói a imagem da versão extraída em .novo, valida um candidato isolado, troca o
# container e confere o resultado. Se algo falhar, volta a imagem anterior e, se preciso, o banco anterior.
set -euo pipefail

RAIZ=${PARTIDOU_RAIZ:-/opt/partidou}
NOVO="$RAIZ/.novo"
VERSAO=${1:?Uso: atualizar.sh <versao>}
UID_APP=10791
PORTA_CANDIDATO=18791
BACKUP_ANTES=""

exec 9>"$RAIZ/.atualizando"
flock -n 9 || { echo "Outra atualização está em andamento." >&2; exit 1; }

compose() { docker compose -f "$RAIZ/compose.yaml" "$@"; }
remover_candidato() { docker rm -f partidou-candidato >/dev/null 2>&1 || true; }
trap remover_candidato EXIT

saudavel() {
  local nome=$1 tentativas=$2
  for _ in $(seq 1 "$tentativas"); do
    [ "$(docker inspect --format '{{.State.Health.Status}}' "$nome" 2>/dev/null || true)" = healthy ] && return 0
    sleep 2
  done
  return 1
}

conferir_no_ar() {
  curl -fsS --max-time 5 http://127.0.0.1:8791/saude | grep -q '"ok":true' &&
    curl -fsS --max-time 5 http://127.0.0.1:8791/ | grep -q 'Partidou' &&
    [ "$(docker inspect partidou --format '{{ index .Config.Labels "versao" }}')" = "$VERSAO" ]
}

reverter() {
  echo "Falha na publicação da versão $VERSAO. Revertendo." >&2
  if docker image inspect partidou:anterior >/dev/null 2>&1; then
    docker tag partidou:anterior partidou:atual
    compose up -d --force-recreate app
    if ! saudavel partidou 30 && [ -n "$BACKUP_ANTES" ]; then
      echo "Imagem anterior não subiu com o banco atual. Restaurando o backup de antes da publicação." >&2
      "$RAIZ/scripts/restaurar.sh" "$BACKUP_ANTES"
      saudavel partidou 30 || echo "Atenção: a versão anterior não ficou saudável." >&2
    fi
  else
    compose down
  fi
  exit 1
}

mkdir -p "$RAIZ/data" "$RAIZ/logs"
chown "$UID_APP:$UID_APP" "$RAIZ/data" "$RAIZ/logs"
chmod 700 "$RAIZ/data" "$RAIZ/logs"

if [ -f "$RAIZ/data/partidou.db" ]; then
  BACKUP_ANTES=$("$NOVO/scripts/backup.sh")
  echo "Backup antes da publicação: $BACKUP_ANTES"
fi

echo "Construindo a imagem da versão $VERSAO"
docker build --quiet -t partidou:novo --label "versao=$VERSAO" "$NOVO" >/dev/null

echo "Validando o candidato em porta isolada"
remover_candidato
docker run -d --name partidou-candidato --read-only --tmpfs /tmp --cap-drop ALL \
  --security-opt no-new-privileges:true --user "$UID_APP:$UID_APP" --memory 160m \
  -p "127.0.0.1:$PORTA_CANDIDATO:8791" \
  -e HOST=0.0.0.0 -e PORT=8791 -e DB_PATH=/tmp/candidato.db -e LOG_DIR=/tmp/logs \
  partidou:novo >/dev/null
saudavel partidou-candidato 30 || { docker logs partidou-candidato >&2; echo "Candidato não ficou saudável." >&2; exit 1; }
curl -fsS --max-time 5 "http://127.0.0.1:$PORTA_CANDIDATO/" | grep -q 'Partidou' || { echo "Candidato não serviu a página." >&2; exit 1; }
remover_candidato

if docker image inspect partidou:atual >/dev/null 2>&1; then
  docker tag partidou:atual partidou:anterior
fi
docker tag partidou:novo partidou:atual
docker tag partidou:novo "partidou:$VERSAO"
docker image rm partidou:novo >/dev/null

install -m 644 "$NOVO/compose.yaml" "$RAIZ/compose.yaml"
rm -rf "$RAIZ/scripts"
cp -a "$NOVO/scripts" "$RAIZ/scripts"
echo "$VERSAO" >"$RAIZ/VERSAO"

if ! { compose up -d --force-recreate app && saudavel partidou 30 && conferir_no_ar; }; then
  reverter
fi

for unidade in "$NOVO"/deploy/partidou-*; do
  [ -e "$unidade" ] || continue
  install -m 644 "$unidade" "/etc/systemd/system/$(basename "$unidade")"
done
systemctl daemon-reload
systemctl enable --now partidou-backup.timer >/dev/null 2>&1

rm -rf "$NOVO"
docker image ls partidou --format '{{.Tag}}' | grep -vE '^(atual|anterior|novo)$' | tail -n +6 |
  xargs -r -I{} docker image rm "partidou:{}" >/dev/null || true
echo "Publicado: versão $VERSAO no ar em 127.0.0.1:8791"

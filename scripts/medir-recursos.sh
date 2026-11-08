#!/usr/bin/env bash
# Roda no servidor. Mostra CPU, memória, imagem e disco do Partidou, sem alterar nada.
set -euo pipefail

RAIZ=${PARTIDOU_RAIZ:-/opt/partidou}

docker stats --no-stream --format 'CPU {{.CPUPerc}} · memória {{.MemUsage}} ({{.MemPerc}}) · processos {{.PIDs}}' partidou
docker image ls partidou:atual --format 'Imagem {{.Repository}}:{{.Tag}} · {{.Size}}'
docker inspect partidou --format 'Limites · memória {{.HostConfig.Memory}} B · CPUs {{.HostConfig.NanoCpus}} n · processos {{.HostConfig.PidsLimit}}'
du -sh "$RAIZ/data" "$RAIZ/logs" | sed 's/^/Disco · /'
df -h / | awk 'NR==2 {print "Disco livre no servidor · " $4 " (" $5 " usado)"}'

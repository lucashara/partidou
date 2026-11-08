# Operação

O Partidou roda em um contêiner Docker, com o banco SQLite em disco do servidor. A exposição HTTPS é feita por um túnel da Cloudflare, fora deste repositório.

## Estrutura no servidor

| Caminho | Conteúdo |
|---|---|
| `/opt/partidou/compose.yaml` | Definição do contêiner |
| `/opt/partidou/scripts/` | `atualizar.sh`, `backup.sh`, `restaurar.sh`, `medir-recursos.sh` |
| `/opt/partidou/data/` | Banco SQLite (dono: uid 10791, modo 700) |
| `/opt/partidou/logs/` | Logs JSON do aplicativo, rotativos |
| `/opt/partidou/VERSAO` | Hash do commit publicado |
| `/root/backups/partidou/` | Backups diários do banco |

O contêiner usa a imagem `partidou:atual`. A publicação anterior fica como `partidou:anterior` e cada versão como `partidou:<hash>`.

## Publicar

No computador de desenvolvimento, com a `main` limpa e commitada:

```bash
PARTIDOU_SERVIDOR=<alias-ssh> PARTIDOU_URL=https://<dominio> scripts/publicar.sh
```

As duas variáveis podem ficar em `.local/publicar.env`, fora do Git. Sem `PARTIDOU_URL`, a conferência pública é pulada.

O script segue esta ordem e para na primeira falha:

1. Recusa árvore suja ou branch diferente de `main`.
2. Roda `npm run verificar` (lint, tipos e testes).
3. Envia o conteúdo do commit (`git archive`) para uma pasta temporária no servidor.
4. No servidor, `atualizar.sh` faz backup do banco, constrói a imagem, sobe um candidato isolado em outra porta e confere `/saude` e a página.
5. Troca o contêiner e confere `/saude`, a página e o rótulo `versao` da imagem em execução.
6. Confere a URL pública, quando configurada.

## Rollback

Falha em qualquer conferência depois da troca reverte sozinha: a imagem `partidou:anterior` volta a ser `atual` e o contêiner é recriado. Se a versão anterior não subir com o banco atual, o backup feito no início da publicação é restaurado.

Rollback manual para a versão anterior:

```bash
docker tag partidou:anterior partidou:atual
docker compose -f /opt/partidou/compose.yaml up -d --force-recreate app
```

O servidor recusa abrir um banco de esquema mais novo que o do código. Se a versão antiga não subir por isso, restaure um backup anterior à publicação.

## Backup

`backup.sh` usa a API de backup do SQLite, segura com o aplicativo em uso, confere `integrity_check` e o `application_id`, remove o arquivo se qualquer teste falhar e apaga cópias com mais de 14 dias. O timer `partidou-backup.timer` (unidade em `deploy/`) executa todo dia às 04:45.

```bash
systemctl list-timers partidou-backup.timer
/opt/partidou/scripts/backup.sh
```

Os backups ficam no mesmo servidor do banco. Cópia externa não é feita por este projeto.

## Restaurar

```bash
/opt/partidou/scripts/restaurar.sh /root/backups/partidou/partidou-AAAAMMDD-HHMMSS.db
```

O script recusa arquivo corrompido ou de outro aplicativo, para o contêiner, guarda uma cópia do banco atual em `antes-da-restauracao-*.db`, troca o arquivo, ajusta o dono e sobe o contêiner de novo.

## Recursos

```bash
/opt/partidou/scripts/medir-recursos.sh
```

Mostra CPU, memória, tamanho da imagem, limites do contêiner e uso de disco. Limites configurados: 256 MiB de memória, 0,5 CPU e 64 processos. Logs do Docker rotacionam em 3 arquivos de 10 MiB.

## Variáveis do contêiner

Definidas no `compose.yaml`; a tabela completa está em [configuracao.md](configuracao.md). O gateway da rede do compose (`172.29.91.1`) é o endereço de origem das requisições do túnel e está em `PROXY_CONFIAVEL`. Mudar a sub-rede da rede exige mudar as duas linhas juntas.

## Desligamento

`SIGTERM` fecha as conexões de eventos, termina as requisições em curso e fecha o banco. O compose espera até 15 segundos antes de forçar.

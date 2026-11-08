# Partidou

Jogou? Registrou.

Aplicativo web instalável (PWA) para registrar o resultado de partidas entre amigos. Cada grupo tem uma resenha: um espaço permanente com as partidas por data, o placar final, os pênaltis quando houve empate e a classificação geral. Não há cadastro, e-mail nem senha: quem cria a resenha convida os demais por um link.

## Recursos

- Resenhas independentes, com criador e participantes, convite por link e chave de recuperação.
- Partida com dois lados de nome livre (pessoa, dupla ou time), placar final, pênaltis opcionais em empate e modalidade opcional.
- Lançar, editar, excluir e desfazer, com histórico de quem lançou e de quem alterou.
- Estatísticas: jogos, vitórias, empates, derrotas, gols pró e contra, saldo, maior diferença e confrontos. Pênaltis não entram nos gols.
- Funciona sem rede: abre, lê e lança offline, e sincroniza depois sem duplicar partidas.
- Tema claro e escuro, mobile primeiro, cartão de resumo em imagem para compartilhar.

## Executar

Requer Node.js 22.13 ou superior (a produção usa 24).

```bash
npm ci
npm run dev        # http://127.0.0.1:8791, recarrega ao editar o servidor
npm start          # modo de produção
```

## Verificar

```bash
npm run verificar  # lint, tipos e testes de unidade e de API
npm run e2e        # roteiros no navegador (iPhone e desktop), sobe o próprio servidor
```

## Documentação

Em [`docs/`](docs/README.md): arquitetura, segurança, configuração, interface, testes e operação (publicação, backup e restauração).

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `server/` | API HTTP, SQLite, limites de uso, eventos em tempo real e arquivos estáticos |
| `compartilhado/` | Regras usadas pelo servidor e pelo navegador: nomes, placar, estatísticas, códigos |
| `public/` | Aplicativo no navegador: telas, motor de dados com fila offline, service worker |
| `test/` | Testes de unidade e de API (`node --test`) |
| `e2e/` | Roteiros Playwright |
| `scripts/` e `deploy/` | Publicação, backup e restauração em servidor com Docker |

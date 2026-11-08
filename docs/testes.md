# Testes

| Camada | Onde | Ferramenta | O que cobre |
|---|---|---|---|
| Regras compartilhadas | `test/*.test.js` | `node --test` | Nomes, placar, datas, códigos e estatísticas |
| API | `test/api-*.test.js` | `node --test`, servidor real em porta efêmera e banco em memória | Resenhas, convites, acesso, partidas, permissões, isolamento entre resenhas, concorrência, limites, cabeçalhos de segurança e eventos |
| Persistência e arquivos | `test/persistencia.test.js`, `test/estaticos.test.js`, `test/faxina.test.js` | `node --test` | Banco em disco, esquema e versão, serviço de estáticos e retenção |
| Motor de dados | `test/cliente/` | `node --test`, servidor falso | Fila, reenvio idempotente, conflito, armazenamento, várias abas, rede e eventos |
| Navegador | `e2e/` | Playwright | Fluxos reais em WebKit (iPhone 375, 390 e 430 px) e Chromium (desktop 1280 px) |

## Rodar

```bash
npm run verificar   # lint (Biome), tipos (tsc) e testes de unidade e de API
npm run e2e         # sobe um servidor próprio com banco temporário e roda os roteiros
```

O `e2e` usa a porta 8802; `E2E_PORTA` troca. Na primeira execução, `npx playwright install webkit chromium` baixa os navegadores.

Para rodar os mesmos roteiros contra um ambiente publicado:

```bash
E2E_URL=https://<dominio> npx playwright test
```

## Roteiros do navegador

| Roteiro | Verifica |
|---|---|
| Lançar, desfazer, editar e excluir | O ciclo completo de uma partida e o estado Sincronizado |
| 0 x 0 e pênaltis | Confirmação do 0 x 0; pênaltis separados dos gols na classificação |
| Partida repetida | Confirmação antes de duplicar |
| Convite | Segundo aparelho entra pelo link, vê o histórico e lança; o primeiro recebe a partida |
| Lista da página inicial | A resenha aparece no aparelho que a criou |
| Service worker | Abrir a resenha e ler o histórico sem rede |
| Fila offline | Partida lançada offline fica pendente e sincroniza uma só vez ao reconectar |
| Duas abas | A partida pendente não é duplicada quando duas abas reconectam |

## Convenções

- Teste de API usa limites folgados; os testes de limite usam os valores reais e relógio controlável.
- Teste de concorrência dispara requisições simultâneas contra o servidor real, não contra funções isoladas.
- `test-results/` e `playwright-report/` não são versionados.

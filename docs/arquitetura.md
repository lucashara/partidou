# Arquitetura

Um processo Node.js serve a API, os eventos em tempo real e os arquivos do aplicativo. O navegador guarda uma cópia local dos dados e uma fila de envio, o que permite usar o aplicativo sem rede. O banco do servidor é sempre a fonte da verdade.

## Decisões

| Decisão | Motivo |
|---|---|
| `node:http` e `node:sqlite`, sem dependência de execução | Menos superfície de ataque e de atualização; a imagem Docker é só o runtime do Node |
| SQLite em um único arquivo | Um servidor, escrita serializada, backup consistente pela API do SQLite. Suficiente para grupos de amigos |
| JavaScript no navegador sem bundler, em módulos ES | O que roda é o que está no repositório; o service worker guarda a lista exata de arquivos |
| Regras em `compartilhado/` | Nome, placar, estatísticas e códigos têm uma só implementação, usada pelo servidor e pelo navegador |
| JSDoc com `tsc` em vez de TypeScript | Tipos conferidos no gate sem etapa de compilação |
| Acesso por aparelho e convite | Sem cadastro; detalhes em [seguranca.md](seguranca.md) |

## Servidor

```
server/
  main.js            entrada, encerramento gracioso
  servidor.js        composição: banco, limitador, eventos, estáticos, faxina
  configuracao.js    variáveis de ambiente
  banco.js           abertura do SQLite e transações
  migracoes.js       esquema por versão (`user_version`); migração publicada nunca é editada
  http/              roteamento, corpo, cabeçalhos, origem do cliente, rotas por recurso
  nucleo/            regras: resenhas, membros, convites, acesso, competidores, partidas, estado
  limitador.js       limites por IP e disjuntor
  eventos.js         SSE (aviso de mudança)
  estaticos.js       arquivos do aplicativo, versão e lista do service worker
  faxina.js          retenção de sessões, convites e transferências vencidos
  registro.js        log JSON rotativo
```

A camada `http/` só traduz requisição em chamada ao `nucleo/` e erro em resposta. A regra de negócio e a autorização ficam no `nucleo/`, dentro de transações do SQLite.

### Modelo de dados

| Tabela | Conteúdo |
|---|---|
| `resenhas` | Nome, contador de mudanças (`seq`) e hash da chave de recuperação |
| `membros` | Apelido, papel (`criador` ou `participante`), revogação. Um criador ativo por resenha |
| `sessoes` | Hash do token de cada aparelho |
| `convites`, `transferencias` | Hash dos códigos, validade e uso |
| `competidores` | Nome de cada lado, reutilizável, com identificador estável |
| `partidas` | Lados, placar, pênaltis, modalidade, data, autoria, revisão (`rev`) e exclusão lógica |

Toda mudança incrementa o `seq` da resenha. O aparelho guarda o último `seq` que viu.

### API

JSON sobre HTTP, em `/api`. Rotas públicas (criar resenha, consultar e aceitar convite, recuperar acesso, usar transferência) têm limites próprios; as demais exigem a sessão.

| Método e caminho | Função |
|---|---|
| `POST /api/resenhas` | Cria a resenha, o criador, o convite e a chave de recuperação |
| `POST /api/convites/consultar` · `aceitar` | Mostra a resenha de um convite e entra nela |
| `POST /api/acesso/recuperar` | Abre acesso com a chave de recuperação |
| `POST /api/acesso/transferencia` · `/usar` | Gera e usa o código de transferência entre aparelhos |
| `GET /api/resenhas/:id/estado` | Estado completo da resenha, com `seq` |
| `GET /api/resenhas/:id/eventos` | Fluxo SSE com avisos de que o `seq` mudou |
| `PATCH` · `DELETE /api/resenhas/:id` | Renomeia e exclui a resenha (criador) |
| `POST` · `DELETE /api/resenhas/:id/convite` | Gera e revoga o convite (criador) |
| `POST /api/resenhas/:id/chave-recuperacao` | Gera nova chave (criador) |
| `DELETE /api/resenhas/:id/membros/:mid` · `eu` | Remove participante; sai da resenha |
| `POST /api/resenhas/:id/partidas` | Lança partida |
| `PATCH` · `DELETE /api/resenhas/:id/partidas/:pid` · `POST .../restaurar` | Edita, exclui e restaura |
| `PATCH /api/resenhas/:id/competidores/:cid` | Renomeia um lado em todas as partidas (criador) |
| `DELETE /api/sessao` | Encerra a sessão do aparelho |
| `GET /saude` | Estado do processo e do banco, usado pelo healthcheck |

## Navegador

```
public/js/
  app.js, roteador.js   inicialização e rotas por fragmento (#/...)
  telas/, abas/         início, criar, entrar, acesso, resenha com as abas Placar, Histórico, Geral e Ajustes
  componentes/, folhas/ componentes reutilizáveis e folhas modais
  dados/                motor de dados: cache, fila, sincronização, eventos
```

### Motor de dados

| Módulo | Papel |
|---|---|
| `armazenamento-idb.js` | Cache e fila em IndexedDB, com versão de esquema |
| `operacoes.js` | Monta operações (lançar, editar, excluir) com identificador gerado no aparelho |
| `controlador.js` | Fachada das telas: aplica a mudança localmente na hora e enfileira o envio |
| `sincronizacao.js` | Envia a fila em ordem, com recuo progressivo e variação aleatória |
| `sse.js` | Recebe o aviso de mudança e pede o estado; sonda a cada 45 s se o fluxo cair |
| `visao.js` | Funde cache, resposta do servidor e fila pendente na visão que a tela desenha |

### Sincronização

1. A ação do usuário vira uma operação com identificador próprio e é aplicada na visão local imediatamente, marcada como pendente.
2. A fila envia as operações em ordem. O identificador torna o reenvio seguro: um lançamento repetido não duplica a partida.
3. Cada edição carrega a revisão (`rev`) da partida que o aparelho conhecia. Se outro aparelho alterou antes, o servidor responde 409 com a versão atual, e o aparelho descarta a própria edição com aviso. Reenvio de uma edição que o servidor já aplicou é reconhecido como aplicado.
4. A folha de edição guarda a revisão com que abriu; se a partida mudou enquanto estava aberta, mostra os valores atuais em vez de sobrescrever.
5. O fluxo SSE só avisa que há mudança. Quem busca o dado é o aparelho, pela rota de estado, o que mantém a autorização em um único lugar.
6. Com várias abas do mesmo aparelho, um bloqueio do navegador (Web Locks) garante um único remetente por vez, e um canal entre abas replica o estado.

Estados exibidos no cabeçalho: Sincronizado, Pendente, Offline, Erro e Sem acesso.

### Uso offline

O service worker guarda todos os arquivos do aplicativo, numa lista que o servidor gera a cada versão publicada, e responde a navegação com a página inicial guardada. A API e `/saude` nunca passam por ele: a fila é do aplicativo. Cada versão nova cria um cache novo e apaga os antigos.

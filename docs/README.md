# Documentação do Partidou

| Documento | Responde |
|---|---|
| [arquitetura.md](arquitetura.md) | Como as partes se encaixam: servidor, banco, motor de dados no navegador, sincronização e offline |
| [seguranca.md](seguranca.md) | Modelo de acesso sem conta, segredos, limites de uso e proteções |
| [configuracao.md](configuracao.md) | Variáveis de ambiente e limites de dados |
| [interface.md](interface.md) | Telas, linguagem visual, estados, acessibilidade e instalação |
| [testes.md](testes.md) | O que cada camada de teste cobre e como rodar |
| [operacao.md](operacao.md) | Publicação com Docker, rollback, backup, restauração e medição de recursos |

## Identificação

| Item | Valor |
|---|---|
| Nome | Partidou |
| Situação | Em produção |
| Uso | Registro de resultados de partidas entre amigos |
| Stack | Node.js (`node:http`, `node:sqlite`), JavaScript no navegador sem bundler, Docker |
| Dependências de execução | Nenhuma |

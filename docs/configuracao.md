# Configuração

Toda a configuração vem de variáveis de ambiente, lidas uma vez na subida por `server/configuracao.js`. Nenhuma é segredo e todas têm padrão. Valor inválido derruba a subida com mensagem, nunca é ignorado. `.env.example` traz o modelo.

## Servidor

| Variável | Padrão | Função |
|---|---|---|
| `PORT` | `8791` | Porta de escuta |
| `HOST` | `127.0.0.1` | Endereço de escuta. Em contêiner, `0.0.0.0`, com a porta publicada só no loopback do host |
| `DB_PATH` | `./data/partidou.db` | Arquivo SQLite. `:memory:` só nos testes |
| `LOG_DIR` | `./logs` | Pasta dos logs JSON rotativos |
| `DEV` | vazio | `1` relê os arquivos estáticos a cada requisição |
| `TRUST_PROXY` | vazio | `cloudflare` ativa a leitura de `CF-Connecting-IP` e o cabeçalho HSTS |
| `PROXY_CONFIAVEL` | loopback | Endereços IP, separados por vírgula, de quem pode informar `CF-Connecting-IP`. Em Docker, o gateway da rede do compose |

`CF-Connecting-IP` só vale quando `TRUST_PROXY=cloudflare` e o endereço do socket está em `PROXY_CONFIAVEL`. Fora disso o cabeçalho é ignorado e o servidor registra um aviso uma única vez, porque sem o IP real os limites por IP passam a valer para todos juntos.

## Limites de dados

| Variável | Padrão | Limite |
|---|---|---|
| `MAX_RESENHAS` | `5000` | Resenhas no banco inteiro |
| `MAX_CRIACOES_DIA` | `300` | Resenhas criadas por dia, somando todos os IPs |
| `MAX_MEMBROS` | `30` | Participantes ativos por resenha |
| `MAX_COMPETIDORES` | `60` | Nomes de lados por resenha |
| `MAX_PARTIDAS` | `5000` | Partidas por resenha. A consulta de estado devolve todas em uma resposta, o que fixa o teto |

## Limites de uso por IP

Janelas fixas em memória, por processo. Cada linha tem contador próprio por IP.

| Limite | Valor |
|---|---|
| Criação de resenha | 5 por hora |
| Requisições sem token | 60 por minuto |
| Escritas autenticadas | 120 por minuto |
| Leituras autenticadas | 300 por minuto |
| Códigos errados (convite, chave, transferência) | A partir da 8ª falha, bloqueio de 30 segundos que dobra até 1 hora; as falhas são esquecidas após 24 horas |
| Disjuntor global de códigos errados | Com 20.000 falhas em uma hora, as rotas de código respondem 429 por 5 minutos |

IPv6 é agrupado pelo prefixo /64. Excedido o limite, a resposta é 429 com `Retry-After`.

## Validades

| Item | Validade |
|---|---|
| Convite | 7 dias, um ativo por resenha |
| Código de transferência | 10 minutos, uso único |
| Sessão do aparelho | 180 dias sem uso |
| Chave de recuperação | Sem validade; trocada a cada uso |
| Resenha | Sem expiração |

Sessões, convites e transferências vencidos ou revogados são apagados 30 dias depois por uma rotina que roda na subida e a cada 6 horas.

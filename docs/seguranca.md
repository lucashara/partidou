# Segurança

O Partidou não tem conta, e-mail nem senha. O acesso é por aparelho e por convite.

## Modelo de acesso

| Elemento | Formato | Como funciona |
|---|---|---|
| Sessão do aparelho | 256 bits aleatórios | Enviada no cabeçalho `Authorization: Bearer`. O banco guarda só o hash SHA-256. Vale 180 dias sem uso; cada membro mantém no máximo 10 sessões, e a mais antiga cai quando surge uma nova |
| Convite | 12 símbolos (60 bits) | Vai no fragmento da URL (`#/c/CODIGO`), que o navegador não envia ao servidor nem a recursos externos. Vale 7 dias; gerar outro revoga o anterior |
| Código de transferência | 8 símbolos (40 bits) | Passa a sessão de um aparelho para outro, por exemplo do Safari para o aplicativo instalado. Vale 10 minutos e um uso |
| Identificadores | 128 bits (resenha), UUID (partida) | Imprevisíveis; nenhuma rota lista resenhas |

O alfabeto dos códigos é o Crockford base 32, sem caracteres ambíguos. Os segredos existem em claro só na resposta que os cria.

## Autorização

Toda rota autenticada resolve a sessão, confere que a resenha da URL é a do membro e aplica o papel antes de tocar nos dados.

| Operação | Quem pode |
|---|---|
| Ler estado e eventos da resenha | Qualquer membro ativo |
| Lançar partida | Qualquer membro |
| Editar ou excluir partida | Quem lançou e o criador |
| Renomear lado, gerar convite, remover participante, excluir resenha | Só o criador |
| Sair da resenha | O próprio participante |

Membro removido perde as sessões na mesma transação. Um aparelho nunca enxerga outra resenha, e o acerto de um identificador de outra resenha devolve 404.

## Proteção contra abuso

- Limites por IP em criação, requisições sem token, escritas e leituras, mais bloqueio progressivo para códigos errados e um disjuntor global. Valores em [configuracao.md](configuracao.md).
- IP real vindo da Cloudflare só é aceito de proxy confiável.
- Consulta de código inválido responde sempre igual (404), sem distinguir inexistente de expirado.
- Corpo de requisição limitado a 16 KiB e aceito só como `application/json`; todos os campos são validados no servidor. O navegador valida só para dar resposta rápida.
- Escritas concorrentes usam revisão por partida: quem edita sobre uma versão antiga recebe 409 com o estado atual, em vez de sobrescrever.
- Lançamentos têm identificador gerado no aparelho, então reenviar a fila depois de uma resposta perdida não duplica a partida.

## Navegador

| Proteção | Valor |
|---|---|
| `Content-Security-Policy` | `default-src 'self'`, sem script nem estilo inline, `object-src 'none'`, `base-uri 'none'` e `frame-ancestors 'none'` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Referrer-Policy` | `no-referrer` |
| `X-Content-Type-Options` | `nosniff` |
| `Permissions-Policy` | Câmera, microfone e localização desligados |
| `Strict-Transport-Security` | Um ano, quando atrás da Cloudflare |

Nenhum segredo vai em URL de requisição, em log ou em recurso de terceiros. O convite fica no fragmento e é removido da barra de endereço depois de lido. A API e os eventos nunca passam pelo cache do service worker.

## Servidor e contêiner

- Sem porta pública: o contêiner escuta no loopback do host e o acesso externo é por túnel da Cloudflare.
- Usuário sem privilégios, sistema de arquivos somente leitura, `cap_drop: ALL`, `no-new-privileges`, limites de memória, CPU e processos.
- Dados em SQLite com `application_id` próprio; o servidor recusa banco de outro aplicativo ou de esquema mais novo.
- Consultas SQL sempre com parâmetros, nunca por concatenação.

## Limites conhecidos

| Situação | Efeito | Tratamento |
|---|---|---|
| Banco e backups no mesmo servidor | Perda do servidor perde os dois | Risco aceito; a cópia externa cifrada fica para decisão do operador |
| Criação de resenha sem verificação humana | Muitos IPs podem esgotar a cota diária | Limite por IP e por dia; sem captcha |
| Participante mal-intencionado | Pode esgotar a cota de nomes de lados da resenha | O criador remove o participante; os nomes criados continuam e podem ser renomeados |
| Criador sem nenhum aparelho com acesso | Perde a administração da resenha. Não há chave nem senha de recuperação | Gerar o código de transferência em Ajustes antes de trocar de aparelho. Sem isso, só o operador do servidor recupera |
| Segredo guardado só no aparelho | A limpeza dos dados do navegador apaga a sessão | Participante volta com novo convite; o criador, por código de transferência de outro aparelho |

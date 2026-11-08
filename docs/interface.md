# Interface

Mobile primeiro, com coluna única de até 640 px centralizada no desktop. A linguagem visual lembra um estádio à noite: gramado escuro, placar de LED âmbar nos números e azul e vermelho para os dois lados de cada partida. O âmbar também marca a ação principal e o item ativo; o vermelho de erro fica reservado a excluir.

## Telas

| Tela | Conteúdo |
|---|---|
| Início | Lista das resenhas do aparelho, Criar resenha e Entrar em resenha. Sem resenhas, Criar resenha é a ação em destaque |
| Criar resenha | Nome e apelido. Em seguida, o link de convite para compartilhar e o botão Abrir resenha |
| Entrar em resenha | Convite recebido por link ou digitado, depois o apelido. Também oferece o código de transferência, gerado em Ajustes de outro aparelho |
| Placar | Dois lados com nome livre e sugestões dos nomes já usados, placar em botões e digitação direta, pênaltis quando há empate, modalidade opcional e Lançar partida. Abaixo, as últimas partidas |
| Histórico | Partidas por dia, da mais recente para a mais antiga. Tocar numa partida abre a edição, com autoria, Salvar e Excluir |
| Geral | Classificação por vitórias e saldo de gols, maior diferença, confrontos e o cartão de resumo para compartilhar |
| Ajustes | Nome da resenha, convite, participantes, código de transferência, remoção do aparelho e exclusão da resenha |

A primeira visita abre uma apresentação curta; o botão `?` do cabeçalho a reabre.

## Registro de partida

- O botão Lançar partida fica indisponível enquanto faltam os dois lados, os lados são iguais ou o placar não foi definido. Um 0 x 0 só é aceito depois de Registrar 0 x 0 ou de digitar o zero.
- Pênaltis aparecem apenas com placar empatado, são guardados à parte e nunca somados aos gols. Não podem terminar empatados.
- Partida igual à lançada há instantes pede confirmação antes de duplicar.
- Depois de lançar, o aviso no topo oferece Desfazer por 6 segundos; ao sair da resenha ele deixa de aparecer.
- Os valores seguem o que o usuário digita, sem limite de regra oficial (até 999).

## Tema, tipografia e movimento

| Item | Definição |
|---|---|
| Tema | Escuro único (`color-scheme: dark`), por tokens de cor em `public/css/tokens.css`; não segue o tema claro do sistema |
| Tipografia | Barlow e Barlow Condensed para texto e títulos, Doto nos dígitos de LED (licença OFL nas três), servidas pelo próprio aplicativo |
| Movimento | Só onde explica mudança de estado; `prefers-reduced-motion` desliga as transições |
| Safe areas | Cabeçalho, abas e ações fixas respeitam as áreas seguras do iPhone |
| Desktop | A partir de 768 px as abas descem para abaixo do cabeçalho |

## Estados

Toda tela tem estado de carregamento (esqueleto), vazio, erro e sem acesso. Erros de rede e de servidor aparecem como aviso no topo, ou dentro da folha quando há uma aberta. O indicador do cabeçalho mostra Sincronizado, Pendente, Offline, Erro ou Sem acesso; abaixo de 420 px o estado Sincronizado vira só o ponto verde (o texto segue para o leitor de tela) e os demais mantêm o rótulo.

## Acessibilidade

- Alvo mínimo de toque de 44 px nas ações principais e de 24 px nas demais.
- Contraste conferido no tema escuro; foco visível; navegação por teclado.
- Campo de nome do lado como combobox, com opções anunciadas pelas setas.
- Fonte do sistema ampliada a 200% sem rolagem horizontal.
- Rótulos de controle em texto, sem ícone isolado fora de fechar, ajuda e voltar.

## Instalação

O aplicativo tem manifesto e ícones, e instala na tela inicial. No iPhone, o Safari e o aplicativo instalado têm armazenamento separado: quem instala usa o código de transferência (Ajustes) para levar o acesso ao aplicativo instalado.

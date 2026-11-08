// Compartilhamento do resumo: gera o cartão em PNG e abre a folha de compartilhamento do sistema.
// Sem suporte a arquivos (desktop, navegadores antigos), baixa a imagem.
import { diaLocal } from '../../compartilhado/datas.js';
import { vencedorFinal } from '../../compartilhado/placar.js';
import { gerarCartao } from './cartao-resumo.js';
import { avisar } from './componentes/aviso.js';
import { h } from './util.js';

function dadosDoCartao({ visao, estatisticas }) {
  const nome = (id) => visao.competidores.find((c) => c.id === id)?.nome ?? '?';
  return {
    nomeResenha: visao.resenha.nome,
    totais: estatisticas.totais,
    tabela: estatisticas.tabela,
    endereco: location.host,
    ultimas: visao.partidas.map((p) => ({
      a: nome(p.ladoA),
      b: nome(p.ladoB),
      placarA: p.placarA,
      placarB: p.placarB,
      penaltis: p.penaltisA != null ? `${p.penaltisA} x ${p.penaltisB}` : null,
      vencedor: vencedorFinal(p).lado,
    })),
  };
}

function baixar(arquivo) {
  const endereco = URL.createObjectURL(arquivo);
  const ancora = h('a', { href: endereco, download: arquivo.name });
  document.body.append(ancora);
  ancora.click();
  ancora.remove();
  setTimeout(() => URL.revokeObjectURL(endereco), 10_000);
}

/** @param {{ visao: any, estatisticas: any }} origem */
export async function compartilharResumo(origem) {
  let arquivo;
  try {
    const imagem = await gerarCartao(dadosDoCartao(origem));
    arquivo = new File([imagem], `partidou-${diaLocal(Date.now())}.png`, { type: 'image/png' });
  } catch {
    avisar({ texto: 'Falha ao gerar a imagem.', tom: 'erro' });
    return;
  }
  const envio = { files: [arquivo], title: origem.visao.resenha.nome };
  if (navigator.canShare?.(envio)) {
    try {
      await navigator.share(envio);
      return;
    } catch (erro) {
      if (/** @type {any} */ (erro)?.name === 'AbortError') return;
    }
  }
  baixar(arquivo);
  avisar({ texto: 'Imagem salva neste aparelho.' });
}

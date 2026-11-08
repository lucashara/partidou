// @ts-nocheck: testes usam objetos de resposta dinâmicos; os tipos do servidor são conferidos em server/.
import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import { executarFaxina, INTERVALO_FAXINA_MS } from '../server/faxina.js';
import { SESSAO_VALIDADE_MS } from '../server/nucleo/acesso.js';
import { iniciarServidor } from './ajuda/servidor.js';

const DIA = 24 * 3600_000;

const contar = (s, tabela) => s.ctx.banco.um(`SELECT count(*) AS n FROM ${tabela}`).n;

describe('faxina de retenção', () => {
  test('apaga sessão e convite revogados ou expirados há mais de 30 dias, preservando o recente', async () => {
    const s = await iniciarServidor();
    try {
      const dono = await s.criarResenha();
      const { id } = dono;
      const { banco } = s.ctx;
      const agora = s.relogio.agora();
      const sessao = (hash, revogada, uso) =>
        banco.executar(
          'INSERT INTO sessoes (token_hash, membro_id, criada_em, ultimo_uso_em, revogada_em) VALUES (?, ?, ?, ?, ?)',
          hash,
          dono.membro.id,
          agora - 400 * DIA,
          uso,
          revogada,
        );
      sessao('revogada-antiga', agora - 31 * DIA, agora - 40 * DIA);
      sessao('revogada-recente', agora - 29 * DIA, agora - 40 * DIA);
      sessao('expirada-antiga', null, agora - SESSAO_VALIDADE_MS - 31 * DIA);
      sessao('expirada-recente', null, agora - SESSAO_VALIDADE_MS - 29 * DIA);
      const convite = (hash, revogado, expira) =>
        banco.executar(
          'INSERT INTO convites (resenha_id, codigo_hash, criado_por, criado_em, expira_em, revogado_em) VALUES (?, ?, ?, ?, ?, ?)',
          id,
          hash,
          dono.membro.id,
          agora - 100 * DIA,
          expira,
          revogado,
        );
      convite('c-revogado-antigo', agora - 31 * DIA, agora + DIA);
      convite('c-revogado-recente', agora - 29 * DIA, agora + DIA);
      convite('c-expirado-antigo', null, agora - 31 * DIA);
      convite('c-expirado-recente', null, agora - 29 * DIA);

      const antesSessoes = contar(s, 'sessoes');
      const antesConvites = contar(s, 'convites');
      const removidos = executarFaxina(s.ctx);
      assert.equal(removidos.sessoes, 2);
      assert.equal(removidos.convites, 2);
      const restantes = banco.todos('SELECT token_hash FROM sessoes').map((l) => l.token_hash);
      assert.ok(restantes.includes('revogada-recente') && restantes.includes('expirada-recente'));
      assert.ok(!restantes.includes('revogada-antiga') && !restantes.includes('expirada-antiga'));
      assert.equal(contar(s, 'sessoes'), antesSessoes - 2);
      assert.equal(contar(s, 'convites'), antesConvites - 2);
      assert.equal(
        (await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: dono.token })).status,
        200,
        'sessão ativa continua',
      );
    } finally {
      await s.fechar();
    }
  });

  test('apaga transferência usada ou expirada e mantém a pendente', async () => {
    const s = await iniciarServidor();
    try {
      const dono = await s.criarResenha();
      const { banco } = s.ctx;
      const agora = s.relogio.agora();
      const ins = (hash, expira, usada) =>
        banco.executar(
          'INSERT INTO transferencias (codigo_hash, membro_id, expira_em, usada_em) VALUES (?, ?, ?, ?)',
          hash,
          dono.membro.id,
          expira,
          usada,
        );
      ins('usada', agora + 60_000, agora - 1000);
      ins('expirada', agora - 1000, null);
      ins('pendente', agora + 60_000, null);
      assert.equal(executarFaxina(s.ctx).transferencias, 2);
      assert.deepEqual(
        banco.todos('SELECT codigo_hash FROM transferencias').map((l) => l.codigo_hash),
        ['pendente'],
      );
    } finally {
      await s.fechar();
    }
  });

  test('roda na subida e a cada 6 h, e para em encerrar()', async () => {
    mock.timers.enable({ apis: ['setInterval'] });
    const falhas = [];
    const registro = { info() {}, aviso() {}, erro: (evento) => falhas.push(evento) };
    const s = await iniciarServidor({ opcoes: { registro } });
    try {
      const dono = await s.criarResenha();
      const { banco } = s.ctx;
      const velha = () =>
        banco.executar(
          'INSERT INTO sessoes (token_hash, membro_id, criada_em, ultimo_uso_em, revogada_em) VALUES (?, ?, ?, ?, ?)',
          `velha-${Math.random()}`,
          dono.membro.id,
          0,
          0,
          s.relogio.agora() - 60 * DIA,
        );
      velha();
      const antes = contar(s, 'sessoes');
      mock.timers.tick(INTERVALO_FAXINA_MS - 1);
      assert.equal(contar(s, 'sessoes'), antes, 'ainda não completou 6 h');
      mock.timers.tick(1);
      assert.equal(contar(s, 'sessoes'), antes - 1, 'passada periódica removeu a sessão antiga');
      velha();
      await s.fechar();
      mock.timers.tick(INTERVALO_FAXINA_MS * 2);
      assert.deepEqual(falhas, [], 'depois de encerrar() o temporizador não dispara contra o banco fechado');
    } finally {
      mock.timers.reset();
    }
  });
});

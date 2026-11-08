// Passos reutilizados pelos roteiros: cada um descreve uma ação do usuário, não um detalhe de implementação.
import { expect } from '@playwright/test';

/** Abre a raiz e dispensa a apresentação da primeira visita. */
export async function abrirApp(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Começar' }).click();
  await expect(page.getByRole('link', { name: 'Criar resenha' })).toBeVisible();
}

/** Cria uma resenha e devolve o link de convite. Termina na tela da resenha. */
export async function criarResenha(page, nome = 'Resenha de Domingo', apelido = 'Lucas') {
  await abrirApp(page);
  await page.getByRole('link', { name: 'Criar resenha' }).click();
  await page.getByLabel('Nome da resenha').fill(nome);
  await page.getByLabel('Apelido').fill(apelido);
  await page.getByRole('button', { name: 'Criar resenha' }).click();
  const exibicao = await page.locator('.codigo-bloco').first().textContent();
  const convite = `${new URL(page.url()).origin}/${exibicao.slice(exibicao.indexOf('#'))}`;
  await page.getByRole('button', { name: 'Abrir resenha' }).click();
  await expect(page.getByRole('combobox', { name: 'Nome do Lado A' })).toBeVisible();
  return convite;
}

/** Entra em uma resenha pelo link de convite com outro apelido. */
export async function entrarPorConvite(page, convite, apelido) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Começar' }).click();
  await page.goto(convite);
  await page.getByLabel('Apelido').fill(apelido);
  await page.getByRole('button', { name: 'Entrar na resenha' }).click();
  await expect(page.getByRole('combobox', { name: 'Nome do Lado A' })).toBeVisible();
}

/** Preenche o editor de placar da aba Placar sem lançar. */
export async function preencherPartida(page, { ladoA, ladoB, golsA, golsB }) {
  const a = page.getByRole('combobox', { name: 'Nome do Lado A' });
  const b = page.getByRole('combobox', { name: 'Nome do Lado B' });
  await a.fill(ladoA);
  await a.press('Escape');
  await b.fill(ladoB);
  await b.press('Escape');
  await page.getByRole('textbox', { name: 'Placar do Lado A' }).fill(String(golsA));
  await page.getByRole('textbox', { name: 'Placar do Lado B' }).fill(String(golsB));
}

/** O app ignora um segundo toque em "Lançar partida" por 700 ms; um usuário real nunca lança duas partidas nesse prazo. */
export const aguardarTravaDeToque = (page) => page.waitForTimeout(750);

/** Preenche e lança uma partida. */
export async function lancarPartida(page, partida) {
  await preencherPartida(page, partida);
  await page.getByRole('button', { name: 'Lançar partida' }).click();
  await expect(page.getByText('Partida lançada.')).toBeVisible();
  await aguardarTravaDeToque(page);
}

export const aba = (page, nome) => page.getByRole('link', { name: nome });
export const sync = (page) => page.locator('.sync');

/** Linhas do Histórico. O painel precisa ser o do Histórico: o Placar também lista partidas recentes. */
export const partidas = (page) => page.locator('section[aria-labelledby="aba-historico"]:not([hidden]) button.partida');
export const pendentes = (page) =>
  page.locator('section[aria-labelledby="aba-historico"]:not([hidden]) .marca-pendente');

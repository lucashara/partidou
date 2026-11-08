import { expect, test } from '@playwright/test';
import { aba, criarResenha, entrarPorConvite, lancarPartida, partidas, preencherPartida, sync } from './ajuda.js';

test('criar resenha, lançar, desfazer, editar e excluir partida', async ({ page }) => {
  await criarResenha(page);

  await lancarPartida(page, { ladoA: 'Lucas', ladoB: 'Rafa', golsA: 3, golsB: 2 });
  await expect(sync(page)).toHaveAttribute('data-estado', 'sincronizado');

  await page.getByRole('button', { name: 'Desfazer' }).click();
  await aba(page, 'Histórico').click();
  await expect(page.getByText('Nenhuma partida registrada')).toBeVisible();

  await aba(page, 'Placar').click();
  await lancarPartida(page, { ladoA: 'Lucas', ladoB: 'Rafa', golsA: 3, golsB: 2 });
  await aba(page, 'Histórico').click();
  await partidas(page).first().click();
  await page.getByRole('textbox', { name: 'Placar do Lado B' }).fill('4');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(partidas(page).first()).toContainText('4');

  await partidas(page).first().click();
  await page.getByRole('button', { name: 'Excluir partida' }).click();
  await expect(page.getByText('Nenhuma partida registrada')).toBeVisible();
});

test('0 x 0 exige confirmação e empate aceita pênaltis separados dos gols', async ({ page }) => {
  await criarResenha(page);
  await page.getByRole('combobox', { name: 'Nome do Lado A' }).fill('Lucas');
  await page.getByRole('combobox', { name: 'Nome do Lado B' }).fill('Rafa');
  await expect(page.getByText('Placar não definido.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lançar partida' })).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('button', { name: 'Registrar 0 x 0' }).click();
  await expect(page.getByRole('button', { name: 'Lançar partida' })).not.toHaveAttribute('aria-disabled', 'true');

  await page.getByRole('textbox', { name: 'Placar do Lado A' }).fill('1');
  await page.getByRole('textbox', { name: 'Placar do Lado B' }).fill('1');
  await page.getByRole('button', { name: 'Pênaltis', exact: true }).click();
  await page.getByRole('textbox', { name: 'Pênaltis do Lado A' }).fill('4');
  await page.getByRole('textbox', { name: 'Pênaltis do Lado B' }).fill('3');
  await page.getByRole('button', { name: 'Lançar partida' }).click();
  await expect(page.getByText('Partida lançada.')).toBeVisible();

  await aba(page, 'Geral').click();
  const linhaLucas = page.locator('section[aria-labelledby="aba-geral"]:not([hidden]) tbody tr', { hasText: 'Lucas' });
  await expect(linhaLucas).toContainText('1');
  await expect(page.getByText('Pênaltis não entram nos gols.')).toBeVisible();
});

test('partida igual lançada em seguida pede confirmação', async ({ page }) => {
  await criarResenha(page);
  await lancarPartida(page, { ladoA: 'Lucas', ladoB: 'Rafa', golsA: 2, golsB: 1 });
  await preencherPartida(page, { ladoA: 'Lucas', ladoB: 'Rafa', golsA: 2, golsB: 1 });
  await page.getByRole('button', { name: 'Lançar partida' }).click();
  await expect(page.getByText('Partida igual lançada há instantes.')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await aba(page, 'Histórico').click();
  await expect(partidas(page)).toHaveCount(1);
});

test('convite abre a resenha com o histórico e o segundo participante lança', async ({ browser, page }) => {
  const convite = await criarResenha(page);
  await lancarPartida(page, { ladoA: 'Lucas', ladoB: 'Rafa', golsA: 1, golsB: 0 });

  const contexto = await browser.newContext();
  const outro = await contexto.newPage();
  await entrarPorConvite(outro, convite, 'Rafa');
  await aba(outro, 'Histórico').click();
  await expect(partidas(outro)).toHaveCount(1);

  await aba(outro, 'Placar').click();
  await lancarPartida(outro, { ladoA: 'Rafa', ladoB: 'Lucas', golsA: 2, golsB: 2 });

  await aba(page, 'Histórico').click();
  await expect(partidas(page)).toHaveCount(2, { timeout: 15_000 });
  await contexto.close();
});

test('convite reutilizado depois de usado continua válido para outro aparelho até expirar', async ({
  browser,
  page,
}) => {
  const convite = await criarResenha(page);
  const contexto = await browser.newContext();
  const outro = await contexto.newPage();
  await entrarPorConvite(outro, convite, 'Zé');
  const terceiro = await (await browser.newContext()).newPage();
  await entrarPorConvite(terceiro, convite, 'Ana');
  await aba(page, 'Ajustes').click();
  await expect(page.getByText('Zé')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Ana')).toBeVisible({ timeout: 15_000 });
  await contexto.close();
});

test('lista da página inicial mostra a resenha do aparelho', async ({ page }) => {
  await criarResenha(page, 'Quarta da Pelada', 'Lucas');
  await page.goto('/#/');
  await expect(page.getByText('Quarta da Pelada')).toBeVisible();
});

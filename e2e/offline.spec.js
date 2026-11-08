import { expect, test } from '@playwright/test';
import { aba, criarResenha, lancarPartida, partidas, pendentes, sync } from './ajuda.js';

async function aguardarServiceWorker(page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

test('service worker abre o app e a resenha sem rede', async ({ page, context }) => {
  await criarResenha(page, 'Resenha Offline');
  await lancarPartida(page, { ladoA: 'Lucas', ladoB: 'Rafa', golsA: 1, golsB: 0 });
  await aguardarServiceWorker(page);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Nome do Lado A' })).toBeVisible();
  await expect(sync(page)).toHaveAttribute('data-estado', 'offline');
  await aba(page, 'Histórico').click();
  await expect(partidas(page)).toHaveCount(1);
});

test('partida lançada offline fica pendente e sincroniza uma única vez ao reconectar', async ({ page, context }) => {
  await criarResenha(page, 'Fila Offline');
  await aguardarServiceWorker(page);

  await context.setOffline(true);
  await lancarPartida(page, { ladoA: 'Lucas', ladoB: 'Rafa', golsA: 2, golsB: 1 });
  await expect(sync(page)).toHaveAttribute('data-estado', /pendente|offline/);
  await aba(page, 'Histórico').click();
  await expect(partidas(page)).toHaveCount(1);
  await expect(pendentes(page)).toHaveCount(1);

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(sync(page)).toHaveAttribute('data-estado', 'sincronizado', { timeout: 20_000 });
  await expect(pendentes(page)).toHaveCount(0);

  await page.reload();
  await aba(page, 'Histórico').click();
  await expect(partidas(page)).toHaveCount(1);
});

test('duas abas do mesmo aparelho não duplicam a partida pendente', async ({ page, context }) => {
  await criarResenha(page, 'Duas Abas');
  await aguardarServiceWorker(page);
  const url = page.url();

  await context.setOffline(true);
  await lancarPartida(page, { ladoA: 'Lucas', ladoB: 'Rafa', golsA: 5, golsB: 5 });
  const segunda = await context.newPage();
  await segunda.goto(url);
  await expect(segunda.getByRole('combobox', { name: 'Nome do Lado A' })).toBeVisible();

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await segunda.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(sync(page)).toHaveAttribute('data-estado', 'sincronizado', { timeout: 20_000 });

  await page.reload();
  await aba(page, 'Histórico').click();
  await expect(partidas(page)).toHaveCount(1);
});

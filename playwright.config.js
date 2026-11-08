import { defineConfig, devices } from '@playwright/test';

const porta = Number(process.env.E2E_PORTA ?? 8802);
// E2E_URL aponta o mesmo roteiro para um ambiente publicado; sem ela, sobe o servidor local.
const urlExterna = process.env.E2E_URL;
const baseURL = urlExterna ?? `http://127.0.0.1:${porta}`;

const mobile = (largura, altura) => ({
  ...devices['iPhone 14'],
  viewport: { width: largura, height: altura },
  locale: 'pt-BR',
});

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  workers: urlExterna ? 1 : 3,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 7000 },
  reporter: [['list']],
  use: { baseURL, locale: 'pt-BR', timezoneId: 'America/Fortaleza', trace: 'retain-on-failure' },
  projects: [
    { name: 'iphone-375', use: mobile(375, 667) },
    { name: 'iphone-390', use: mobile(390, 844) },
    { name: 'iphone-430', use: mobile(430, 932) },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, locale: 'pt-BR' } },
  ],
  webServer: urlExterna
    ? undefined
    : {
        command: 'node e2e/servidor.js',
        url: `http://127.0.0.1:${porta}/saude`,
        env: { E2E_PORTA: String(porta) },
        reuseExistingServer: false,
        timeout: 15_000,
      },
});

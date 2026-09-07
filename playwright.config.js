import { defineConfig, devices } from '@playwright/test';

import { BASE_URL } from './tests/e2e/support/config.js';

/**
 * Os testes rodam contra a stack REAL que estiver no ar (docker compose ou dev server),
 * com navegador de verdade: login, navegação e baixa de contas ponta a ponta.
 *
 * Alvo padrão: http://localhost:3011 (stack docker local).
 * Para apontar para outro ambiente:
 *   E2E_BASE_URL=http://192.168.3.12:3011 npm run test:e2e
 */
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.js',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

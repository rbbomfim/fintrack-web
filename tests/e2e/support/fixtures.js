// Fixtures da suíte: cliente de API autenticado e página já logada no app.

import { test as base, expect } from '@playwright/test';

import { E2E_PASSWORD, E2E_USERNAME } from './config.js';
import { cleanupPlans, loginE2eUser, resolveApiBaseUrl } from './api.js';

export const test = base.extend({
  apiBaseUrl: async ({}, use) => {
    await use(process.env.E2E_RESOLVED_API_BASE_URL || (await resolveApiBaseUrl()));
  },

  /** Cliente HTTP autenticado como o usuário de teste (monta e desmonta cenário). */
  api: async ({ apiBaseUrl }, use) => {
    await use(await loginE2eUser(apiBaseUrl));
  },

  /**
   * Planos criados pelo teste. Basta dar push no id que a limpeza é automática
   * no fim do teste, mesmo se ele falhar.
   */
  createdPlanIds: async ({ api }, use) => {
    const ids = [];
    await use(ids);
    await cleanupPlans(api, ids);
  },

  /** Página já autenticada na UI, com o app carregado no Dashboard. */
  appPage: async ({ page }, use) => {
    await signIn(page, E2E_USERNAME, E2E_PASSWORD);
    await use(page);
  },
});

export { expect };

/** Faz login pela UI de verdade (formulário + submit), como o usuário faria. */
export async function signIn(page, username, password) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Entrar no sistema' })).toBeVisible();

  await page.getByPlaceholder('admin').fill(username);
  await page.getByPlaceholder('Sua senha').fill(password);
  await page.getByRole('button', { name: 'Acessar' }).click();

  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
}

/** Navega pelo menu lateral. */
export async function goToView(page, label) {
  await page.getByRole('complementary').getByRole('button', { name: label, exact: true }).click();
}

/** Ajusta o seletor de competência da barra superior. */
export async function setCompetence(page, competence) {
  await topBar(page).locator('input[type="month"]').fill(competence);
}

/** Barra superior (título da view, seletor de competência, novo lançamento). */
export function topBar(page) {
  return page.getByTestId('topbar');
}

/** Linha da tabela que contém a descrição informada. */
export function rowFor(page, description) {
  return page.getByRole('row').filter({ hasText: description });
}

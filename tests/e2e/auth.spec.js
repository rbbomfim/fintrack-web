import { expect, goToView, signIn, test, topBar } from './support/fixtures.js';
import { E2E_PASSWORD, E2E_USERNAME } from './support/config.js';

test.describe('Autenticação', () => {
  test('credencial inválida mostra erro e não entra', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('admin').fill(E2E_USERNAME);
    await page.getByPlaceholder('Sua senha').fill('senha-errada-de-proposito');
    await page.getByRole('button', { name: 'Acessar' }).click();

    await expect(page.getByText(/inválid|invalid/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sair' })).toHaveCount(0);
  });

  test('login válido abre o Dashboard com a sessão do usuário', async ({ page }) => {
    await signIn(page, E2E_USERNAME, E2E_PASSWORD);

    await expect(page.getByRole('complementary').getByText(E2E_USERNAME)).toBeVisible();
    await expect(topBar(page)).toContainText('Dashboard');
  });

  test('a sessão sobrevive ao reload da página', async ({ appPage }) => {
    await appPage.reload();
    await expect(appPage.getByRole('button', { name: 'Sair' })).toBeVisible();
    await expect(appPage.getByRole('heading', { name: 'Entrar no sistema' })).toHaveCount(0);
  });

  test('sair encerra a sessão e volta para o login', async ({ appPage }) => {
    await appPage.getByRole('complementary').getByRole('button', { name: 'Sair' }).click();

    await expect(appPage.getByRole('heading', { name: 'Entrar no sistema' })).toBeVisible();

    // E não é só a tela: o token some, então recarregar continua deslogado.
    await appPage.reload();
    await expect(appPage.getByRole('heading', { name: 'Entrar no sistema' })).toBeVisible();
  });

  test('a navegação principal abre todas as telas', async ({ appPage }) => {
    for (const label of ['Movimentações', 'Lançamentos', 'Metas', 'Notificações', 'Dashboard']) {
      await goToView(appPage, label);
      await expect(topBar(appPage)).toContainText(label);
    }
  });
});

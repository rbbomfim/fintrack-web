import { expect, test } from '@playwright/test';


const adminUser = {
  id: 1,
  username: 'admin',
  is_admin: true,
  must_change_password: false,
};

const monthlyTransactions = {
  items: [
    {
      id: 11,
      description: 'Salário',
      competence: '2026-04',
      due_date: '2026-04-05',
      amount: 8500,
      type: 'ENTRADA',
      category: 'Salário',
      is_paid: true,
    },
    {
      id: 12,
      description: 'Financiamento',
      competence: '2026-04',
      due_date: '2026-04-10',
      amount: 2100,
      type: 'FIXO',
      category: 'Moradia',
      is_paid: false,
    },
    {
      id: 13,
      description: 'Supermercado',
      competence: '2026-04',
      due_date: '2026-04-08',
      amount: 720,
      type: 'VARIAVEL',
      category: 'Alimentação',
      is_paid: true,
    },
  ],
};

const projectionResponse = {
  months: [
    { month: '2026-04', income_total: 8500, fixed_total: 2100, variable_total: 720, investment_total: 500, balance_projection: 5180 },
    { month: '2026-05', income_total: 8500, fixed_total: 2100, variable_total: 500, investment_total: 500, balance_projection: 5400 },
  ],
};

const futureResponse = {
  items: [
    { id: 21, description: 'Bônus anual', competence: '2026-05', due_date: '2026-05-20', amount: 2200, type: 'ENTRADA', category: 'Bônus', is_paid: false },
    { id: 22, description: 'Seguro do carro', competence: '2026-07', due_date: '2026-07-15', amount: 1600, type: 'VARIAVEL', category: 'Transporte', is_paid: false },
    { id: 23, description: 'Parcela do carro', competence: '2026-08', due_date: '2026-08-12', amount: 1900, type: 'FIXO', category: 'Transporte', is_paid: false },
  ],
};

const publicCategories = [
  { type: 'ENTRADA', name: 'Salário' },
  { type: 'ENTRADA', name: 'Bônus' },
  { type: 'FIXO', name: 'Moradia' },
  { type: 'VARIAVEL', name: 'Alimentação' },
  { type: 'VARIAVEL', name: 'Transporte' },
  { type: 'INVESTIMENTO', name: 'Reserva' },
];

const adminCategories = [
  { id: 1, type: 'ENTRADA', name: 'Salário', is_active: true },
  { id: 2, type: 'FIXO', name: 'Moradia', is_active: true },
  { id: 3, type: 'VARIAVEL', name: 'Alimentação', is_active: true },
];

const notificationSettings = {
  email_enabled: true,
  scheduler_enabled: true,
  poll_minutes: 60,
  email_from: 'fintrack@empresa.com',
  email_to: 'gestao@empresa.com',
  smtp_host: 'smtp.empresa.com',
  smtp_port: 587,
  smtp_user: 'mailer',
  smtp_password: 'secret',
  smtp_starttls: true,
  smtp_ssl: false,
};

function mockApi(page) {
  return page.route('**/*', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/auth/login') && method === 'POST') {
      await route.fulfill({ json: { access_token: 'test-token', user: adminUser } });
      return;
    }
    if (url.includes('/auth/me')) {
      await route.fulfill({ json: adminUser });
      return;
    }
    if (url.includes('/transactions?month=')) {
      await route.fulfill({ json: monthlyTransactions });
      return;
    }
    if (url.includes('/transactions/projection?')) {
      await route.fulfill({ json: projectionResponse });
      return;
    }
    if (url.includes('/transactions/future?')) {
      await route.fulfill({ json: futureResponse });
      return;
    }
    if (url.endsWith('/categories')) {
      await route.fulfill({ json: publicCategories });
      return;
    }
    if (url.endsWith('/admin/users')) {
      await route.fulfill({ json: [adminUser] });
      return;
    }
    if (url.endsWith('/admin/categories')) {
      await route.fulfill({ json: adminCategories });
      return;
    }
    if (url.endsWith('/admin/notification-settings')) {
      await route.fulfill({ json: notificationSettings });
      return;
    }
    if (url.endsWith('/transactions') && method === 'POST') {
      await route.fulfill({ json: { id: 99 } });
      return;
    }
    if (url.includes('/transactions/') && method === 'PATCH') {
      await route.fulfill({ json: { ok: true } });
      return;
    }
    if (url.includes('/transactions/') && method === 'DELETE') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    if (url.endsWith('/admin/notifications/dispatch') && method === 'POST') {
      await route.fulfill({ json: { notifications_sent: 2, notifications_skipped: 1 } });
      return;
    }
    if (url.endsWith('/admin/notification-settings') && method === 'PUT') {
      await route.fulfill({ json: notificationSettings });
      return;
    }
    if (url.endsWith('/admin/users') && method === 'POST') {
      await route.fulfill({ json: { id: 2, username: 'novo' } });
      return;
    }

    await route.continue();
  });
}


test.beforeEach(async ({ page }) => {
  await mockApi(page);
});


test('renderiza dashboard apos login e permite abrir modal de lancamento', async ({ page }) => {
  await page.goto('/');

  await page.getByPlaceholder('admin').fill('admin');
  await page.getByPlaceholder('Sua senha').fill('admin123');
  await page.getByRole('button', { name: 'Acessar' }).click();

  await expect(page.getByText('Competência e fluxo de caixa')).toBeVisible();
  await expect(page.locator('.metric-card').filter({ hasText: 'Entradas' }).locator('.metric-value')).toContainText('R$');
  await expect(page.getByRole('button', { name: 'Novo lançamento' })).toBeVisible();

  await page.getByRole('button', { name: 'Novo lançamento' }).click();
  await expect(page.getByText('Criar ou editar item')).toBeVisible();

  await page.getByPlaceholder('Ex: Parcela da casa').fill('Curso de inglês');
  await page.getByPlaceholder('0,00').fill('12345');
  await page.getByRole('button', { name: 'Salvar lançamento' }).click();

  await expect(page.getByText('Lançamento criado')).toBeVisible();
});


test('navega nas areas administrativas principais', async ({ page }) => {
  await page.goto('/');

  await page.getByPlaceholder('admin').fill('admin');
  await page.getByPlaceholder('Sua senha').fill('admin123');
  await page.getByRole('button', { name: 'Acessar' }).click();

  await page.getByRole('button', { name: 'Categorias' }).click();
  await expect(page.getByText('Nome da categoria')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Moradia' }).last()).toBeVisible();

  await page.getByRole('button', { name: 'Notificações' }).click();
  await expect(page.getByText('Configuração de notificações')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Disparar agora' })).toBeVisible();
});
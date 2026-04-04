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
    const corsHeaders = {
      'access-control-allow-origin': 'http://127.0.0.1:3011',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': 'Content-Type, Authorization',
    };

    const fulfillJson = async (json, status = 200) => {
      await route.fulfill({ status, headers: corsHeaders, json });
    };

    if (url.endsWith('/env.js')) {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/javascript' },
        body: 'window.__FINTRACK_CONFIG__ = { API_BASE_URL: window.location.origin };',
      });
      return;
    }

    if (url.startsWith('http://localhost:8011') && method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
      return;
    }

    if (url.includes('/auth/login') && method === 'POST') {
      await fulfillJson({ access_token: 'test-token', user: adminUser });
      return;
    }
    if (url.includes('/auth/me')) {
      await fulfillJson(adminUser);
      return;
    }
    if (url.includes('/transactions?month=')) {
      await fulfillJson(monthlyTransactions);
      return;
    }
    if (url.includes('/transactions/projection?')) {
      await fulfillJson(projectionResponse);
      return;
    }
    if (url.includes('/transactions/future?')) {
      await fulfillJson(futureResponse);
      return;
    }
    if (url.endsWith('/admin/categories')) {
      await fulfillJson(adminCategories);
      return;
    }
    if (url.endsWith('/categories')) {
      await fulfillJson(publicCategories);
      return;
    }
    if (url.endsWith('/admin/users')) {
      await fulfillJson([adminUser]);
      return;
    }
    if (url.endsWith('/auth/notification-settings') && method === 'GET') {
      await fulfillJson(notificationSettings);
      return;
    }
    if (url.endsWith('/transactions') && method === 'POST') {
      await fulfillJson({ id: 99 });
      return;
    }
    if (url.includes('/transactions/') && method === 'PATCH') {
      await fulfillJson({ ok: true });
      return;
    }
    if (url.includes('/transactions/') && method === 'DELETE') {
      await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
      return;
    }
    if (url.endsWith('/auth/notifications/dispatch') && method === 'POST') {
      await fulfillJson({ notifications_sent: 2, notifications_skipped: 1, checked_transactions: 3, channels: ['email'], reason: null });
      return;
    }
    if (url.endsWith('/auth/notification-settings') && method === 'PUT') {
      await fulfillJson(notificationSettings);
      return;
    }
    if (url.endsWith('/admin/users') && method === 'POST') {
      await fulfillJson({ id: 2, username: 'novo' });
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
  await expect(page.locator('body')).toContainText('Entradas');
  await expect(page.locator('body')).toContainText('R$');
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

  await expect(page.getByRole('button', { name: 'Categorias' })).toBeVisible();
  await page.getByRole('button', { name: 'Categorias' }).click();
  await expect(page.getByText('Nome da categoria')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Moradia' }).last()).toBeVisible();

  await page.getByRole('button', { name: 'Minhas notificações' }).click();
  await expect(page.getByText('Configuração de notificações')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Disparar agora' })).toBeVisible();
});
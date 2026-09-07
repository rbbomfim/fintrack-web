// Cliente HTTP mínimo da API, usado para preparar/limpar cenário dos testes.
// A UI continua sendo exercitada pelo navegador; a API só monta o palco.

import {
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  BASE_URL,
  E2E_PASSWORD,
  E2E_USERNAME,
} from './config.js';

/**
 * Descobre a URL da API do jeito que o navegador descobre: lendo o /env.js
 * servido pelo frontend. Assim os testes validam a MESMA configuração que o
 * usuário final recebe (foi exatamente isso que quebrou no ERR_CONNECTION_REFUSED).
 */
export async function resolveApiConfig() {
  if (process.env.E2E_API_BASE_URL) {
    const forced = process.env.E2E_API_BASE_URL.replace(/\/$/, '');
    return { raw: forced, absolute: forced, sameOrigin: false };
  }

  const response = await fetch(`${BASE_URL}/env.js`);
  if (!response.ok) {
    throw new Error(`Não consegui ler ${BASE_URL}/env.js (HTTP ${response.status})`);
  }
  const source = await response.text();
  const match = source.match(/API_BASE_URL:\s*"([^"]+)"/);
  if (!match) {
    throw new Error(`env.js não expõe API_BASE_URL. Conteúdo recebido:\n${source}`);
  }

  const raw = match[1].replace(/\/$/, '');
  // Modo same-origin: o env.js publica um caminho relativo (ex.: "/api") e o
  // nginx do frontend repassa para o backend. Não existe requisição cross-origin.
  const sameOrigin = raw.startsWith('/');
  return { raw, absolute: sameOrigin ? `${BASE_URL}${raw}` : raw, sameOrigin };
}

export async function resolveApiBaseUrl() {
  return (await resolveApiConfig()).absolute;
}

export class ApiClient {
  constructor(baseUrl, token = null) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async request(method, path, body) {
    const headers = {};
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (response.status === 204) return null;

    const text = await response.text();
    const data = text && response.headers.get('content-type')?.includes('application/json')
      ? JSON.parse(text)
      : text;

    if (!response.ok) {
      const detail = typeof data === 'string' ? data : JSON.stringify(data.detail ?? data);
      const error = new Error(`${method} ${path} -> HTTP ${response.status}: ${detail}`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  get = (path) => this.request('GET', path);
  post = (path, body) => this.request('POST', path, body);
  patch = (path, body) => this.request('PATCH', path, body);
  delete = (path) => this.request('DELETE', path);
}

export async function login(baseUrl, username, password) {
  const anon = new ApiClient(baseUrl);
  const result = await anon.post('/auth/login', { username, password });
  return { client: new ApiClient(baseUrl, result.access_token), result };
}

export async function loginAdmin(baseUrl) {
  const { client } = await login(baseUrl, ADMIN_USERNAME, ADMIN_PASSWORD);
  return client;
}

export async function loginE2eUser(baseUrl) {
  const { client } = await login(baseUrl, E2E_USERNAME, E2E_PASSWORD);
  return client;
}

/**
 * Garante que o usuário descartável dos testes existe e já está com a senha
 * definitiva (novos usuários nascem com must_change_password=true).
 */
export async function ensureE2eUser(baseUrl) {
  try {
    await login(baseUrl, E2E_USERNAME, E2E_PASSWORD);
    return;
  } catch (error) {
    if (error.status !== 401) throw error;
  }

  const admin = await loginAdmin(baseUrl);
  const temporaryPassword = `${E2E_PASSWORD}_tmp`;
  try {
    await admin.post('/admin/users', {
      username: E2E_USERNAME,
      password: temporaryPassword,
      is_admin: false,
    });
  } catch (error) {
    if (error.status !== 409) throw error;
    throw new Error(
      `O usuário "${E2E_USERNAME}" já existe com outra senha. ` +
        `Ajuste E2E_PASSWORD ou remova o usuário no banco.`,
    );
  }

  const { client } = await login(baseUrl, E2E_USERNAME, temporaryPassword);
  await client.post('/auth/change-password', {
    current_password: temporaryPassword,
    new_password: E2E_PASSWORD,
  });
}

/** Escolhe uma categoria ativa do tipo pedido (as categorias são globais/seed). */
export async function pickCategoryId(client, type) {
  const categories = await client.get(`/categories?type=${type}`);
  const active = categories.filter((category) => category.is_active);
  if (!active.length) throw new Error(`Nenhuma categoria ativa do tipo ${type}.`);
  return active[0].id;
}

export async function createPlan(client, overrides) {
  const categoryId = overrides.category_id || (await pickCategoryId(client, overrides.type));
  return client.post('/plans', {
    recurrence: 'MENSAL',
    expected_amount: '100.00',
    due_day: 10,
    payment_method: 'CONTA',
    ...overrides,
    category_id: categoryId,
  });
}

export async function listEntries(client, competence) {
  return client.get(`/entries?competence=${competence}`);
}

export async function findEntryByDescription(client, competence, description) {
  const entries = await listEntries(client, competence);
  return entries.find((entry) => entry.plan.description === description) || null;
}

/**
 * Limpeza best-effort. A API impede apagar plano recorrente ou com baixa já feita
 * (histórico imutável — é o comportamento correto), então planos MENSAIS são
 * encerrados e os ÚNICOS sem baixa são removidos. O resíduo fica no usuário
 * descartável, nunca no usuário real.
 */
export async function cleanupPlans(client, planIds) {
  for (const planId of planIds) {
    try {
      await client.delete(`/plans/${planId}`);
    } catch {
      try {
        const plan = await client.get(`/plans/${planId}`);
        await client.patch(`/plans/${planId}/close`, { end_competence: plan.start_competence });
      } catch {
        /* resíduo aceitável no usuário de teste */
      }
    }
  }
}

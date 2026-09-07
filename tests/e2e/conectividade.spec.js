// Regressões dos dois bugs de conectividade que já derrubaram o app:
//
//   1. "auth/login net::ERR_CONNECTION_REFUSED" — o env.js apontava para um
//      host/porta onde a API não estava publicada.
//   2. "Method PATCH is not allowed by Access-Control-Allow-Methods" — o preflight
//      da baixa não chegava íntegro ao navegador.
//
// O teste decisivo é o último: um PATCH real, disparado de dentro da página,
// precisa chegar à API e voltar com status HTTP. Falha de rede/CORS não passa.

import { expect, test } from './support/fixtures.js';
import { BASE_URL } from './support/config.js';
import { resolveApiConfig } from './support/api.js';

test.describe('Conectividade frontend -> API', () => {
  test('env.js publica um destino de API utilizável', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/env.js`);
    expect(response.ok()).toBeTruthy();

    const source = await response.text();
    const match = source.match(/API_BASE_URL:\s*"([^"]+)"/);
    expect(match, `env.js sem API_BASE_URL:\n${source}`).not.toBeNull();

    // Vale um caminho same-origin ("/api") ou uma URL absoluta (modo direto).
    // O que não vale é vazio ou placeholder não substituído.
    expect(match[1]).toMatch(/^(\/[^/]|https?:\/\/.+)/);
    expect(match[1]).not.toContain('${');
  });

  test('a API configurada responde /health', async ({ request, apiBaseUrl }) => {
    const response = await request.get(`${apiBaseUrl}/health`);
    expect(
      response.ok(),
      `A API ${apiBaseUrl} não respondeu. É esse o ERR_CONNECTION_REFUSED do navegador.`,
    ).toBeTruthy();
  });

  test('o navegador carrega o app sem erro de rede', async ({ page }) => {
    const failures = [];
    page.on('requestfailed', (req) => failures.push(`${req.url()} :: ${req.failure()?.errorText}`));

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Entrar no sistema' })).toBeVisible();

    expect(failures, `Requisições falharam:\n${failures.join('\n')}`).toHaveLength(0);
  });

  test('em modo direto, a API libera CORS para a origem do frontend', async ({ request }) => {
    const { absolute, sameOrigin } = await resolveApiConfig();
    test.skip(sameOrigin, 'Modo same-origin: não existe cross-origin para liberar.');

    const origin = new URL(BASE_URL).origin;
    const response = await request.fetch(`${absolute}/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });

    expect(response.status(), 'preflight CORS recusado').toBeLessThan(400);
    expect(
      response.headers()['access-control-allow-origin'],
      `Inclua ${origin} em BACKEND_CORS_ORIGINS`,
    ).toBe(origin);
  });

  test('um PATCH disparado da página chega à API (a baixa não pode ser bloqueada)', async ({
    page,
  }) => {
    const { raw } = await resolveApiConfig();

    await page.goto('/');
    const resultado = await page.evaluate(async (apiBase) => {
      // Token inválido de propósito: aqui interessa a requisição CHEGAR ao servidor.
      // PATCH + Authorization + JSON é o caso mais exigente (sempre gera preflight
      // quando é cross-origin), e é exatamente o que a tela de baixa dispara.
      try {
        const r = await fetch(`${apiBase}/entries/00000000-0000-0000-0000-000000000000`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer invalido' },
          body: JSON.stringify({ status: 'PAGO', amount: '1.00' }),
        });
        return { ok: true, status: r.status };
      } catch (error) {
        return { ok: false, message: error.message };
      }
    }, raw);

    expect(
      resultado.ok,
      `O PATCH não chegou à API (${resultado.message}). ` +
        'É esse o bug da baixa: falha de rede/CORS antes de sair do navegador.',
    ).toBeTruthy();
    // 401 pelo token falso é o esperado: significa que a requisição foi processada.
    expect(resultado.status).toBe(401);
  });
});

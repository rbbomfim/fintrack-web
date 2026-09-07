// Roda uma vez antes da suíte: confere que a stack está no ar e provisiona
// o usuário descartável usado pelos testes.

import { BASE_URL, E2E_USERNAME } from './support/config.js';
import { ensureE2eUser, resolveApiBaseUrl } from './support/api.js';

async function reachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return response.ok;
  } catch (error) {
    return error.message;
  }
}

export default async function globalSetup() {
  const frontend = await reachable(`${BASE_URL}/index.html`);
  if (frontend !== true) {
    throw new Error(
      `Frontend inacessível em ${BASE_URL}.\n` +
        `Suba a stack (docker compose up -d) ou aponte E2E_BASE_URL para o ambiente certo.\n` +
        `Detalhe: ${frontend}`,
    );
  }

  const apiBaseUrl = await resolveApiBaseUrl();
  const api = await reachable(`${apiBaseUrl}/health`);
  if (api !== true) {
    throw new Error(
      `O frontend em ${BASE_URL} aponta para a API ${apiBaseUrl}, mas ela não responde.\n` +
        `Foi exatamente esse o erro "ERR_CONNECTION_REFUSED" no navegador.\n` +
        `Corrija PUBLIC_API_BASE_URL no .env da stack ou publique a porta da API.\n` +
        `Detalhe: ${api}`,
    );
  }

  await ensureE2eUser(apiBaseUrl);

  process.env.E2E_RESOLVED_API_BASE_URL = apiBaseUrl;
  console.log(`[e2e] frontend ${BASE_URL} -> api ${apiBaseUrl} | usuário ${E2E_USERNAME} pronto`);
}

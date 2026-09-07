// Configuração compartilhada da suíte e2e.
//
// Tudo é sobrescrevível por variável de ambiente para que a mesma suíte rode
// contra o docker local, contra o dev server do vite ou contra o servidor do Portainer.

export const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3011';

// Credenciais do admin (necessárias apenas para provisionar o usuário de teste).
export const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME || 'admin';
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'admin123';

// Usuário dedicado aos testes. Os testes NUNCA escrevem dados no usuário real:
// todo plano/lançamento criado pertence a este usuário descartável.
export const E2E_USERNAME = process.env.E2E_USERNAME || 'e2e_bot';
export const E2E_PASSWORD = process.env.E2E_PASSWORD || 'e2e_bot_123';

// Competência-sandbox: bem no futuro, para não sujar nem influenciar o mês corrente.
export const SANDBOX_COMPETENCE = '2035-01';
export const SANDBOX_NEXT_COMPETENCE = '2035-02';

/** Tag única por execução, usada nas descrições para isolar as asserções. */
export function runTag() {
  return `E2E-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
}

/** Mesma formatação de moeda usada pelo app (pt-BR / BRL). */
export function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
}

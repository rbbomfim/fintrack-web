// Utilitários de formatação e competência.

export function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

export function currentCompetence() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

export function parseCompetence(competence) {
  const [year, month] = competence.split('-').map(Number);
  return { year, month };
}

export function formatCompetence(competence) {
  const { year, month } = parseCompetence(competence);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1, 1),
  );
}

export function shiftCompetence(competence, delta) {
  const { year, month } = parseCompetence(competence);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function normalizeAmount(value) {
  const normalized = String(value || '').replace(/\s/g, '').replace('R$', '').replace(',', '.');
  const number = Number(normalized);
  if (!Number.isFinite(number) || number <= 0) throw new Error('Informe um valor válido');
  return number.toFixed(2);
}

export function parseDateOnly(value) {
  const [year, month, day] = value.split('-').map(Number);
  const result = new Date(year, month - 1, day);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function formatDate(value) {
  if (!value) return '--';
  return parseDateOnly(value).toLocaleDateString('pt-BR');
}

export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((parseDateOnly(dateStr) - today) / 86400000);
}

export const TYPE_LABELS = {
  FIXO: 'Custo fixo',
  VARIAVEL: 'Custo variável',
  RECEITA: 'Receita',
  INVESTIMENTO: 'Investimento',
};

export const PAYMENT_LABELS = {
  CONTA: 'Conta / caixa',
  CARTAO: 'Cartão de crédito',
  PIX: 'Pix',
  OUTRO: 'Outro',
  CARTAO_CREDITO: 'Cartão de crédito', // legado
};

export function paymentLabel(method) {
  return PAYMENT_LABELS[method] || method || 'Conta / caixa';
}

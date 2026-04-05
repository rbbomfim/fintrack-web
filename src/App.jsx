import { useEffect, useMemo, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import {
  Bell,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  OctagonMinus,
  Pencil,
  ShieldCheck,
  Target,
  Tags,
  Trash2,
  Users,
  Wallet,
  X,
} from 'lucide-react';


const API_BASE_URL = (window.__FINTRACK_CONFIG__ && window.__FINTRACK_CONFIG__.API_BASE_URL) || 'http://localhost:8000';
const STORAGE_KEY = 'fintrack_auth';
const TYPE_OPTIONS = [
  { value: 'ENTRADA', label: 'Entrada' },
  { value: 'FIXO', label: 'Custo fixo' },
  { value: 'VARIAVEL', label: 'Custo variável' },
  { value: 'INVESTIMENTO', label: 'Investimento' },
];
const TRANSACTION_FILTER_OPTIONS = [
  { value: 'ALL', label: 'Todos' },
  { value: 'ENTRADA', label: 'Entrada' },
  { value: 'FIXO', label: 'Custo fixo' },
  { value: 'VARIAVEL', label: 'Custo variável' },
  { value: 'INVESTIMENTO', label: 'Investimento' },
  { value: 'LINKED_INVESTMENTS', label: 'Investimentos vinculados a metas' },
];
const TYPE_LABELS = {
  ENTRADA: 'Receita',
  FIXO: 'Custo fixo',
  VARIAVEL: 'Custo variável',
  INVESTIMENTO: 'Investimento',
};
const ADMIN_VIEWS = ['ADMIN_USERS', 'ADMIN_CATEGORIES'];
const CHART_COLORS = ['#38bdf8', '#34d399', '#f97316', '#facc15', '#fb7185', '#a78bfa', '#94a3b8'];
const EXPENSE_RED_SCALE = ['#7f1d1d', '#991b1b', '#b91c1c', '#dc2626', '#ef4444', '#f87171'];
const SIDEBAR_STORAGE_KEY = 'fintrack_sidebar_collapsed';
const DEFAULT_INVESTMENT_FLOOR_PERCENT = 20;
const VIEW_META = {
  Dashboard: { label: 'Dashboard', icon: LayoutDashboard },
  GOALS: { label: 'Metas', icon: Target },
  NOTIFICATIONS: { label: 'Minhas notificações', icon: Bell },
  ADMIN_USERS: { label: 'Gestão de usuários', icon: Users },
  ADMIN_CATEGORIES: { label: 'Categorias', icon: Tags },
};


function getStoredSession() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { token: null, user: null };
  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return { token: null, user: null };
  }
}


function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}


function formatCurrencyInput(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(digits) / 100);
}


function normalizeCurrencyInput(value) {
  const normalized = String(value || '').replace(/\s/g, '').replace('R$', '').replace(/\./g, '').replace(',', '.');
  const numericValue = Number(normalized);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    throw new Error('Informe um valor válido');
  }
  return numericValue.toFixed(2);
}


function formatMonthLabel(value) {
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
}


function parseDateOnly(value) {
  const [year, month, day] = value.split('-').map(Number);
  const result = new Date(year, month - 1, day);
  result.setHours(0, 0, 0, 0);
  return result;
}


function getStatusInfo(item) {
  if (item.type === 'ENTRADA') return { label: 'ENTRADA', className: 'status-success' };
  if (item.type === 'INVESTIMENTO') return { label: 'APLICADO', className: 'status-success' };
  if (item.is_paid) return { label: 'LIQUIDADO', className: 'status-success' };
  if (!item.due_date) return { label: 'PENDENTE', className: 'status-neutral' };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = parseDateOnly(item.due_date);
  const diffDays = Math.ceil((dueDate - today) / 86400000);
  if (diffDays < 0) return { label: 'VENCIDO', className: 'status-danger' };
  if (diffDays === 0) return { label: 'VENCE HOJE', className: 'status-today' };
  if (diffDays <= 3) return { label: `FALTAM ${diffDays} DIAS`, className: 'status-warning' };
  return { label: 'PENDENTE', className: 'status-neutral' };
}


function getStatusSortValue(item) {
  if (item.type === 'ENTRADA') return 5;
  if (item.type === 'INVESTIMENTO') return 4;
  if (item.is_paid) return 4;
  if (!item.due_date) return 3;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = parseDateOnly(item.due_date);
  const diffDays = Math.ceil((dueDate - today) / 86400000);

  if (diffDays < 0) return 0;
  if (diffDays === 0) return 1;
  if (diffDays <= 3) return 2;
  return 3;
}


function compareTransactions(left, right, sortKey) {
  if (sortKey === 'due_date') {
    const leftValue = left.due_date || '9999-12-31';
    const rightValue = right.due_date || '9999-12-31';
    return leftValue.localeCompare(rightValue) || left.description.localeCompare(right.description);
  }

  if (sortKey === 'category') {
    return left.category.localeCompare(right.category) || (left.due_date || '').localeCompare(right.due_date || '');
  }

  if (sortKey === 'amount') {
    return Number(left.amount) - Number(right.amount) || left.description.localeCompare(right.description);
  }

  if (sortKey === 'status') {
    return getStatusSortValue(left) - getStatusSortValue(right) || (left.due_date || '').localeCompare(right.due_date || '');
  }

  return left.description.localeCompare(right.description);
}


function buildAlerts(items) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return items
    .filter((item) => item.due_date && !item.is_paid && item.type !== 'ENTRADA')
    .map((item) => {
      const dueDate = parseDateOnly(item.due_date);
      const diffDays = Math.ceil((dueDate - today) / 86400000);
      if (diffDays > 3) return null;

      let level = 'warning';
      let badge = 'Faltam 3 dias';
      let message = `${item.description} vence em ${item.due_date}.`;

      if (diffDays < 0) {
        level = 'danger';
        badge = 'Vencido';
        message = `${item.description} venceu em ${item.due_date} e segue pendente.`;
      } else if (diffDays === 0) {
        level = 'today';
        badge = 'Vence hoje';
        message = `${item.description} vence hoje e precisa de atenção imediata.`;
      } else if (diffDays < 3) {
        badge = `Faltam ${diffDays} dias`;
        message = `${item.description} vence em ${diffDays} dias, na data ${item.due_date}.`;
      }

      return {
        id: item.id,
        title: item.description,
        level,
        badge,
        message,
        dueDate: item.due_date,
        category: item.category,
        amount: Number(item.amount),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate));
}


function defaultTransactionForm(month) {
  return {
    id: '',
    planId: '',
    goalId: '',
    description: '',
    competence: month,
    dueDate: '',
    amount: '',
    type: 'ENTRADA',
    category: '',
    isPaid: false,
    isRecurring: true,
    applyToPlan: false,
  };
}


function emptyNotificationSettings() {
  return {
    email_enabled: false,
    scheduler_enabled: false,
    poll_minutes: 60,
    email_from: '',
    email_to: '',
    smtp_host: '',
    smtp_port: 587,
    smtp_user: '',
    smtp_password: '',
    smtp_starttls: true,
    smtp_ssl: false,
  };
}


function emptyFinancialPreferences() {
  return {
    investment_floor_percent: DEFAULT_INVESTMENT_FLOOR_PERCENT,
  };
}


function emptyCategoryAnalytics() {
  return {
    months: [],
    categories: [],
    total_cost: '0.00',
  };
}


function useMediaQuery(query) {
  const getMatches = () => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(getMatches);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const mediaQuery = window.matchMedia(query);
    const handleChange = (event) => setMatches(event.matches);

    setMatches(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
}


function buildExpenseCategorySummaryFromTransactions(transactions, topLimit = 5) {
  const ranking = transactions
    .filter((item) => item.type === 'FIXO' || item.type === 'VARIAVEL')
    .reduce((accumulator, item) => {
      const next = new Map(accumulator);
      next.set(item.category, (next.get(item.category) || 0) + Number(item.amount || 0));
      return next;
    }, new Map());

  const entries = Array.from(ranking.entries())
    .map(([label, value]) => ({ label, value }))
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value);

  const topEntries = entries.slice(0, topLimit);
  const otherTotal = entries.slice(topLimit).reduce((sum, item) => sum + item.value, 0);

  if (otherTotal > 0) {
    topEntries.push({ label: 'Outras', value: otherTotal });
  }

  return topEntries;
}


function buildTopCategorySeries(categories, topLimit = 5) {
  const rankedSeries = categories
    .map((series) => ({
      category: series.category,
      total: series.months.reduce((sum, item) => sum + Number(item.total || 0), 0),
      months: series.months.map((item) => ({ month: item.month, total: Number(item.total || 0) })),
    }))
    .filter((series) => series.total > 0)
    .sort((left, right) => right.total - left.total);

  const topSeries = rankedSeries.slice(0, topLimit);
  const remainingSeries = rankedSeries.slice(topLimit);

  if (!remainingSeries.length) {
    return topSeries;
  }

  const totalsByMonth = remainingSeries.reduce((accumulator, series) => {
    series.months.forEach((item) => {
      accumulator.set(item.month, (accumulator.get(item.month) || 0) + Number(item.total || 0));
    });
    return accumulator;
  }, new Map());

  topSeries.push({
    category: 'Outras',
    total: remainingSeries.reduce((sum, item) => sum + item.total, 0),
    months: Array.from(totalsByMonth.entries())
      .map(([month, total]) => ({ month, total }))
      .sort((left, right) => left.month.localeCompare(right.month)),
  });

  return topSeries;
}


function emptyGoalForm(month) {
  return {
    id: '',
    title: '',
    targetAmount: '',
    startMonth: month,
    targetMonth: month,
    isActive: true,
  };
}


function goalStatusPresentation(status) {
  if (status === 'concluida') return { label: 'Concluída', className: 'status-success' };
  if (status === 'no_prazo') return { label: 'Dentro da meta', className: 'status-success' };
  return { label: 'Abaixo da meta', className: 'status-danger' };
}


async function requestApi(token, path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (response.status === 204) return null;

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const message = typeof payload === 'string' ? payload : payload.detail || 'Erro inesperado';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return payload;
}


function ChartsSection({ hidden, income, totalExpenses, paidExpenses, investments, projection, viewMode, transactions, investmentFloorPercent }) {
  const primaryChartRef = useRef(null);
  const compositionRef = useRef(null);
  const isPhoneViewport = useMediaQuery('(max-width: 640px)');
  const isCompactViewport = useMediaQuery('(max-width: 1366px)');
  const isProjection = viewMode === 'projecao' && projection.length > 0;
  const pendingExpenses = Math.max(totalExpenses - paidExpenses, 0);
  const projectedBalance = income - totalExpenses - investments;
  const availableToInvest = income - totalExpenses;
  const availableToInvestPercent = income > 0 ? (availableToInvest / income) * 100 : 0;
  const minimumInvestmentTarget = income * (investmentFloorPercent / 100);
  const investmentFloorGap = availableToInvest - minimumInvestmentTarget;
  const isInvestmentFloorAvailable = income > 0 ? availableToInvest >= minimumInvestmentTarget : false;
  const projectionMonthsBelowTarget = projection.filter((item) => {
    const monthIncome = Number(item.income_total || 0);
    if (monthIncome <= 0) return false;
    const monthAvailable = monthIncome - Number(item.fixed_total || 0) - Number(item.variable_total || 0);
    return monthAvailable < monthIncome * (investmentFloorPercent / 100);
  }).length;
  const paymentPercent = income > 0 ? (paidExpenses / income) * 100 : 0;
  const pendingPercent = income > 0 ? (pendingExpenses / income) * 100 : 0;
  const investmentPercent = income > 0 ? (investments / income) * 100 : 0;
  const committedPercent = paymentPercent + pendingPercent + investmentPercent;
  const freePercent = Math.max(0, 100 - committedPercent);
  const deficitPercent = Math.max(0, committedPercent - 100);
  const analysisCards = isProjection
    ? [
      {
        label: 'Saldo final projetado',
        value: formatCurrency(projection.at(-1)?.balance_projection || 0),
        tone: Number(projection.at(-1)?.balance_projection || 0) >= 0 ? 'text-slate-50' : 'text-rose-300',
      },
      {
        label: 'Pico de saídas',
        value: formatCurrency(Math.max(...projection.map((item) => Number(item.fixed_total) + Number(item.variable_total)), 0)),
        tone: 'text-rose-300',
      },
      {
        label: 'Média de investimentos',
        value: formatCurrency(projection.length ? projection.reduce((sum, item) => sum + Number(item.investment_total), 0) / projection.length : 0),
        tone: 'text-cyan-300',
      },
      {
        label: 'Meses no azul',
        value: `${projection.filter((item) => Number(item.balance_projection) >= 0).length}/${projection.length}`,
        tone: 'text-emerald-300',
      },
      {
        label: 'Meses com piso comprometido',
        value: `${projectionMonthsBelowTarget}/${projection.length}`,
        tone: projectionMonthsBelowTarget ? 'text-amber-200' : 'text-emerald-300',
      },
    ]
    : [
      {
        label: 'Pagamentos realizados',
        value: `${paymentPercent.toFixed(1)}%`,
        tone: 'text-rose-300',
      },
      {
        label: 'Saídas ainda previstas',
        value: `${pendingPercent.toFixed(1)}%`,
        tone: 'text-amber-200',
      },
      {
        label: 'Comprometimento total',
        value: `${committedPercent.toFixed(1)}%`,
        tone: committedPercent <= 100 ? 'text-cyan-300' : 'text-rose-300',
      },
      {
        label: projectedBalance >= 0 ? 'Saldo sobre a receita' : 'Déficit sobre a receita',
        value: `${(income > 0 ? (Math.abs(projectedBalance) / income) * 100 : 0).toFixed(1)}%`,
        tone: projectedBalance >= 0 ? 'text-emerald-300' : 'text-rose-300',
      },
      {
        label: 'Disponível para investir',
        value: income > 0 ? `${availableToInvestPercent.toFixed(1)}% / ${investmentFloorPercent}%` : '--',
        tone: income <= 0 ? 'text-slate-50' : isInvestmentFloorAvailable ? 'text-emerald-300' : 'text-amber-200',
      },
    ];

  useEffect(() => {
    if (hidden || !primaryChartRef.current || !compositionRef.current) return undefined;

    const labels = isProjection ? projection.map((item) => item.month) : ['Mês atual'];
    const incomeData = isProjection ? projection.map((item) => Number(item.income_total)) : [income];
    const expenseData = isProjection ? projection.map((item) => Number(item.fixed_total) + Number(item.variable_total)) : [totalExpenses];
    const investmentData = isProjection ? projection.map((item) => Number(item.investment_total)) : [investments];
    const investmentTargetData = isProjection ? projection.map((item) => Number(item.income_total || 0) * (investmentFloorPercent / 100)) : [minimumInvestmentTarget];
    const balanceData = isProjection ? projection.map((item) => Number(item.balance_projection)) : [projectedBalance];

    const primaryChart = isProjection
      ? new Chart(primaryChartRef.current, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Entradas',
              data: incomeData,
              borderColor: '#34d399',
              backgroundColor: 'rgba(52, 211, 153, 0.14)',
              tension: 0.35,
              fill: true,
              pointRadius: 3,
              borderWidth: 2,
            },
            {
              label: 'Saídas',
              data: expenseData,
              borderColor: '#fb7185',
              backgroundColor: 'rgba(251, 113, 133, 0.1)',
              tension: 0.35,
              fill: true,
              pointRadius: 3,
              borderWidth: 2,
            },
            {
              label: 'Investimentos',
              data: investmentData,
              borderColor: '#38bdf8',
              backgroundColor: 'rgba(56, 189, 248, 0.08)',
              tension: 0.35,
              fill: true,
              pointRadius: 3,
              borderWidth: 2,
            },
            {
              label: `Piso mínimo para investir (${investmentFloorPercent}%)`,
              data: investmentTargetData,
              borderColor: '#facc15',
              backgroundColor: 'rgba(250, 204, 21, 0.08)',
              tension: 0.2,
              fill: false,
              pointRadius: 0,
              pointHoverRadius: 0,
              borderDash: [8, 6],
              borderWidth: 2,
            },
            {
              label: 'Saldo projetado',
              data: balanceData,
              borderColor: '#f8fafc',
              backgroundColor: 'rgba(248, 250, 252, 0.1)',
              tension: 0.35,
              fill: false,
              pointRadius: 3,
              pointHoverRadius: 4,
              borderWidth: 2,
            },
          ],
        },
        options: {
          maintainAspectRatio: false,
          responsive: true,
          layout: { padding: { top: 4, right: 0, bottom: 0, left: 0 } },
          plugins: {
            legend: {
              labels: {
                color: '#cbd5e1',
                boxWidth: isPhoneViewport ? 8 : 12,
                font: { size: isPhoneViewport ? 10 : isCompactViewport ? 11 : 12 },
                padding: isPhoneViewport ? 10 : 14,
              },
            },
            tooltip: {
              callbacks: {
                label(context) {
                  return `${context.dataset.label}: ${formatCurrency(context.raw)}`;
                },
              },
            },
          },
          scales: {
            y: {
              ticks: { color: '#64748b', font: { size: isPhoneViewport ? 10 : 11 } },
              grid: { color: 'rgba(148, 163, 184, 0.1)' },
            },
            x: {
              ticks: { color: '#64748b', font: { size: isPhoneViewport ? 10 : 11 }, autoSkip: true, maxTicksLimit: isPhoneViewport ? 4 : 6 },
              grid: { display: false },
            },
          },
        },
      })
      : new Chart(primaryChartRef.current, {
        type: 'bar',
        data: {
          labels: ['Receita do mês'],
          datasets: [
            {
              label: 'Pagamentos',
              data: [paymentPercent],
              backgroundColor: '#fb7185',
              borderRadius: 4,
              borderSkipped: false,
              stack: 'cashflow',
            },
            {
              label: 'A pagar',
              data: [pendingPercent],
              backgroundColor: '#facc15',
              borderRadius: 4,
              borderSkipped: false,
              stack: 'cashflow',
            },
            {
              label: 'Investimentos',
              data: [investmentPercent],
              backgroundColor: '#38bdf8',
              borderRadius: 4,
              borderSkipped: false,
              stack: 'cashflow',
            },
            {
              label: 'Saldo projetado',
              data: [freePercent],
              backgroundColor: '#34d399',
              borderRadius: 4,
              borderSkipped: false,
              stack: 'cashflow',
            },
            {
              label: 'Déficit',
              data: [deficitPercent],
              backgroundColor: '#f97316',
              borderRadius: 4,
              borderSkipped: false,
              stack: 'overflow',
            },
          ],
        },
        options: {
          maintainAspectRatio: false,
          responsive: true,
          indexAxis: 'y',
          layout: { padding: { top: 2, right: 0, bottom: 0, left: 0 } },
          plugins: {
            legend: {
              labels: {
                color: '#cbd5e1',
                boxWidth: isPhoneViewport ? 8 : 12,
                font: { size: isPhoneViewport ? 10 : isCompactViewport ? 11 : 12 },
                padding: isPhoneViewport ? 10 : 14,
              },
            },
            tooltip: {
              callbacks: {
                label(context) {
                  const label = context.dataset.label;
                  const percent = Number(context.raw || 0);
                  if (label === 'Pagamentos') return `${label}: ${percent.toFixed(1)}% (${formatCurrency(paidExpenses)})`;
                  if (label === 'A pagar') return `${label}: ${percent.toFixed(1)}% (${formatCurrency(pendingExpenses)})`;
                  if (label === 'Investimentos') return `${label}: ${percent.toFixed(1)}% (${formatCurrency(investments)})`;
                  if (label === 'Saldo projetado') return `${label}: ${percent.toFixed(1)}% (${formatCurrency(Math.max(projectedBalance, 0))})`;
                  return `${label}: ${percent.toFixed(1)}% (${formatCurrency(Math.max(-projectedBalance, 0))})`;
                },
              },
            },
          },
          scales: {
            y: {
              stacked: true,
              ticks: { color: '#cbd5e1', font: { size: isPhoneViewport ? 10 : 12 } },
              grid: { display: false },
            },
            x: {
              stacked: true,
              max: Math.max(100, Math.ceil((paymentPercent + pendingPercent + investmentPercent + freePercent + deficitPercent) / 10) * 10),
              ticks: {
                color: '#64748b',
                font: { size: isPhoneViewport ? 10 : 11 },
                maxTicksLimit: isPhoneViewport ? 4 : 6,
                callback(value) {
                  return `${value}%`;
                },
              },
              grid: { color: 'rgba(148, 163, 184, 0.1)' },
            },
          },
        },
      });

    const compositionEntries = buildExpenseCategorySummaryFromTransactions(transactions, isPhoneViewport ? 4 : 5);
    const compositionTotal = compositionEntries.reduce((sum, item) => sum + item.value, 0);

    const compositionChart = new Chart(compositionRef.current, {
      type: 'bar',
      data: {
        labels: compositionEntries.map((item) => item.label),
        datasets: [{
          label: 'Custos por categoria',
          data: compositionEntries.map((item) => item.value),
          backgroundColor: compositionEntries.map((item, index) => EXPENSE_RED_SCALE[index % EXPENSE_RED_SCALE.length]),
          borderRadius: 12,
          borderSkipped: false,
        }],
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        indexAxis: 'y',
        layout: { padding: { top: 2, right: 0, bottom: 0, left: 0 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(context) {
                const value = Number(context.raw || 0);
                const percentage = compositionTotal > 0 ? (value / compositionTotal) * 100 : 0;
                return `${context.label}: ${formatCurrency(value)} (${percentage.toFixed(1)}%)`;
              },
            },
          },
        },
        scales: {
          y: {
            ticks: { color: '#cbd5e1', font: { size: isPhoneViewport ? 10 : 12 } },
            grid: { display: false },
          },
          x: {
            ticks: {
              color: '#64748b',
              font: { size: isPhoneViewport ? 10 : 11 },
              maxTicksLimit: isPhoneViewport ? 3 : 5,
              callback(value) {
                return formatCurrency(value);
              },
            },
            grid: { color: 'rgba(148, 163, 184, 0.1)' },
          },
        },
      },
    });

    return () => {
      primaryChart.destroy();
      compositionChart.destroy();
    };
  }, [hidden, income, totalExpenses, paidExpenses, investments, projection, transactions, viewMode, pendingExpenses, projectedBalance, paymentPercent, pendingPercent, investmentPercent, freePercent, deficitPercent, isProjection, minimumInvestmentTarget, investmentFloorPercent, isPhoneViewport, isCompactViewport]);

  if (hidden) return null;

  return (
    <section id="visual-section" className="grid grid-cols-1 items-stretch xl:grid-cols-[0.9fr_0.7fr] gap-6 visual-section-compact">
      <div className="card rounded-[2rem] p-6 chart-card chart-card--bar h-full flex flex-col">
        <div className="mb-4">
          <div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Indicadores</div>
          <div className="text-xl font-extrabold">{isProjection ? 'Tendência operacional e saldo projetado' : 'Panorama operacional da competência'}</div>
          <div className="mt-2 text-sm text-slate-400">{isProjection ? 'Leitura de tendência para entradas, saídas, investimentos e saldo acumulado ao longo dos próximos meses.' : 'A barra distribui 100% da receita entre pagamentos já realizados, contas ainda previstas, investimentos e saldo projetado da competência.'}</div>
        </div>
        <div className="flex-1 min-h-[22.6rem]"><canvas ref={primaryChartRef} className="chart-canvas chart-canvas--bar" /></div>
        {!isProjection ? (
          <div className={`mb-4 inline-flex flex-wrap items-center gap-2 rounded-2xl border px-4 py-3 text-sm ${income <= 0 ? 'border-slate-700 bg-slate-950/35 text-slate-300' : isInvestmentFloorAvailable ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' : 'border-amber-400/25 bg-amber-400/10 text-amber-100'}`}>
            <span className="font-black uppercase tracking-[0.2em]">Piso disponível para investir</span>
            <span>{income <= 0 ? 'Sem base de receita no mês.' : isInvestmentFloorAvailable ? `A competência ainda preserva ${availableToInvestPercent.toFixed(1)}% livres para investir.` : `Comprometido: faltam ${formatCurrency(Math.abs(investmentFloorGap))} para preservar ${investmentFloorPercent}% da receita.`}</span>
          </div>
        ) : (
          <div className={`mb-4 inline-flex flex-wrap items-center gap-2 rounded-2xl border px-4 py-3 text-sm ${projectionMonthsBelowTarget ? 'border-amber-400/25 bg-amber-400/10 text-amber-100' : 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'}`}>
            <span className="font-black uppercase tracking-[0.2em]">Piso disponível para investir</span>
            <span>{projectionMonthsBelowTarget ? `${projectionMonthsBelowTarget} mês(es) projetados preservam menos de ${investmentFloorPercent}% da receita.` : `Todos os meses projetados preservam pelo menos ${investmentFloorPercent}% da receita.`}</span>
          </div>
        )}
        <div className="mt-1 grid grid-cols-2 gap-3 xl:grid-cols-5">
          {analysisCards.map((item) => (
            <div key={item.label} className="rounded-2xl border border-slate-800/80 bg-slate-950/30 px-4 py-3">
              <div className="text-[0.65rem] font-black uppercase tracking-[0.22em] text-slate-500">{item.label}</div>
              <div className={`mt-2 text-base font-extrabold ${item.tone}`}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="card rounded-[2rem] p-6 chart-card chart-card--pie chart-card--composition h-full flex flex-col">
        <div className="mb-4">
          <div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Composição</div>
          <div className="text-xl font-extrabold">Distribuição dos custos por categoria</div>
          <div className="mt-2 text-sm text-slate-400">Visão horizontal das 5 categorias de custo mais relevantes no mês, com consolidação automática das demais em Outras.</div>
        </div>
        <div className="flex-1 min-h-[22.6rem]"><canvas ref={compositionRef} className="chart-canvas chart-canvas--pie" /></div>
      </div>
    </section>
  );
}


function LoginScreen({ onSubmit, error }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="glass w-full max-w-5xl rounded-[2rem] overflow-hidden grid lg:grid-cols-[1.15fr_0.85fr] fade-in">
        <section className="p-10 lg:p-14 border-b lg:border-b-0 lg:border-r border-slate-800/80">
          <div className="inline-flex items-center gap-3 rounded-full border border-sky-500/20 bg-sky-500/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.25em] text-sky-300">FinTrack Pro</div>
          <h1 className="mt-8 text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight">Controle financeiro com competência mensal, recorrência automática e gestão multiusuário.</h1>
          <p className="mt-6 text-slate-300 max-w-2xl leading-7">O frontend agora roda em Vite + React, mantendo a mesma API do backend e a configuração em runtime via env.js.</p>
          <div className="mt-10 grid sm:grid-cols-3 gap-4 text-sm">
            <div className="card rounded-3xl p-5">
              <div className="text-slate-400 uppercase text-[0.65rem] font-bold tracking-[0.25em]">Automação</div>
              <div className="mt-3 text-lg font-bold">Planos recorrentes com ajuste por competência</div>
            </div>
            <div className="card rounded-3xl p-5">
              <div className="text-slate-400 uppercase text-[0.65rem] font-bold tracking-[0.25em]">Segurança</div>
              <div className="mt-3 text-lg font-bold">JWT com troca obrigatória de senha</div>
            </div>
            <div className="card rounded-3xl p-5">
              <div className="text-slate-400 uppercase text-[0.65rem] font-bold tracking-[0.25em]">Visibilidade</div>
              <div className="mt-3 text-lg font-bold">Dashboard, futuro e projeção financeira</div>
            </div>
          </div>
        </section>

        <section className="p-8 lg:p-10 bg-slate-950/30">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Acesso</p>
              <h2 className="mt-2 text-2xl font-extrabold">Entrar no sistema</h2>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-sky-500/15 border border-sky-500/20 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-sky-300" />
            </div>
          </div>
          <form className="mt-8 space-y-4" onSubmit={(event) => { event.preventDefault(); onSubmit({ username, password }); }}>
            <label className="field-stack">
              <span className="field-label">Usuário</span>
              <span className="field-control">
                <input value={username} onChange={(event) => setUsername(event.target.value)} type="text" required placeholder="admin" />
              </span>
            </label>
            <label className="field-stack">
              <span className="field-label">Senha</span>
              <span className="field-control">
                <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required placeholder="Sua senha" />
              </span>
            </label>
            <button type="submit" className="w-full rounded-2xl bg-sky-500 hover:bg-sky-400 transition px-5 py-4 font-extrabold text-slate-950">Acessar</button>
          </form>
          {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
        </section>
      </div>
    </div>
  );
}


function ModalShell({ open, onClose, maxWidth = 'max-w-2xl', children }) {
  if (!open) return null;
  return (
    <div className="modal fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />
      <div className={`relative glass modal-panel w-full ${maxWidth} rounded-[2rem] p-8`}>
        {children}
      </div>
    </div>
  );
}


function ConfirmModal({ open, onClose, onConfirm, title, eyebrow, description, confirmLabel, tone = 'danger', busy = false }) {
  const toneClasses = {
    danger: 'confirm-badge--danger',
    warning: 'confirm-badge--warning',
    info: 'confirm-badge--info',
  };

  return (
    <ModalShell open={open} onClose={busy ? () => {} : onClose} maxWidth="max-w-lg">
      <div className="confirm-modal">
        <div className="confirm-modal__header">
          <div>
            <div className={`confirm-badge ${toneClasses[tone] || toneClasses.danger}`}>{eyebrow}</div>
            <div className="mt-4 text-2xl font-extrabold text-slate-50">{title}</div>
            <p className="mt-3 text-sm leading-7 text-slate-300">{description}</p>
          </div>
          <button className="icon-button rounded-2xl border border-slate-700 p-3 hover:bg-slate-900/70 transition disabled:opacity-60" onClick={onClose} disabled={busy}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="confirm-modal__footer">
          <button type="button" className="flex-1 rounded-2xl border border-slate-700 px-5 py-4 font-bold hover:bg-slate-900/70 transition disabled:opacity-60" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className={`flex-[1.25] rounded-2xl px-5 py-4 font-extrabold text-slate-950 transition disabled:opacity-60 ${tone === 'warning' ? 'bg-amber-400 hover:bg-amber-300' : tone === 'info' ? 'bg-sky-500 hover:bg-sky-400' : 'bg-rose-400 hover:bg-rose-300'}`} onClick={onConfirm} disabled={busy}>{busy ? 'Processando...' : confirmLabel}</button>
        </div>
      </div>
    </ModalShell>
  );
}


function SidebarNavButton({ active, icon: Icon, label, collapsed, onClick }) {
  return (
    <button
      className={`sidebar-nav-button w-full rounded-2xl border transition ${collapsed ? 'justify-center px-3' : 'px-4 text-left'} ${active ? 'nav-active' : 'text-slate-300 border-transparent hover:border-slate-700 hover:bg-slate-900/60'}`}
      onClick={onClick}
      data-tooltip={collapsed ? label : undefined}
      aria-label={label}
    >
      <span className={`inline-flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
        <Icon className="h-4 w-4 shrink-0" />
        {!collapsed ? <span>{label}</span> : null}
      </span>
    </button>
  );
}


export default function App() {
  const todayMonth = new Date().toISOString().slice(0, 7);
  const storedSession = useMemo(() => getStoredSession(), []);
  const [token, setToken] = useState(storedSession.token);
  const [user, setUser] = useState(storedSession.user);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentView, setCurrentView] = useState('Dashboard');
  const [month, setMonth] = useState(todayMonth);
  const [viewMode, setViewMode] = useState('mensal');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [transactionSort, setTransactionSort] = useState({ key: 'due_date', direction: 'asc' });
  const [transactions, setTransactions] = useState([]);
  const [projection, setProjection] = useState([]);
  const [futureItems, setFutureItems] = useState([]);
  const [categoryAnalytics, setCategoryAnalytics] = useState(emptyCategoryAnalytics());
  const [goals, setGoals] = useState([]);
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [adminCategories, setAdminCategories] = useState([]);
  const [notificationSettings, setNotificationSettings] = useState(emptyNotificationSettings());
  const [financialPreferences, setFinancialPreferences] = useState(emptyFinancialPreferences());
  const [toast, setToast] = useState('');
  const [loginError, setLoginError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [transactionError, setTransactionError] = useState('');
  const [userError, setUserError] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [goalError, setGoalError] = useState('');
  const [notificationSettingsError, setNotificationSettingsError] = useState('');
  const [financialPreferencesError, setFinancialPreferencesError] = useState('');
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [showAlertsModal, setShowAlertsModal] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', eyebrow: '', description: '', confirmLabel: 'Confirmar', tone: 'danger', onConfirm: null });
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [transactionForm, setTransactionForm] = useState(defaultTransactionForm(todayMonth));
  const [goalForm, setGoalForm] = useState(emptyGoalForm(todayMonth));
  const [userForm, setUserForm] = useState({ username: '', password: '', isAdmin: false });
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '' });
  const [categoryForm, setCategoryForm] = useState({ id: '', type: 'ENTRADA', name: '' });
  const [lastAlertSignature, setLastAlertSignature] = useState('');

  const isAdminView = ADMIN_VIEWS.includes(currentView);
  const alerts = useMemo(() => buildAlerts(transactions), [transactions]);
  const alertsSignature = useMemo(() => alerts.map((item) => `${item.id}:${item.badge}`).join('|'), [alerts]);
  const isDashboardView = currentView === 'Dashboard';

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!alerts.length) {
      setLastAlertSignature('');
      return;
    }
    if (alertsSignature !== lastAlertSignature) {
      setLastAlertSignature(alertsSignature);
      setShowAlertsModal(true);
    }
  }, [alerts, alertsSignature, lastAlertSignature]);

  useEffect(() => {
    if (token && user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [token, user]);

  useEffect(() => {
    if (!showTransactionModal) return;
    const filteredCategories = categories.filter((item) => item.type === transactionForm.type).map((item) => item.name);
    if (!filteredCategories.length) return;
    if (!filteredCategories.includes(transactionForm.category)) {
      setTransactionForm((current) => ({ ...current, category: filteredCategories[0] }));
    }
  }, [categories, showTransactionModal, transactionForm.type, transactionForm.category]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed));
    } catch {
      return undefined;
    }
    return undefined;
  }, [sidebarCollapsed]);

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((current) => !current);
  }

  function handleSidebarBrandClick() {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) {
      toggleSidebarCollapsed();
      return;
    }
    setSidebarOpen((current) => !current);
  }

  function toggleTransactionSort(sortKey) {
    setTransactionSort((current) => current.key === sortKey
      ? { key: sortKey, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      : { key: sortKey, direction: sortKey === 'amount' || sortKey === 'status' ? 'desc' : 'asc' });
  }

  function sortLabel(sortKey, label) {
    if (transactionSort.key !== sortKey) return label;
    return `${label} ${transactionSort.direction === 'asc' ? 'ASC' : 'DESC'}`;
  }

  function resetConfirmDialog() {
    setConfirmDialog({ open: false, title: '', eyebrow: '', description: '', confirmLabel: 'Confirmar', tone: 'danger', onConfirm: null });
  }

  function closeConfirmDialog() {
    if (confirmBusy) return;
    resetConfirmDialog();
  }

  function openConfirmDialog(config) {
    setConfirmDialog({
      open: true,
      title: config.title,
      eyebrow: config.eyebrow,
      description: config.description,
      confirmLabel: config.confirmLabel || 'Confirmar',
      tone: config.tone || 'danger',
      onConfirm: config.onConfirm,
    });
  }

  async function handleConfirmDialogAction() {
    if (!confirmDialog.onConfirm) return;
    setConfirmBusy(true);
    try {
      await confirmDialog.onConfirm();
      resetConfirmDialog();
    } finally {
      setConfirmBusy(false);
    }
  }

  async function api(path, options = {}) {
    try {
      return await requestApi(token, path, options);
    } catch (error) {
      if (error.status === 401) {
        setToken(null);
        setUser(null);
      }
      throw error;
    }
  }

  async function refreshData() {
    if (!user || user.must_change_password) return;

    const requests = [
      api(`/transactions?month=${month}`),
      api(`/transactions/projection?month=${month}&horizon=12`),
      api(`/transactions/future?month=${month}&horizon=12`),
      api(`/transactions/analytics/category-costs?month=${month}&horizon=6`),
      api(`/goals?month=${month}`),
      api('/categories'),
    ];
    requests.push(api('/auth/notification-settings'));
    requests.push(api('/auth/financial-preferences'));
    if (user.is_admin) {
      requests.push(api('/admin/users'));
      requests.push(api('/admin/categories'));
    }

    const [transactionsResponse, projectionResponse, futureResponse, analyticsResponse, goalsResponse, categoriesResponse, settingsResponse, financialPreferencesResponse, usersResponse, adminCategoriesResponse] = await Promise.all(requests);
    setTransactions(transactionsResponse.items);
    setProjection(projectionResponse.months.slice(0, 6));
    setFutureItems(futureResponse.items);
    setCategoryAnalytics(analyticsResponse);
    setGoals(goalsResponse.items);
    setCategories(categoriesResponse);
    setNotificationSettings({ ...emptyNotificationSettings(), ...settingsResponse });
    setFinancialPreferences({ ...emptyFinancialPreferences(), ...financialPreferencesResponse });

    if (user.is_admin) {
      setUsers(usersResponse);
      setAdminCategories(adminCategoriesResponse);
    } else {
      setUsers([]);
      setAdminCategories([]);
    }
  }

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      if (!token) return;
      try {
        const currentUser = await requestApi(token, '/auth/me');
        if (!active) return;
        setUser(currentUser);
      } catch {
        if (!active) return;
        setToken(null);
        setUser(null);
      }
    }
    bootstrap();
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (user && !user.must_change_password) {
      refreshData().catch((error) => setToast(error.message));
    }
  }, [user, month]);

  useEffect(() => {
    if (viewMode === 'projecao' && user && !user.must_change_password) {
      refreshData().catch((error) => setToast(error.message));
    }
  }, [viewMode]);

  async function handleLogin({ username, password }) {
    setLoginError('');
    try {
      const payload = await requestApi(null, '/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password }),
      });
      setToken(payload.access_token);
      setUser(payload.user);
      setCurrentView('Dashboard');
    } catch (error) {
      setLoginError(error.message);
    }
  }

  async function handlePasswordChange(event) {
    event.preventDefault();
    setPasswordError('');
    try {
      const currentUser = await api('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: passwordForm.current, new_password: passwordForm.next }),
      });
      setUser(currentUser);
      setPasswordForm({ current: '', next: '' });
      setToast('Senha atualizada');
      await refreshData();
    } catch (error) {
      setPasswordError(error.message);
    }
  }

  function openNewTransaction() {
    const baseCategories = categories.filter((item) => item.type === 'ENTRADA').map((item) => item.name);
    setTransactionForm({ ...defaultTransactionForm(month), category: baseCategories[0] || '', isRecurring: true, goalId: '' });
    setTransactionError('');
    setShowTransactionModal(true);
  }

  function openNewGoal() {
    setGoalForm(emptyGoalForm(month));
    setGoalError('');
    setShowGoalModal(true);
  }

  function openNewInvestmentForGoal(goal) {
    const investmentCategories = categories.filter((item) => item.type === 'INVESTIMENTO').map((item) => item.name);
    setTransactionForm({
      ...defaultTransactionForm(month),
      type: 'INVESTIMENTO',
      category: investmentCategories[0] || '',
      isRecurring: false,
      goalId: goal.id,
      isPaid: false,
    });
    setTransactionError('');
    setShowTransactionModal(true);
  }

  function openEditGoal(goal) {
    setGoalForm({
      id: goal.id,
      title: goal.title,
      targetAmount: formatCurrency(goal.target_amount),
      startMonth: goal.start_month,
      targetMonth: goal.target_date.slice(0, 7),
      isActive: goal.is_active,
    });
    setGoalError('');
    setShowGoalModal(true);
  }

  function openEditTransaction(item) {
    setTransactionForm({
      id: item.id,
      planId: item.plan_id || '',
      goalId: item.goal_id || '',
      description: item.description,
      competence: item.competence,
      dueDate: item.due_date || '',
      amount: formatCurrency(item.amount),
      type: item.type,
      category: item.category,
      isPaid: item.is_paid,
      isRecurring: item.type === 'FIXO' || item.type === 'ENTRADA',
      applyToPlan: false,
    });
    setTransactionError('');
    setShowTransactionModal(true);
  }

  async function handleSubmitTransaction(event) {
    event.preventDefault();
    setTransactionError('');
    try {
      const payload = {
        description: transactionForm.description.trim(),
        competence: transactionForm.competence,
        due_date: transactionForm.dueDate || null,
        amount: normalizeCurrencyInput(transactionForm.amount),
        type: transactionForm.type,
        category: transactionForm.category,
        goal_id: transactionForm.type === 'INVESTIMENTO' ? (transactionForm.goalId || null) : null,
        is_paid: transactionForm.isPaid,
      };
      if (!transactionForm.id) payload.is_recurring = transactionForm.isRecurring;
      if (transactionForm.id && transactionForm.planId) payload.apply_to_plan = transactionForm.applyToPlan;

      await api(transactionForm.id ? `/transactions/${transactionForm.id}` : '/transactions', {
        method: transactionForm.id ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      setShowTransactionModal(false);
      setToast(transactionForm.id ? 'Lançamento atualizado' : 'Lançamento criado');
      await refreshData();
    } catch (error) {
      setTransactionError(error.message);
    }
  }

  async function handleTogglePaid(item) {
    try {
      await api(`/transactions/${item.id}`, { method: 'PATCH', body: JSON.stringify({ is_paid: !item.is_paid }) });
      await refreshData();
    } catch (error) {
      setToast(error.message);
    }
  }

  async function handleTerminateTransaction(item) {
    openConfirmDialog({
      eyebrow: 'Recorrência',
      title: 'Encerrar custo fixo',
      description: `A recorrência de ${item.description} será interrompida a partir desta competência. O histórico anterior será mantido.`,
      confirmLabel: 'Encerrar recorrência',
      tone: 'warning',
      onConfirm: async () => {
        try {
          await api(`/transactions/${item.id}/terminate`, { method: 'PATCH' });
          setToast('Recorrência encerrada');
          await refreshData();
        } catch (error) {
          setToast(error.message);
        }
      },
    });
  }

  async function handleDeleteTransaction(item) {
    openConfirmDialog({
      eyebrow: 'Exclusão',
      title: 'Excluir lançamento',
      description: `O lançamento ${item.description} será removido permanentemente desta competência.`,
      confirmLabel: 'Excluir lançamento',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await api(`/transactions/${item.id}`, { method: 'DELETE' });
          setToast('Lançamento excluído');
          await refreshData();
        } catch (error) {
          setToast(error.message);
        }
      },
    });
  }

  async function handleSubmitUser(event) {
    event.preventDefault();
    setUserError('');
    try {
      await api('/admin/users', {
        method: 'POST',
        body: JSON.stringify({ username: userForm.username.trim(), password: userForm.password, is_admin: userForm.isAdmin }),
      });
      setShowUserModal(false);
      setUserForm({ username: '', password: '', isAdmin: false });
      setToast('Usuário criado');
      await refreshData();
    } catch (error) {
      setUserError(error.message);
    }
  }

  async function handleResetUserPassword(targetUser) {
    openConfirmDialog({
      eyebrow: 'Admin',
      title: 'Resetar senha do usuário',
      description: `Uma nova senha temporária será gerada para ${targetUser.username} e ele deverá trocá-la no próximo acesso.`,
      confirmLabel: 'Resetar senha',
      tone: 'info',
      onConfirm: async () => {
        try {
          const result = await api(`/admin/users/${targetUser.id}/reset`, { method: 'POST' });
          setToast(`Senha temporária: ${result.temporary_password}`);
          await refreshData();
        } catch (error) {
          setToast(error.message);
        }
      },
    });
  }

  async function handleSubmitCategory(event) {
    event.preventDefault();
    setCategoryError('');
    try {
      if (categoryForm.id) {
        await api(`/admin/categories/${categoryForm.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: categoryForm.name.trim() }),
        });
        setToast('Categoria atualizada');
      } else {
        await api('/admin/categories', {
          method: 'POST',
          body: JSON.stringify({ type: categoryForm.type, name: categoryForm.name.trim(), is_active: true }),
        });
        setToast('Categoria criada');
      }
      setCategoryForm({ id: '', type: 'ENTRADA', name: '' });
      await refreshData();
    } catch (error) {
      setCategoryError(error.message);
    }
  }

  async function handleToggleCategory(category, nextValue) {
    try {
      await api(`/admin/categories/${category.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: nextValue }) });
      setToast(nextValue ? 'Categoria reativada' : 'Categoria inativada');
      await refreshData();
    } catch (error) {
      setToast(error.message);
    }
  }

  async function handleDeleteCategory(category) {
    openConfirmDialog({
      eyebrow: 'Categoria',
      title: 'Excluir categoria',
      description: `A categoria ${category.name} será removida da administração.`,
      confirmLabel: 'Excluir categoria',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await api(`/admin/categories/${category.id}`, { method: 'DELETE' });
          setToast('Categoria excluída');
          await refreshData();
        } catch (error) {
          setToast(error.message);
        }
      },
    });
  }

  async function handleSubmitGoal(event) {
    event.preventDefault();
    setGoalError('');
    try {
      const payload = {
        title: goalForm.title.trim(),
        target_amount: normalizeCurrencyInput(goalForm.targetAmount),
        start_month: goalForm.startMonth,
        target_date: `${goalForm.targetMonth}-01`,
        is_active: goalForm.isActive,
      };
      await api(goalForm.id ? `/goals/${goalForm.id}` : '/goals', {
        method: goalForm.id ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      setShowGoalModal(false);
      setGoalForm(emptyGoalForm(month));
      setToast(goalForm.id ? 'Meta atualizada' : 'Meta criada');
      await refreshData();
    } catch (error) {
      setGoalError(error.message);
    }
  }

  async function handleDeleteGoal(goal) {
    openConfirmDialog({
      eyebrow: 'Meta',
      title: 'Excluir objetivo',
      description: `A meta ${goal.title} será removida do planejamento financeiro.`,
      confirmLabel: 'Excluir meta',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await api(`/goals/${goal.id}`, { method: 'DELETE' });
          setToast('Meta excluída');
          await refreshData();
        } catch (error) {
          setToast(error.message);
        }
      },
    });
  }

  async function handleSubmitNotificationSettings(event) {
    event.preventDefault();
    setNotificationSettingsError('');
    try {
      const saved = await api('/auth/notification-settings', {
        method: 'PUT',
        body: JSON.stringify(notificationSettings),
      });
      setNotificationSettings({ ...emptyNotificationSettings(), ...saved });
      setToast('Configuração de notificações salva');
    } catch (error) {
      setNotificationSettingsError(error.message);
    }
  }

  async function handleSubmitFinancialPreferences(event) {
    event.preventDefault();
    setFinancialPreferencesError('');
    try {
      const saved = await api('/auth/financial-preferences', {
        method: 'PUT',
        body: JSON.stringify(financialPreferences),
      });
      setFinancialPreferences({ ...emptyFinancialPreferences(), ...saved });
      setUser((current) => (current ? { ...current, investment_floor_percent: saved.investment_floor_percent } : current));
      setToast('Preferência financeira salva');
    } catch (error) {
      setFinancialPreferencesError(error.message);
    }
  }

  async function handleDispatchNotifications() {
    setNotificationSettingsError('');
    try {
      const report = await api('/auth/notifications/dispatch', { method: 'POST' });
      if (report.checked_transactions === 0 && report.reason) {
        setToast(report.reason);
        return;
      }

      const summary = `Disparo concluído: ${report.notifications_sent} enviado(s), ${report.notifications_skipped} ignorado(s), ${report.checked_transactions} verificado(s)`;
      setToast(report.reason ? `${summary}. ${report.reason}` : summary);
    } catch (error) {
      setNotificationSettingsError(error.message);
    }
  }

  function logout() {
    setSidebarOpen(false);
    setToken(null);
    setUser(null);
    setTransactions([]);
    setProjection([]);
    setFutureItems([]);
    setCategoryAnalytics(emptyCategoryAnalytics());
    setGoals([]);
    setUsers([]);
    setCategories([]);
    setAdminCategories([]);
    setNotificationSettings(emptyNotificationSettings());
    setFinancialPreferences(emptyFinancialPreferences());
    setCurrentView('Dashboard');
    setToast('Sessão finalizada');
  }

  const filteredTransactions = useMemo(() => {
    const baseItems = typeFilter === 'ALL'
      ? transactions
      : typeFilter === 'LINKED_INVESTMENTS'
        ? transactions.filter((item) => item.type === 'INVESTIMENTO' && item.goal_id)
        : transactions.filter((item) => item.type === typeFilter);

    const sortedItems = [...baseItems].sort((left, right) => compareTransactions(left, right, transactionSort.key));
    return transactionSort.direction === 'desc' ? sortedItems.reverse() : sortedItems;
  }, [transactions, typeFilter, transactionSort]);

  const goalNameById = useMemo(
    () => Object.fromEntries(goals.map((goal) => [goal.id, goal.title])),
    [goals],
  );

  const income = transactions.filter((item) => item.type === 'ENTRADA').reduce((sum, item) => sum + Number(item.amount), 0);
  const totalExpenses = transactions.filter((item) => item.type === 'FIXO' || item.type === 'VARIAVEL').reduce((sum, item) => sum + Number(item.amount), 0);
  const paidExpenses = transactions.filter((item) => item.is_paid && (item.type === 'FIXO' || item.type === 'VARIAVEL')).reduce((sum, item) => sum + Number(item.amount), 0);
  const pendingExpenses = Math.max(totalExpenses - paidExpenses, 0);
  const investments = transactions.filter((item) => item.type === 'INVESTIMENTO').reduce((sum, item) => sum + Number(item.amount), 0);
  const investmentFloorPercent = Number(financialPreferences.investment_floor_percent || user?.investment_floor_percent || DEFAULT_INVESTMENT_FLOOR_PERCENT);
  const minimumInvestmentTarget = income * (investmentFloorPercent / 100);
  const availableToInvest = income - totalExpenses;
  const investmentFloorGap = availableToInvest - minimumInvestmentTarget;
  const isInvestmentFloorAvailable = income > 0 ? availableToInvest >= minimumInvestmentTarget : false;
  const goalLinkedInvestments = transactions.filter((item) => item.type === 'INVESTIMENTO' && item.goal_id);
  const goalLinkedInvestmentsTotal = goalLinkedInvestments.reduce((sum, item) => sum + Number(item.amount), 0);
  const projectedBalance = income - totalExpenses - investments;
  const projectedBalancePercent = income > 0 ? (projectedBalance / income) * 100 : 0;
  const futureStatementItems = futureItems.filter((item) => item.type === 'VARIAVEL');
  const activeGoals = goals.filter((item) => item.is_active);
  const currentViewMeta = VIEW_META[currentView] || VIEW_META.Dashboard;
  const primaryNavItems = [
    { key: 'Dashboard', ...VIEW_META.Dashboard },
    { key: 'GOALS', ...VIEW_META.GOALS },
    { key: 'NOTIFICATIONS', ...VIEW_META.NOTIFICATIONS },
  ];
  const adminNavItems = [
    { key: 'ADMIN_USERS', ...VIEW_META.ADMIN_USERS },
    { key: 'ADMIN_CATEGORIES', ...VIEW_META.ADMIN_CATEGORIES },
  ];

  if (!token || !user) {
    return <LoginScreen onSubmit={handleLogin} error={loginError} />;
  }

  return (
    <>
      <div className={`app-shell min-h-screen md:grid ${sidebarCollapsed ? 'md:grid-cols-[92px_1fr]' : 'md:grid-cols-[280px_1fr]'}`}>
        {sidebarOpen ? <button className="fixed inset-0 z-40 bg-slate-950/75 backdrop-blur-sm md:hidden" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu" /> : null}
        <aside className={`sidebar-shell relative border-b md:border-b-0 md:border-r border-slate-800/70 bg-slate-950/40 backdrop-blur-xl md:sticky md:top-0 md:h-screen md:flex md:flex-col ${sidebarCollapsed ? 'md:px-3' : 'md:px-5'} px-4 py-4 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
          <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-start'} gap-4`}>
            <button
              type="button"
              className="h-11 w-11 rounded-2xl bg-sky-500/20 border border-sky-500/20 flex items-center justify-center shrink-0 transition hover:bg-sky-500/30"
              onClick={handleSidebarBrandClick}
              aria-label={sidebarCollapsed ? 'Expandir menu' : 'Ocultar menu'}
              data-tooltip={sidebarCollapsed ? 'Expandir menu' : 'Ocultar menu'}
            >
              <Wallet className="w-6 h-6 text-sky-300" />
            </button>
            {!sidebarCollapsed ? <div><div className="text-xs font-black uppercase tracking-[0.35em] text-slate-500">Painel</div><div className="text-lg font-extrabold text-slate-50">FinTrack Pro</div></div> : null}
            <div className="flex items-center gap-2">
              <button className="md:hidden rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-300" onClick={logout}>Sair</button>
            </div>
          </div>

          <div className={`session-card mt-5 card ${sidebarCollapsed ? 'md:px-3 md:py-4' : ''}`}>
            <div className="section-label font-black uppercase text-slate-500">Sessão</div>
            {!sidebarCollapsed ? <div className="mt-3 text-lg font-bold">{user.username}</div> : <div className="mt-3 text-lg font-bold text-center">{user.username.slice(0, 1)}</div>}
            {!sidebarCollapsed ? <div className="text-sm text-slate-400">{user.is_admin ? 'Administrador' : 'Usuário padrão'}</div> : null}
            {user.is_admin ? (
              <div className={`mt-5 grid gap-2 border-t border-slate-800/80 pt-4 ${sidebarCollapsed ? 'md:justify-items-center' : ''}`}>
                {adminNavItems.map((item) => (
                  <SidebarNavButton
                    key={item.key}
                    active={currentView === item.key}
                    icon={item.icon}
                    label={item.label}
                    collapsed={sidebarCollapsed}
                    onClick={() => {
                      setCurrentView(item.key);
                      setSidebarOpen(false);
                    }}
                  />
                ))}
              </div>
            ) : null}
          </div>

          <nav className={`mt-8 space-y-2 text-sm font-semibold md:flex-1 ${sidebarCollapsed ? 'md:flex md:flex-col md:items-center' : ''}`}>
            {primaryNavItems.map((item) => (
              <SidebarNavButton
                key={item.key}
                active={currentView === item.key}
                icon={item.icon}
                label={item.label}
                collapsed={sidebarCollapsed}
                onClick={() => {
                  setCurrentView(item.key);
                  setSidebarOpen(false);
                }}
              />
            ))}
          </nav>

          <button className={`hidden md:flex mt-8 w-full items-center justify-center gap-2 rounded-2xl border border-slate-700 px-4 py-3 text-sm font-bold uppercase tracking-[0.2em] text-slate-200 hover:bg-slate-900/80 transition md:mt-auto ${sidebarCollapsed ? 'md:px-3' : ''}`} onClick={logout} data-tooltip={sidebarCollapsed ? 'Sair' : undefined}>
            <LogOut className="w-4 h-4" />
            {!sidebarCollapsed ? 'Sair' : null}
          </button>
        </aside>

        <main className="app-main px-4 py-5 md:px-6 md:py-6 lg:px-7 lg:py-7 xl:px-8 xl:py-8">
          <div className="mobile-topbar md:hidden mb-4 glass rounded-[1.4rem] px-4 py-3 flex items-center justify-between gap-3 sticky top-3 z-30">
            <div>
              <div className="text-[0.65rem] font-black uppercase tracking-[0.22em] text-slate-500">Visualização</div>
              <div className="text-lg font-extrabold text-slate-50">{currentViewMeta.label}</div>
            </div>
            <button className="rounded-2xl border border-slate-700 p-3 text-slate-100 hover:bg-slate-900/70 transition" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu">
              <Menu className="h-5 w-5" />
            </button>
          </div>
          {user.must_change_password ? (
            <section className="mb-8 glass rounded-[2rem] p-8 max-w-3xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.25em] text-amber-300">Ação obrigatória</div>
                  <h2 className="mt-2 text-3xl font-extrabold">Troque sua senha para liberar o restante do sistema.</h2>
                  <p className="mt-3 text-slate-300 leading-7">Enquanto a troca não for concluída, dashboards e tabelas continuam bloqueados.</p>
                </div>
                <div className="h-14 w-14 rounded-3xl border border-amber-400/20 bg-amber-400/10 flex items-center justify-center"><KeyRound className="w-7 h-7 text-amber-300" /></div>
              </div>
              <form className="mt-8 grid md:grid-cols-3 gap-4" onSubmit={handlePasswordChange}>
                <label className="field-stack">
                  <span className="field-label">Senha atual</span>
                  <span className="field-control"><input type="password" required value={passwordForm.current} onChange={(event) => setPasswordForm((current) => ({ ...current, current: event.target.value }))} /></span>
                </label>
                <label className="field-stack">
                  <span className="field-label">Nova senha</span>
                  <span className="field-control"><input type="password" required minLength={6} value={passwordForm.next} onChange={(event) => setPasswordForm((current) => ({ ...current, next: event.target.value }))} /></span>
                </label>
                <div className="flex items-end"><button type="submit" className="w-full rounded-2xl bg-amber-400 text-slate-950 px-5 py-4 font-extrabold hover:bg-amber-300 transition">Atualizar senha</button></div>
              </form>
              {passwordError ? <p className="mt-4 text-sm text-rose-300">{passwordError}</p> : null}
            </section>
          ) : (
            <section className="space-y-8">
              {isDashboardView ? (
                <>
                  <header className="summary-card panel-compact glass flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 fade-in">
                    <div>
                      <div className="section-label font-black uppercase text-slate-500">Resumo operacional</div>
                      <h2 className="compact-title mt-2 font-extrabold tracking-tight">Competência e fluxo de caixa</h2>
                      <p className="summary-copy text-slate-300">Planos recorrentes alimentam o dashboard e cada competência pode ter ajuste próprio de valor e baixa.</p>
                    </div>
                    <div className="toolbar-controls xl:w-auto">
                      <label className="field-stack">
                        <span className="field-label">Competência</span>
                        <span className="field-control field-control--icon"><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></span>
                      </label>
                      <label className="field-stack">
                        <span className="field-label">Modo</span>
                        <span className="field-control field-control--select">
                          <select value={viewMode} onChange={(event) => setViewMode(event.target.value)}>
                            <option value="mensal">Visão mensal</option>
                            <option value="projecao">Projeção 6 meses</option>
                          </select>
                        </span>
                      </label>
                      <label className="field-stack">
                        <span className="field-label">Filtro de lançamentos</span>
                        <span className="field-control field-control--select">
                          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                            {TRANSACTION_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        </span>
                      </label>
                      <button className="toolbar-icon-button icon-button border border-slate-700 text-slate-200 hover:bg-slate-900/80 transition" onClick={() => setShowAlertsModal(true)} aria-label="Abrir alertas">
                        <Bell className="w-4 h-4" />
                        {alerts.length ? <span className="toolbar-badge">{alerts.length}</span> : null}
                      </button>
                      <button className="toolbar-button toolbar-button--primary bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold transition" onClick={openNewTransaction}>Novo lançamento</button>
                    </div>
                  </header>

                  <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7 gap-5">
                    <article className="metric-card card rounded-[1.7rem] border-b-2 border-emerald-500/70"><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Entradas</div><div className="metric-value font-extrabold text-emerald-300">{formatCurrency(income)}</div></article>
                    <article className="metric-card card rounded-[1.7rem] border-b-2 border-rose-400/70"><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Pagamentos</div><div className="metric-value font-extrabold text-rose-300">- {formatCurrency(paidExpenses)}</div><div className="metric-caption">Contas já liquidadas nesta competência.</div></article>
                    <article className="metric-card card rounded-[1.7rem] border-b-2 border-amber-300/70"><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Saídas previstas</div><div className="metric-value font-extrabold text-amber-200">- {formatCurrency(pendingExpenses)}</div><div className="metric-caption">Compromissos ainda abertos dentro do mês.</div></article>
                    <article className="metric-card card rounded-[1.7rem] border-b-2 border-cyan-400/70"><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Investimentos</div><div className="metric-value font-extrabold text-cyan-300">{formatCurrency(investments)}</div><div className="metric-caption">{goalLinkedInvestments.length ? `${formatCurrency(goalLinkedInvestmentsTotal)} vinculados a metas.` : 'Sem aporte vinculado a metas nesta competência.'}</div></article>
                    <article className={`metric-card card rounded-[1.7rem] border-b-2 ${income <= 0 ? 'border-slate-300/70' : isInvestmentFloorAvailable ? 'border-emerald-300/70' : 'border-amber-300/70'}`}><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Piso p/ investir</div><div className={`metric-value font-extrabold ${income <= 0 ? 'text-slate-50' : isInvestmentFloorAvailable ? 'text-emerald-300' : 'text-amber-200'}`}>{income > 0 ? `${investmentFloorPercent.toFixed(0)}%` : '--'}</div><div className="metric-caption">{income <= 0 ? 'Sem receita para medir o piso.' : isInvestmentFloorAvailable ? `A competência ainda preserva ${formatCurrency(investmentFloorGap)} acima do piso.` : `Faltam ${formatCurrency(Math.abs(investmentFloorGap))} para preservar o piso mensal.`}</div></article>
                    <article className="metric-card card rounded-[1.7rem] border-b-2 border-slate-300/70"><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Saldo projetado</div><div className={`metric-value font-extrabold ${projectedBalance >= 0 ? 'text-slate-50' : 'text-rose-300'}`}>{formatCurrency(projectedBalance)}</div><div className="metric-caption">Receita menos custos previstos e investimentos.</div></article>
                    <article className="metric-card card rounded-[1.7rem] border-b-2 border-emerald-300/70"><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Saldo na receita</div><div className={`metric-value font-extrabold ${projectedBalancePercent >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{projectedBalancePercent.toFixed(1)}%</div><div className="metric-caption">Percentual da receita que tende a sobrar no fim do mês.</div></article>
                  </section>

                  <ChartsSection hidden={false} income={income} totalExpenses={totalExpenses} paidExpenses={paidExpenses} investments={investments} projection={projection} viewMode={viewMode} transactions={transactions} investmentFloorPercent={investmentFloorPercent} />

                  <CategoryAreaChart hidden={false} analytics={categoryAnalytics} projection={projection} investmentFloorPercent={investmentFloorPercent} />

                  {viewMode === 'projecao' ? (
                    <section className="card rounded-[2rem] p-6 overflow-x-auto">
                      <div className="mb-6"><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Projeção</div><div className="text-xl font-extrabold">Próximos 6 meses</div></div>
                      <table className="w-full text-left min-w-[720px]">
                        <thead className="text-[0.65rem] uppercase tracking-[0.25em] text-slate-500"><tr><th className="py-3">Competência</th><th className="py-3 text-right">Entradas</th><th className="py-3 text-right">Fixos</th><th className="py-3 text-right">Variáveis</th><th className="py-3 text-right">Investimentos</th><th className="py-3 text-right">Saldo</th></tr></thead>
                        <tbody className="divide-y divide-slate-800">
                          {projection.map((item) => (
                            <tr key={item.month}>
                              <td className="py-4 font-bold">{item.month}</td>
                              <td className="py-4 text-right text-emerald-300">{formatCurrency(item.income_total)}</td>
                              <td className="py-4 text-right text-rose-300">- {formatCurrency(item.fixed_total)}</td>
                              <td className="py-4 text-right text-rose-200">- {formatCurrency(item.variable_total)}</td>
                              <td className="py-4 text-right text-cyan-300">{formatCurrency(item.investment_total)}</td>
                              <td className={`py-4 text-right font-extrabold ${Number(item.balance_projection) >= 0 ? 'text-slate-50' : 'text-rose-300'}`}>{formatCurrency(item.balance_projection)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </section>
                  ) : null}

                  <section className="card rounded-[2rem] overflow-hidden">
                    <div className="px-6 py-5 border-b border-slate-800/80 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                      <div><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Investimentos vinculados</div><div className="text-xl font-extrabold">{month}</div></div>
                      <div className="text-sm text-slate-400">Esses lançamentos contam para o card de investimentos e também para o progresso das metas.</div>
                    </div>
                    <div className="overflow-x-auto border-b border-slate-800/80">
                      <table className="w-full text-left min-w-[900px]">
                        <thead className="bg-slate-900/60 text-[0.65rem] uppercase tracking-[0.25em] text-slate-500"><tr><th className="px-6 py-4">Descrição</th><th className="px-6 py-4">Categoria</th><th className="px-6 py-4">Meta</th><th className="px-6 py-4">Competência</th><th className="px-6 py-4 text-right">Valor</th></tr></thead>
                        <tbody className="divide-y divide-slate-800/80 text-sm">
                          {!goalLinkedInvestments.length ? <tr><td colSpan="5" className="empty-state">Nenhum investimento vinculado a meta na competência selecionada.</td></tr> : null}
                          {goalLinkedInvestments.map((item) => (
                            <tr key={`goal-linked-${item.id}`}>
                              <td className="px-6 py-4 font-bold text-slate-50">{item.description}</td>
                              <td className="px-6 py-4 text-slate-300">{item.category}</td>
                              <td className="px-6 py-4 text-cyan-200 font-semibold">{goalNameById[item.goal_id] || '--'}</td>
                              <td className="px-6 py-4 text-slate-300">{item.competence}</td>
                              <td className="px-6 py-4 text-right font-extrabold text-cyan-300">{formatCurrency(item.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="px-6 py-5 border-b border-slate-800/80 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                      <div><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Lançamentos</div><div className="text-xl font-extrabold">{month}</div></div>
                      <div className="text-sm text-slate-400">Saídas são exibidas com sinal negativo.</div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left min-w-[1100px]">
                        <thead className="bg-slate-900/60 text-[0.65rem] uppercase tracking-[0.25em] text-slate-500"><tr><th className="px-6 py-4"><button type="button" className="font-inherit" onClick={() => toggleTransactionSort('due_date')}>{sortLabel('due_date', 'Venc.')}</button></th><th className="px-6 py-4">Descrição</th><th className="px-6 py-4"><button type="button" className="font-inherit" onClick={() => toggleTransactionSort('category')}>{sortLabel('category', 'Categoria')}</button></th><th className="px-6 py-4">Meta</th><th className="px-6 py-4 text-right"><button type="button" className="font-inherit" onClick={() => toggleTransactionSort('amount')}>{sortLabel('amount', 'Valor')}</button></th><th className="px-6 py-4 text-center"><button type="button" className="font-inherit" onClick={() => toggleTransactionSort('status')}>{sortLabel('status', 'Status')}</button></th><th className="px-6 py-4 text-center">Ações</th></tr></thead>
                        <tbody className="divide-y divide-slate-800/80 text-sm">
                          {!filteredTransactions.length ? <tr><td colSpan="7" className="empty-state">Nenhum lançamento encontrado para esse filtro na competência selecionada.</td></tr> : null}
                          {filteredTransactions.map((item) => {
                            const status = getStatusInfo(item);
                            const isExpense = item.type === 'FIXO' || item.type === 'VARIAVEL';
                            const linkedGoalName = item.goal_id ? goalNameById[item.goal_id] : '';
                            return (
                              <tr key={item.id} className="hover:bg-slate-900/35 transition">
                                <td className="px-6 py-4 text-slate-400 font-mono">{item.due_date ? item.due_date.slice(-2) : '--'}</td>
                                <td className="px-6 py-4"><div className="font-bold text-slate-50">{item.description}</div><div className="mt-1 flex flex-wrap items-center gap-2"><span className="text-xs uppercase tracking-[0.2em] text-slate-500">{TYPE_LABELS[item.type]}</span>{linkedGoalName ? <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-1 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-cyan-200">Meta vinculada</span> : null}</div></td>
                                <td className="px-6 py-4 text-slate-300">{item.category}</td>
                                <td className="px-6 py-4 text-slate-300">{linkedGoalName || '--'}</td>
                                <td className={`px-6 py-4 text-right font-extrabold ${isExpense ? 'text-rose-300' : 'text-emerald-300'}`}>{isExpense ? '- ' : ''}{formatCurrency(item.amount)}</td>
                                <td className="px-6 py-4 text-center">
                                  {isExpense ? <button className={`status-pill ${status.className}`} onClick={() => handleTogglePaid(item)}>{status.label}</button> : <span className={`status-pill ${status.className}`}>{status.label}</span>}
                                </td>
                                <td className="px-6 py-4"><div className="flex items-center justify-center gap-2"><button className="icon-button rounded-xl border border-slate-700 p-2 hover:bg-slate-900/70 transition" onClick={() => openEditTransaction(item)}><Pencil className="w-4 h-4" /></button>{item.type === 'FIXO' ? <button className="icon-button rounded-xl border border-amber-400/30 p-2 text-amber-200 hover:bg-amber-400/10 transition" onClick={() => handleTerminateTransaction(item)}><OctagonMinus className="w-4 h-4" /></button> : null}<button className="icon-button rounded-xl border border-rose-400/30 p-2 text-rose-200 hover:bg-rose-400/10 transition" onClick={() => handleDeleteTransaction(item)}><Trash2 className="w-4 h-4" /></button></div></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="card rounded-[2rem] overflow-hidden">
                    <div className="px-6 py-5 border-b border-slate-800/80 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                      <div><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Futuro</div><div className="text-xl font-extrabold">Custos variáveis até 12 meses</div></div>
                      <div className="text-sm text-slate-400">Lista simples apenas com custos variáveis futuros.</div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left min-w-[860px]">
                        <thead className="bg-slate-900/60 text-[0.65rem] uppercase tracking-[0.25em] text-slate-500"><tr><th className="px-6 py-4">Competência</th><th className="px-6 py-4">Venc.</th><th className="px-6 py-4">Descrição</th><th className="px-6 py-4">Categoria</th><th className="px-6 py-4">Tipo</th><th className="px-6 py-4 text-right">Valor</th></tr></thead>
                        <tbody className="divide-y divide-slate-800/80 text-sm">
                          {!futureStatementItems.length ? <tr><td colSpan="6" className="empty-state">Nenhum custo variável futuro encontrado.</td></tr> : null}
                          {futureStatementItems.map((item) => {
                            const isExpense = item.type === 'VARIAVEL';
                            return (
                              <tr key={`${item.id}-${item.competence}`}>
                                <td className="px-6 py-4 font-bold text-slate-100">{formatMonthLabel(item.competence)}</td>
                                <td className="px-6 py-4 text-slate-400 font-mono">{item.due_date ? item.due_date.slice(-2) : '--'}</td>
                                <td className="px-6 py-4 font-bold text-slate-50">{item.description}</td>
                                <td className="px-6 py-4 text-slate-300">{item.category}</td>
                                <td className="px-6 py-4 text-slate-400 uppercase tracking-[0.18em] text-xs">{TYPE_LABELS[item.type]}</td>
                                <td className={`px-6 py-4 text-right font-extrabold ${isExpense ? 'text-rose-300' : 'text-emerald-300'}`}>{isExpense ? '- ' : ''}{formatCurrency(item.amount)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>

                </>
              ) : null}

              {currentView === 'GOALS' ? (
                <section className="card rounded-[2rem] overflow-hidden">
                  <div className="px-6 py-5 border-b border-slate-800/80 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                      <div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Metas</div>
                      <div className="text-xl font-extrabold">Planejamento de objetivos financeiros</div>
                      <div className="mt-2 text-sm text-slate-400">Os valores das metas são contabilizados por lançamentos do tipo investimento vinculados explicitamente a cada objetivo.</div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto lg:items-end">
                      <label className="field-stack min-w-[220px]">
                        <span className="field-label">Competência de acompanhamento</span>
                        <span className="field-control field-control--icon"><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></span>
                      </label>
                      <button className="rounded-2xl bg-emerald-400 text-slate-950 px-5 py-3 font-extrabold hover:bg-emerald-300 transition" onClick={openNewGoal}>Nova meta</button>
                    </div>
                  </div>
                  <div className="p-6 space-y-6">
                    {!activeGoals.length ? <div className="empty-state">Nenhuma meta cadastrada. Crie um objetivo para acompanhar o valor mensal necessário.</div> : null}
                    {activeGoals.map((goal) => {
                      const status = goalStatusPresentation(goal.status);
                      return (
                        <article key={goal.id} className="rounded-[1.8rem] border border-slate-800/80 bg-slate-950/35 p-5">
                          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-5">
                            <div>
                              <div className="flex items-center gap-3 flex-wrap">
                                <h3 className="text-xl font-extrabold text-slate-50">{goal.title}</h3>
                                <span className={`status-pill ${status.className}`}>{status.label}</span>
                              </div>
                              <div className="mt-2 text-sm text-slate-400">Objetivo até {formatMonthLabel(goal.target_date.slice(0, 7))}. Guardado {formatCurrency(goal.total_saved)} de {formatCurrency(goal.target_amount)}.</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button className="icon-button rounded-xl border border-slate-700 p-2 hover:bg-slate-900/70 transition" onClick={() => openEditGoal(goal)}><Pencil className="w-4 h-4" /></button>
                              <button className="icon-button rounded-xl border border-rose-400/30 p-2 text-rose-200 hover:bg-rose-400/10 transition" onClick={() => handleDeleteGoal(goal)}><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </div>

                          <div className="mt-5 grid md:grid-cols-2 xl:grid-cols-5 gap-4">
                            <div className="rounded-2xl border border-slate-800/80 bg-slate-950/35 px-4 py-4"><div className="text-[0.65rem] font-black uppercase tracking-[0.22em] text-slate-500">Aporte mensal</div><div className="mt-2 text-lg font-extrabold text-emerald-300">{formatCurrency(goal.monthly_target)}</div></div>
                            <div className="rounded-2xl border border-slate-800/80 bg-slate-950/35 px-4 py-4"><div className="text-[0.65rem] font-black uppercase tracking-[0.22em] text-slate-500">Restante</div><div className="mt-2 text-lg font-extrabold text-slate-100">{formatCurrency(goal.remaining_amount)}</div></div>
                            <div className="rounded-2xl border border-slate-800/80 bg-slate-950/35 px-4 py-4"><div className="text-[0.65rem] font-black uppercase tracking-[0.22em] text-slate-500">Gap</div><div className={`mt-2 text-lg font-extrabold ${Number(goal.gap_amount) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{formatCurrency(goal.gap_amount)}</div></div>
                            <div className="rounded-2xl border border-slate-800/80 bg-slate-950/35 px-4 py-4"><div className="text-[0.65rem] font-black uppercase tracking-[0.22em] text-slate-500">Meses restantes</div><div className="mt-2 text-lg font-extrabold text-slate-100">{goal.months_remaining}</div></div>
                            <div className="rounded-2xl border border-slate-800/80 bg-slate-950/35 px-4 py-4"><div className="text-[0.65rem] font-black uppercase tracking-[0.22em] text-slate-500">Progresso</div><div className="mt-2 text-lg font-extrabold text-sky-300">{Number(goal.progress_percent).toFixed(2)}%</div></div>
                          </div>

                          <div className="mt-5 grid xl:grid-cols-[0.9fr_1.1fr] gap-5 items-start">
                            <div className="rounded-[1.6rem] border border-slate-800/80 bg-slate-950/30 p-4">
                                <div className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Investimento da competência</div>
                                <div className="mt-2 text-sm text-slate-400">Para avançar nessa meta em {formatMonthLabel(month)}, crie um lançamento do tipo investimento e vincule-o a este objetivo.</div>
                                <div className="mt-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                                  <div>
                                    <div className="text-[0.65rem] font-black uppercase tracking-[0.22em] text-slate-500">Registrado na competência</div>
                                    <div className="mt-2 text-xl font-extrabold text-cyan-300">{formatCurrency(goal.current_month_amount)}</div>
                                  </div>
                                  <button type="button" className="rounded-2xl bg-sky-500 px-5 py-4 font-extrabold text-slate-950 hover:bg-sky-400 transition" onClick={() => openNewInvestmentForGoal(goal)}>Lançar investimento</button>
                                </div>
                                <div className="mt-4 text-sm text-slate-400">Ideal acumulado até agora: <strong className="text-slate-200">{formatCurrency(goal.expected_saved)}</strong>. O acompanhamento desta meta é feito somente pelos lançamentos vinculados.</div>
                            </div>
                            <div className="rounded-[1.6rem] border border-slate-800/80 bg-slate-950/30 p-4">
                              <div className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Ritmo da meta</div>
                              <div className="mt-2 text-sm text-slate-400">Comparação entre acumulado ideal e acumulado real ao longo do prazo da meta.</div>
                              <div className="mt-4"><GoalProgressChart goal={goal} /></div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {currentView === 'ADMIN_USERS' ? (
                <section className="card rounded-[2rem] overflow-hidden admin-section">
                  <div className="px-6 py-5 border-b border-slate-800/80 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"><div><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Admin</div><div className="text-xl font-extrabold">Gestão de usuários</div></div><button className="rounded-2xl bg-emerald-400 text-slate-950 px-5 py-3 font-extrabold hover:bg-emerald-300 transition" onClick={() => setShowUserModal(true)}>Novo usuário</button></div>
                  <div className="overflow-x-auto"><table className="w-full text-left min-w-[720px]"><thead className="bg-slate-900/60 text-[0.65rem] uppercase tracking-[0.25em] text-slate-500"><tr><th className="px-6 py-4">Usuário</th><th className="px-6 py-4">Perfil</th><th className="px-6 py-4">Troca obrigatória</th><th className="px-6 py-4 text-right">Ações</th></tr></thead><tbody className="divide-y divide-slate-800/80 text-sm">{users.map((targetUser) => <tr key={targetUser.id}><td className="px-6 py-4 font-bold">{targetUser.username}</td><td className="px-6 py-4">{targetUser.is_admin ? 'Administrador' : 'Usuário'}</td><td className="px-6 py-4">{targetUser.must_change_password ? 'Sim' : 'Não'}</td><td className="px-6 py-4 text-right"><button className="rounded-xl border border-amber-400/30 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-amber-200 hover:bg-amber-400/10 transition" onClick={() => handleResetUserPassword(targetUser)}>Resetar senha</button></td></tr>)}</tbody></table></div>
                </section>
              ) : null}

              {currentView === 'ADMIN_CATEGORIES' ? (
                <section className="card rounded-[2rem] overflow-hidden admin-section">
                  <div className="px-6 py-5 border-b border-slate-800/80"><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Admin</div><div className="text-xl font-extrabold">Categorias</div></div>
                  <div className="p-6 border-b border-slate-800/80">
                    <form className="grid md:grid-cols-[1fr_1.2fr_auto_auto] gap-4 items-end" onSubmit={handleSubmitCategory}>
                      <label className="field-stack"><span className="field-label">Tipo</span><span className="field-control field-control--select"><select value={categoryForm.type} disabled={Boolean(categoryForm.id)} onChange={(event) => setCategoryForm((current) => ({ ...current, type: event.target.value }))}>{TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></span></label>
                      <label className="field-stack"><span className="field-label">Nome da categoria</span><span className="field-control"><input value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} type="text" required placeholder="Ex: Transporte" /></span></label>
                      <button type="submit" className="rounded-2xl bg-sky-500 px-5 py-3 font-extrabold text-slate-950 hover:bg-sky-400 transition">{categoryForm.id ? 'Atualizar categoria' : 'Salvar categoria'}</button>
                      {categoryForm.id ? <button type="button" className="rounded-2xl border border-slate-700 px-5 py-3 font-bold text-slate-200 hover:bg-slate-900/70 transition" onClick={() => setCategoryForm({ id: '', type: 'ENTRADA', name: '' })}>Cancelar edição</button> : null}
                    </form>
                    {categoryError ? <p className="mt-4 text-sm text-rose-300">{categoryError}</p> : null}
                  </div>
                  <div className="overflow-x-auto"><table className="w-full text-left min-w-[720px]"><thead className="bg-slate-900/60 text-[0.65rem] uppercase tracking-[0.25em] text-slate-500"><tr><th className="px-6 py-4">Tipo</th><th className="px-6 py-4">Categoria</th><th className="px-6 py-4 text-right">Ações</th></tr></thead><tbody className="divide-y divide-slate-800/80 text-sm">{adminCategories.map((category) => <tr key={category.id}><td className="px-6 py-4"><div className="font-bold text-slate-100">{TYPE_LABELS[category.type]}</div><div className="mt-1"><span className={`category-status ${category.is_active ? 'category-status--active' : 'category-status--inactive'}`}>{category.is_active ? 'Ativa' : 'Inativa'}</span></div></td><td className="px-6 py-4 text-slate-200">{category.name}</td><td className="px-6 py-4"><div className="flex flex-wrap items-center justify-end gap-2"><button className="icon-button rounded-xl border border-slate-700 p-2 hover:bg-slate-900/70 transition" onClick={() => setCategoryForm({ id: category.id, type: category.type, name: category.name })}><Pencil className="w-4 h-4" /></button><button className={`rounded-xl border ${category.is_active ? 'border-amber-400/30 text-amber-200 hover:bg-amber-400/10' : 'border-emerald-400/30 text-emerald-200 hover:bg-emerald-400/10'} px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] transition`} onClick={() => handleToggleCategory(category, !category.is_active)}>{category.is_active ? 'Inativar' : 'Reativar'}</button><button className="icon-button rounded-xl border border-rose-400/30 p-2 text-rose-200 hover:bg-rose-400/10 transition" onClick={() => handleDeleteCategory(category)}><Trash2 className="w-4 h-4" /></button></div></td></tr>)}</tbody></table></div>
                </section>
              ) : null}

              {currentView === 'NOTIFICATIONS' ? (
                <section className="card rounded-[2rem] overflow-hidden admin-section">
                  <div className="px-6 py-5 border-b border-slate-800/80"><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Conta</div><div className="text-xl font-extrabold">Preferências do usuário</div><div className="mt-2 text-sm text-slate-400">As preferências abaixo valem apenas para o usuário <strong>{user.username}</strong> e não alteram as metas financeiras cadastradas.</div></div>
                  <div className="p-6 space-y-8">
                    <div className="rounded-[1.6rem] border border-slate-800/80 bg-slate-950/30 p-5">
                      <div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Planejamento pessoal</div>
                      <div className="mt-2 text-xl font-extrabold">Piso mínimo para investir</div>
                      <div className="mt-2 text-sm text-slate-400">Esse percentual define quanto da receita da competência deve continuar disponível para investimento. O destaque do dashboard usa esse piso para sinalizar meses mais apertados.</div>
                      <form className="mt-5 grid md:grid-cols-[minmax(0,18rem)_auto] gap-4 items-end" onSubmit={handleSubmitFinancialPreferences}>
                        <label className="field-stack"><span className="field-label">Piso mínimo (% da receita)</span><span className="field-control"><input value={financialPreferences.investment_floor_percent ?? DEFAULT_INVESTMENT_FLOOR_PERCENT} onChange={(event) => setFinancialPreferences((current) => ({ ...current, investment_floor_percent: Number(event.target.value || DEFAULT_INVESTMENT_FLOOR_PERCENT) }))} type="number" min="0" max="100" step="1" /></span></label>
                        <button type="submit" className="rounded-2xl bg-sky-500 px-5 py-3 font-extrabold text-slate-950 hover:bg-sky-400 transition">Salvar piso</button>
                      </form>
                      {financialPreferencesError ? <p className="mt-4 text-sm text-rose-300">{financialPreferencesError}</p> : null}
                    </div>

                    <div className="rounded-[1.6rem] border border-slate-800/80 bg-slate-950/30 p-5">
                      <div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Notificações</div>
                      <div className="mt-2 text-xl font-extrabold">Configuração de notificações</div>
                      <div className="mt-2 text-sm text-slate-400">O disparo considera apenas os lançamentos deste usuário.</div>
                    <form className="grid md:grid-cols-2 gap-4" onSubmit={handleSubmitNotificationSettings}>
                      <label className="field-stack md:col-span-2"><span className="field-label">Destinatários de e-mail</span><span className="field-control"><input value={notificationSettings.email_to || ''} onChange={(event) => setNotificationSettings((current) => ({ ...current, email_to: event.target.value }))} type="text" placeholder="email1@dominio.com,email2@dominio.com" /></span></label>
                      <label className="field-stack"><span className="field-label">Remetente</span><span className="field-control"><input value={notificationSettings.email_from || ''} onChange={(event) => setNotificationSettings((current) => ({ ...current, email_from: event.target.value }))} type="email" /></span></label>
                      <label className="field-stack"><span className="field-label">SMTP Host</span><span className="field-control"><input value={notificationSettings.smtp_host || ''} onChange={(event) => setNotificationSettings((current) => ({ ...current, smtp_host: event.target.value }))} type="text" /></span></label>
                      <label className="field-stack"><span className="field-label">SMTP Port</span><span className="field-control"><input value={notificationSettings.smtp_port || 587} onChange={(event) => setNotificationSettings((current) => ({ ...current, smtp_port: Number(event.target.value || 587) }))} type="number" min="1" max="65535" /></span></label>
                      <label className="field-stack"><span className="field-label">Usuário SMTP</span><span className="field-control"><input value={notificationSettings.smtp_user || ''} onChange={(event) => setNotificationSettings((current) => ({ ...current, smtp_user: event.target.value }))} type="text" /></span></label>
                      <label className="field-stack md:col-span-2"><span className="field-label">Senha SMTP</span><span className="field-control"><input value={notificationSettings.smtp_password || ''} onChange={(event) => setNotificationSettings((current) => ({ ...current, smtp_password: event.target.value }))} type="password" /></span></label>
                      <label className="field-stack"><span className="field-label">Intervalo do scheduler (min)</span><span className="field-control"><input value={notificationSettings.poll_minutes || 60} onChange={(event) => setNotificationSettings((current) => ({ ...current, poll_minutes: Number(event.target.value || 60) }))} type="number" min="1" max="1440" /></span></label>
                      <div className="grid gap-3 md:pt-6">
                        <label className="flex items-center gap-3 text-sm text-slate-300"><input checked={Boolean(notificationSettings.email_enabled)} onChange={(event) => setNotificationSettings((current) => ({ ...current, email_enabled: event.target.checked }))} type="checkbox" className="h-4 w-4 rounded border-slate-600 bg-slate-900" />Habilitar envio por e-mail</label>
                        <label className="flex items-center gap-3 text-sm text-slate-300"><input checked={Boolean(notificationSettings.scheduler_enabled)} onChange={(event) => setNotificationSettings((current) => ({ ...current, scheduler_enabled: event.target.checked }))} type="checkbox" className="h-4 w-4 rounded border-slate-600 bg-slate-900" />Habilitar disparo automático para este usuário</label>
                        <label className="flex items-center gap-3 text-sm text-slate-300"><input checked={Boolean(notificationSettings.smtp_starttls)} onChange={(event) => setNotificationSettings((current) => ({ ...current, smtp_starttls: event.target.checked }))} type="checkbox" className="h-4 w-4 rounded border-slate-600 bg-slate-900" />Usar STARTTLS</label>
                        <label className="flex items-center gap-3 text-sm text-slate-300"><input checked={Boolean(notificationSettings.smtp_ssl)} onChange={(event) => setNotificationSettings((current) => ({ ...current, smtp_ssl: event.target.checked }))} type="checkbox" className="h-4 w-4 rounded border-slate-600 bg-slate-900" />Usar SSL direto</label>
                      </div>
                      <div className="md:col-span-2 flex flex-col sm:flex-row gap-3 pt-4"><button type="button" className="rounded-2xl border border-amber-400/30 px-5 py-3 font-bold text-amber-200 hover:bg-amber-400/10 transition" onClick={handleDispatchNotifications}>Disparar agora</button><button type="submit" className="rounded-2xl bg-emerald-400 px-5 py-3 font-extrabold text-slate-950 hover:bg-emerald-300 transition">Salvar configuração</button></div>
                    </form>
                    {notificationSettingsError ? <p className="mt-4 text-sm text-rose-300">{notificationSettingsError}</p> : null}
                    </div>
                  </div>
                </section>
              ) : null}
            </section>
          )}
        </main>
      </div>

      <ModalShell open={showTransactionModal} onClose={() => setShowTransactionModal(false)}>
        <div className="flex items-center justify-between gap-4 mb-6"><div><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Lançamento</div><div className="text-2xl font-extrabold">Criar ou editar item</div></div><button className="icon-button rounded-2xl border border-slate-700 p-3 hover:bg-slate-900/70 transition" onClick={() => setShowTransactionModal(false)}><X className="w-5 h-5" /></button></div>
        <form className="grid md:grid-cols-2 gap-4" onSubmit={handleSubmitTransaction}>
          <label className="field-stack md:col-span-2"><span className="field-label">Descrição do item</span><span className="field-control"><input value={transactionForm.description} onChange={(event) => setTransactionForm((current) => ({ ...current, description: event.target.value }))} type="text" required placeholder="Ex: Parcela da casa" /></span></label>
          <label className="field-stack"><span className="field-label">Competência</span><span className="field-control field-control--icon"><input value={transactionForm.competence} onChange={(event) => setTransactionForm((current) => ({ ...current, competence: event.target.value }))} type="month" required /></span></label>
          <label className="field-stack"><span className="field-label">Vencimento</span><span className="field-control field-control--icon"><input value={transactionForm.dueDate} onChange={(event) => setTransactionForm((current) => ({ ...current, dueDate: event.target.value }))} type="date" /></span></label>
          <label className="field-stack"><span className="field-label">Valor (R$)</span><span className="field-control field-control--currency"><span className="field-prefix">R$</span><input value={transactionForm.amount} onChange={(event) => setTransactionForm((current) => ({ ...current, amount: formatCurrencyInput(event.target.value) }))} type="text" inputMode="decimal" required placeholder="0,00" /></span></label>
          <label className="field-stack"><span className="field-label">Tipo</span><span className="field-control field-control--select"><select value={transactionForm.type} onChange={(event) => setTransactionForm((current) => ({ ...current, type: event.target.value, isRecurring: event.target.value === 'ENTRADA' || event.target.value === 'FIXO', goalId: event.target.value === 'INVESTIMENTO' ? current.goalId : '' }))}>{TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></span></label>
          <label className="field-stack"><span className="field-label">Categoria</span><span className="field-control field-control--select"><select value={transactionForm.category} onChange={(event) => setTransactionForm((current) => ({ ...current, category: event.target.value }))}>{categories.filter((item) => item.type === transactionForm.type).map((item) => <option key={`${item.type}-${item.name}`} value={item.name}>{item.name}</option>)}</select></span></label>
          {transactionForm.type === 'INVESTIMENTO' ? <label className="field-stack md:col-span-2"><span className="field-label">Meta vinculada (opcional)</span><span className="field-control field-control--select"><select value={transactionForm.goalId} onChange={(event) => setTransactionForm((current) => ({ ...current, goalId: event.target.value }))}><option value="">Não vincular a meta</option>{activeGoals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></span></label> : null}
          {!transactionForm.id ? <label className="flex items-center gap-3 pt-3 md:col-span-2"><input checked={transactionForm.isRecurring} onChange={(event) => setTransactionForm((current) => ({ ...current, isRecurring: event.target.checked }))} type="checkbox" className="h-4 w-4 rounded border-slate-600 bg-slate-900" />Repetir mensalmente a partir desta data</label> : null}
          {transactionForm.id && transactionForm.planId ? (
            <div className="md:col-span-2 rounded-2xl border border-slate-800/80 bg-slate-950/35 px-4 py-4">
              <div className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Escopo da alteração</div>
              <div className="mt-3 grid gap-3">
                <div className={`rounded-2xl border px-4 py-3 ${transactionForm.applyToPlan ? 'border-slate-800/80 bg-slate-950/20' : 'border-sky-500/30 bg-sky-500/10'}`}>
                  <label className="flex items-start gap-3 text-sm text-slate-300"><input checked={!transactionForm.applyToPlan} onChange={() => setTransactionForm((current) => ({ ...current, applyToPlan: false }))} type="radio" name="transaction-scope" className="mt-1 h-4 w-4" />Ajuste pontual desta competência. Use quando este mês for exceção e a série recorrente precisar continuar como está.</label>
                </div>
                <div className={`rounded-2xl border px-4 py-3 ${transactionForm.applyToPlan ? 'border-sky-500/30 bg-sky-500/10' : 'border-slate-800/80 bg-slate-950/20'}`}>
                  <label className="flex items-start gap-3 text-sm text-slate-300"><input checked={transactionForm.applyToPlan} onChange={() => setTransactionForm((current) => ({ ...current, applyToPlan: true }))} type="radio" name="transaction-scope" className="mt-1 h-4 w-4" />Atualizar o cadastro da série daqui para frente. Reaplica descrição, categoria, tipo, valor, vencimento e meta nos próximos lançamentos já gerados e nos novos.</label>
                </div>
              </div>
            </div>
          ) : null}
          <div className="flex items-center gap-3 pt-3 md:col-span-2"><input checked={transactionForm.isPaid} onChange={(event) => setTransactionForm((current) => ({ ...current, isPaid: event.target.checked }))} type="checkbox" className="h-4 w-4 rounded border-slate-600 bg-slate-900" /><label className="text-sm text-slate-300">Marcar como liquidado</label></div>
          <div className="md:col-span-2 pt-6 flex flex-col sm:flex-row gap-3"><button type="button" className="flex-1 rounded-2xl border border-slate-700 px-5 py-4 font-bold hover:bg-slate-900/70 transition" onClick={() => setShowTransactionModal(false)}>Cancelar</button><button type="submit" className="flex-[1.4] rounded-2xl bg-sky-500 px-5 py-4 font-extrabold text-slate-950 hover:bg-sky-400 transition">Salvar lançamento</button></div>
        </form>
        {transactionError ? <p className="mt-4 text-sm text-rose-300">{transactionError}</p> : null}
      </ModalShell>

      <ModalShell open={showGoalModal} onClose={() => setShowGoalModal(false)} maxWidth="max-w-xl">
        <div className="flex items-center justify-between gap-4 mb-6"><div><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Meta</div><div className="text-2xl font-extrabold">Criar ou editar objetivo</div></div><button className="icon-button rounded-2xl border border-slate-700 p-3 hover:bg-slate-900/70 transition" onClick={() => setShowGoalModal(false)}><X className="w-5 h-5" /></button></div>
        <form className="space-y-4" onSubmit={handleSubmitGoal}>
          <label className="field-stack"><span className="field-label">Objetivo</span><span className="field-control"><input value={goalForm.title} onChange={(event) => setGoalForm((current) => ({ ...current, title: event.target.value }))} type="text" required placeholder="Ex: Troca de veículo" /></span></label>
          <label className="field-stack"><span className="field-label">Valor alvo (R$)</span><span className="field-control field-control--currency"><span className="field-prefix">R$</span><input value={goalForm.targetAmount} onChange={(event) => setGoalForm((current) => ({ ...current, targetAmount: formatCurrencyInput(event.target.value) }))} type="text" inputMode="decimal" required placeholder="0,00" /></span></label>
          <div className="grid md:grid-cols-2 gap-4">
            <label className="field-stack"><span className="field-label">Início do plano</span><span className="field-control field-control--icon"><input value={goalForm.startMonth} onChange={(event) => setGoalForm((current) => ({ ...current, startMonth: event.target.value }))} type="month" required /></span></label>
            <label className="field-stack"><span className="field-label">Mês alvo</span><span className="field-control field-control--icon"><input value={goalForm.targetMonth} onChange={(event) => setGoalForm((current) => ({ ...current, targetMonth: event.target.value }))} type="month" required /></span></label>
          </div>
          <label className="flex items-center gap-3 text-sm text-slate-300"><input checked={goalForm.isActive} onChange={(event) => setGoalForm((current) => ({ ...current, isActive: event.target.checked }))} type="checkbox" className="h-4 w-4 rounded border-slate-600 bg-slate-900" />Meta ativa</label>
          <div className="flex items-center gap-3 rounded-2xl border border-sky-500/15 bg-sky-500/10 px-4 py-4 text-sm text-slate-200"><Target className="w-4 h-4 text-sky-300" />A recomendação mensal é recalculada automaticamente conforme você registra os aportes de cada competência.</div>
          <div className="pt-6 flex flex-col sm:flex-row gap-3"><button type="button" className="flex-1 rounded-2xl border border-slate-700 px-5 py-4 font-bold hover:bg-slate-900/70 transition" onClick={() => setShowGoalModal(false)}>Cancelar</button><button type="submit" className="flex-[1.4] rounded-2xl bg-emerald-400 px-5 py-4 font-extrabold text-slate-950 hover:bg-emerald-300 transition">Salvar meta</button></div>
        </form>
        {goalError ? <p className="mt-4 text-sm text-rose-300">{goalError}</p> : null}
      </ModalShell>

      <ModalShell open={showUserModal} onClose={() => setShowUserModal(false)} maxWidth="max-w-xl">
        <div className="flex items-center justify-between gap-4 mb-6"><div><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Admin</div><div className="text-2xl font-extrabold">Novo usuário</div></div><button className="icon-button rounded-2xl border border-slate-700 p-3 hover:bg-slate-900/70 transition" onClick={() => setShowUserModal(false)}><X className="w-5 h-5" /></button></div>
        <form className="space-y-4" onSubmit={handleSubmitUser}>
          <label className="field-stack"><span className="field-label">Usuário</span><span className="field-control"><input value={userForm.username} onChange={(event) => setUserForm((current) => ({ ...current, username: event.target.value }))} type="text" required minLength={3} /></span></label>
          <label className="field-stack"><span className="field-label">Senha inicial</span><span className="field-control"><input value={userForm.password} onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))} type="password" required minLength={6} /></span></label>
          <label className="flex items-center gap-3 text-sm text-slate-300"><input checked={userForm.isAdmin} onChange={(event) => setUserForm((current) => ({ ...current, isAdmin: event.target.checked }))} type="checkbox" className="h-4 w-4 rounded border-slate-600 bg-slate-900" />Criar como administrador</label>
          <div className="pt-6 flex flex-col sm:flex-row gap-3"><button type="button" className="flex-1 rounded-2xl border border-slate-700 px-5 py-4 font-bold hover:bg-slate-900/70 transition" onClick={() => setShowUserModal(false)}>Cancelar</button><button type="submit" className="flex-[1.4] rounded-2xl bg-emerald-400 px-5 py-4 font-extrabold text-slate-950 hover:bg-emerald-300 transition">Criar usuário</button></div>
        </form>
        {userError ? <p className="mt-4 text-sm text-rose-300">{userError}</p> : null}
      </ModalShell>

      <ModalShell open={showAlertsModal} onClose={() => setShowAlertsModal(false)}>
        <div className="flex items-center justify-between gap-4 mb-6"><div><div className="text-xs font-black uppercase tracking-[0.25em] text-amber-300">Notificações</div><div className="text-2xl font-extrabold">Alertas de vencimento</div><p className="mt-2 text-sm text-slate-400">{alerts.length ? `${alerts.length} alerta(s) de vencimento exigindo atenção.` : 'Nenhum alerta crítico no momento.'}</p></div><button className="icon-button rounded-2xl border border-slate-700 p-3 hover:bg-slate-900/70 transition" onClick={() => setShowAlertsModal(false)}><X className="w-5 h-5" /></button></div>
        <div className="alerts-list">{!alerts.length ? <div className="alerts-empty">Nenhum vencimento pendente dentro da janela crítica de 3 dias.</div> : alerts.map((alert) => <article key={alert.id} className={`alert-row alert-row--${alert.level}`}><div className="alert-row__header"><div className="alert-row__title">{alert.title}</div><div className="alert-row__meta">{alert.badge}</div></div><div className="alert-row__copy">{alert.message} Categoria: {alert.category}. Valor previsto: {formatCurrency(alert.amount)}.</div></article>)}</div>
      </ModalShell>

      <ConfirmModal
        open={confirmDialog.open}
        onClose={closeConfirmDialog}
        onConfirm={handleConfirmDialogAction}
        title={confirmDialog.title}
        eyebrow={confirmDialog.eyebrow}
        description={confirmDialog.description}
        confirmLabel={confirmDialog.confirmLabel}
        tone={confirmDialog.tone}
        busy={confirmBusy}
      />

      {toast ? <div className="fixed bottom-4 right-4 z-[60] rounded-2xl border border-slate-700 bg-slate-950/90 px-5 py-4 text-sm text-slate-100 shadow-2xl">{toast}</div> : null}
    </>
  );
}


function CategoryAreaChart({ hidden, analytics, projection, investmentFloorPercent }) {
  const chartRef = useRef(null);
  const isPhoneViewport = useMediaQuery('(max-width: 640px)');
  const isCompactViewport = useMediaQuery('(max-width: 1366px)');

  useEffect(() => {
    if (hidden || !chartRef.current || !analytics.categories.length || !projection.length) return undefined;

    const topCategorySeries = buildTopCategorySeries(analytics.categories, isPhoneViewport ? 3 : isCompactViewport ? 4 : 5);
    const incomeByMonth = new Map(projection.map((item) => [item.month, Number(item.income_total || 0)]));
    const expenseTotals = analytics.months.map((month) => topCategorySeries.reduce((sum, series) => {
      const targetMonth = series.months.find((item) => item.month === month);
      return sum + Number(targetMonth?.total || 0);
    }, 0));
    const availableTotals = analytics.months.map((month, index) => (incomeByMonth.get(month) || 0) - expenseTotals[index]);
    const availablePercentages = analytics.months.map((month, index) => {
      const incomeTotal = incomeByMonth.get(month) || 0;
      return incomeTotal > 0 ? (availableTotals[index] / incomeTotal) * 100 : 0;
    });
    const criticalMonthFlags = analytics.months.map((month, index) => availablePercentages[index] < investmentFloorPercent);

    const incomeBaseDataset = {
      type: 'bar',
      label: 'Receita da competência',
      data: analytics.months.map((month, index) => [0, incomeByMonth.get(month) || 0]),
      backgroundColor: analytics.months.map(() => 'rgba(34, 197, 94, 0.42)'),
      borderColor: analytics.months.map((month, index) => (availablePercentages[index] < investmentFloorPercent ? '#facc15' : '#22c55e')),
      borderWidth: analytics.months.map((month, index) => (availablePercentages[index] < investmentFloorPercent ? 2.5 : 1.5)),
      borderRadius: 10,
      borderSkipped: false,
      grouped: false,
      order: 20,
    };

    let cumulativeTotals = analytics.months.map(() => 0);
    const expenseDatasets = topCategorySeries.map((series, index) => {
      const seriesValues = analytics.months.map((month) => {
        const targetMonth = series.months.find((item) => item.month === month);
        return Number(targetMonth?.total || 0);
      });
      const dataset = {
        type: 'bar',
        label: `${series.category} (custos)`,
        data: seriesValues.map((value, valueIndex) => {
          const start = cumulativeTotals[valueIndex];
          const end = start + value;
          return [start, end];
        }),
        borderColor: EXPENSE_RED_SCALE[index % EXPENSE_RED_SCALE.length],
        backgroundColor: EXPENSE_RED_SCALE[index % EXPENSE_RED_SCALE.length],
        borderRadius: 8,
        borderSkipped: false,
        grouped: false,
        order: 5,
      };
      cumulativeTotals = cumulativeTotals.map((current, currentIndex) => current + seriesValues[currentIndex]);
      return dataset;
    });

    const criticalMonthPlugin = {
      id: 'criticalMonthPlugin',
      afterDatasetsDraw(chartInstance) {
        const meta = chartInstance.getDatasetMeta(0);
        const { ctx } = chartInstance;

        meta.data.forEach((element, index) => {
          if (!criticalMonthFlags[index]) return;

          const properties = element.getProps(['x', 'y', 'base', 'width', 'height'], true);
          const left = properties.x - (properties.width / 2);
          const right = properties.x + (properties.width / 2);
          const top = Math.min(properties.y, properties.base);
          const bottom = Math.max(properties.y, properties.base);
          const width = right - left;
          const height = bottom - top;

          ctx.save();
          ctx.shadowColor = 'rgba(250, 204, 21, 0.4)';
          ctx.shadowBlur = 18;
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#facc15';
          ctx.strokeRect(left - 2, top - 2, width + 4, height + 4);
          ctx.restore();

          const badgeText = 'Piso comprometido';
          ctx.save();
          ctx.font = '700 11px sans-serif';
          const textWidth = ctx.measureText(badgeText).width;
          const badgeWidth = textWidth + 18;
          const badgeHeight = 24;
          const badgeX = properties.x - (badgeWidth / 2);
          const badgeY = top - 30;

          ctx.fillStyle = 'rgba(15, 23, 42, 0.96)';
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 999);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#fde68a';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(badgeText, badgeX + (badgeWidth / 2), badgeY + (badgeHeight / 2) + 0.5);
          ctx.restore();
        });
      },
    };

    const chart = new Chart(chartRef.current, {
      type: 'bar',
      plugins: [criticalMonthPlugin],
      data: {
        labels: analytics.months.map((item) => formatMonthLabel(item)),
        datasets: [
          incomeBaseDataset,
          ...expenseDatasets,
        ],
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#cbd5e1',
              boxWidth: isPhoneViewport ? 8 : 12,
              usePointStyle: true,
              font: { size: isPhoneViewport ? 10 : isCompactViewport ? 11 : 12 },
              padding: isPhoneViewport ? 10 : 14,
            },
          },
          tooltip: {
            callbacks: {
              label(context) {
                const monthIndex = context.dataIndex;
                const incomeTotal = incomeByMonth.get(analytics.months[monthIndex]) || 0;
                const available = availableTotals[monthIndex];
                const availablePercent = availablePercentages[monthIndex];
                if (context.dataset.label === 'Receita da competência') {
                  const status = availablePercent < investmentFloorPercent ? 'abaixo do piso' : 'acima do piso';
                  return `${context.dataset.label}: ${formatCurrency(incomeTotal)} | Disponível para investir: ${formatCurrency(available)} (${availablePercent.toFixed(1)}%, ${status})`;
                }
                const value = Array.isArray(context.raw) ? Number(context.raw[1]) - Number(context.raw[0]) : Number(context.raw || 0);
                const expensePercent = incomeTotal > 0 ? (value / incomeTotal) * 100 : 0;
                return `${context.dataset.label}: ${formatCurrency(value)} (${expensePercent.toFixed(1)}% da receita) | Disponível p/ investir: ${formatCurrency(available)} (${availablePercent.toFixed(1)}%)`;
              },
            },
          },
        },
        scales: {
          y: {
            ticks: { color: '#64748b', font: { size: isPhoneViewport ? 10 : 11 } },
            grid: { color: 'rgba(148, 163, 184, 0.1)' },
          },
          x: {
            ticks: {
              color: '#64748b',
              font: { size: isPhoneViewport ? 10 : 11 },
              autoSkip: true,
              maxTicksLimit: isPhoneViewport ? 4 : 6,
              maxRotation: isPhoneViewport ? 28 : 0,
              minRotation: isPhoneViewport ? 28 : 0,
            },
            grid: { display: false },
          },
        },
      },
    });

    return () => {
      chart.destroy();
    };
  }, [hidden, analytics, projection, investmentFloorPercent, isPhoneViewport, isCompactViewport]);

  if (hidden) return null;

  const topCategorySeries = buildTopCategorySeries(analytics.categories, isPhoneViewport ? 3 : isCompactViewport ? 4 : 5);
  const availablePercentages = projection.map((item) => {
    const incomeTotal = Number(item.income_total || 0);
    const available = incomeTotal - Number(item.fixed_total || 0) - Number(item.variable_total || 0);
    return incomeTotal > 0 ? (available / incomeTotal) * 100 : 0;
  });
  const averageAvailablePercent = availablePercentages.length ? availablePercentages.reduce((sum, item) => sum + item, 0) / availablePercentages.length : 0;
  const monthsBelowTarget = projection.filter((item) => {
    const incomeTotal = Number(item.income_total || 0);
    if (incomeTotal <= 0) return false;
    return incomeTotal - Number(item.fixed_total || 0) - Number(item.variable_total || 0) < incomeTotal * (investmentFloorPercent / 100);
  }).length;

  return (
    <section className="card rounded-[2rem] p-6 chart-card">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Saúde financeira</div>
          <div className="text-xl font-extrabold">Receita protegida x consumo das despesas</div>
          <p className="mt-2 text-sm text-slate-400">A barra de fundo representa toda a receita da competência. As faixas internas mostram os 5 maiores grupos de despesa consumindo essa base, e o topo final mostra quanto ainda fica disponível para investir.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:min-w-[30rem]">
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/40 px-4 py-3 text-right">
            <div className="text-[0.65rem] font-black uppercase tracking-[0.25em] text-slate-500">Disponível médio 6m</div>
            <div className={`mt-2 text-lg font-extrabold ${averageAvailablePercent >= investmentFloorPercent ? 'text-emerald-300' : 'text-amber-200'}`}>{averageAvailablePercent.toFixed(1)}%</div>
            <div className="mt-1 text-sm text-slate-400">Parcela média da receita ainda preservada para investir.</div>
          </div>
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/40 px-4 py-3 text-right">
            <div className="text-[0.65rem] font-black uppercase tracking-[0.25em] text-slate-500">Piso configurado</div>
            <div className="mt-2 text-lg font-extrabold text-slate-50">{investmentFloorPercent.toFixed(0)}%</div>
            <div className="mt-1 text-sm text-slate-400">Percentual mínimo de receita que deve sobrar para investir.</div>
          </div>
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/40 px-4 py-3 text-right">
            <div className="text-[0.65rem] font-black uppercase tracking-[0.25em] text-slate-500">Meses abaixo do piso</div>
            <div className={`mt-2 text-lg font-extrabold ${monthsBelowTarget ? 'text-amber-200' : 'text-emerald-300'}`}>{monthsBelowTarget}/{projection.length}</div>
            <div className="mt-1 text-sm text-slate-400">{monthsBelowTarget ? 'Essas competências devem ser revistas antes de comprometer novos gastos.' : 'Toda a projeção preserva o piso configurado.'}</div>
          </div>
        </div>
      </div>
      {!topCategorySeries.length || !projection.length ? <div className="empty-state">Sem histórico suficiente para montar a leitura de saúde financeira.</div> : <canvas ref={chartRef} className="chart-canvas chart-canvas--bar" />}
    </section>
  );
}


function GoalProgressChart({ goal }) {
  const chartRef = useRef(null);
  const isPhoneViewport = useMediaQuery('(max-width: 640px)');

  useEffect(() => {
    if (!chartRef.current || !goal.chart.length) return undefined;

    const chart = new Chart(chartRef.current, {
      type: 'line',
      data: {
        labels: goal.chart.map((item) => formatMonthLabel(item.month)),
        datasets: [
          {
            label: 'Ideal acumulado',
            data: goal.chart.map((item) => Number(item.planned_cumulative)),
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.12)',
            tension: 0.35,
            fill: false,
            pointRadius: 2,
          },
          {
            label: 'Real acumulado',
            data: goal.chart.map((item) => Number(item.actual_cumulative)),
            borderColor: goal.status === 'atrasada' ? '#fb7185' : '#34d399',
            backgroundColor: goal.status === 'atrasada' ? 'rgba(251, 113, 133, 0.16)' : 'rgba(52, 211, 153, 0.16)',
            tension: 0.35,
            fill: true,
            pointRadius: 2,
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#cbd5e1', boxWidth: isPhoneViewport ? 8 : 12, font: { size: isPhoneViewport ? 10 : 11 } },
          },
        },
        scales: {
          y: { ticks: { color: '#64748b', font: { size: isPhoneViewport ? 10 : 11 } }, grid: { color: 'rgba(148, 163, 184, 0.1)' } },
          x: { ticks: { color: '#64748b', font: { size: isPhoneViewport ? 10 : 11 }, autoSkip: true, maxTicksLimit: isPhoneViewport ? 4 : 6 }, grid: { display: false } },
        },
      },
    });

    return () => {
      chart.destroy();
    };
  }, [goal, isPhoneViewport]);

  if (!goal.chart.length) return null;

  return <canvas ref={chartRef} className="chart-canvas chart-canvas--bar" />;
}
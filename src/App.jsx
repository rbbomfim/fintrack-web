import { useEffect, useMemo, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import {
  Bell,
  KeyRound,
  LogOut,
  OctagonMinus,
  Pencil,
  ShieldCheck,
  Target,
  Trash2,
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


function emptyCategoryAnalytics() {
  return {
    months: [],
    categories: [],
    total_cost: '0.00',
  };
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


function ChartsSection({ hidden, income, paidExpenses, investments, projection, viewMode }) {
  const barRef = useRef(null);
  const pieRef = useRef(null);

  useEffect(() => {
    if (hidden || !barRef.current || !pieRef.current) return undefined;

    const isProjection = viewMode === 'projecao' && projection.length > 0;
    const labels = isProjection ? projection.map((item) => item.month) : ['Mês atual'];
    const incomeData = isProjection ? projection.map((item) => Number(item.income_total)) : [income];
    const expenseData = isProjection ? projection.map((item) => Number(item.fixed_total) + Number(item.variable_total)) : [paidExpenses];
    const investmentData = isProjection ? projection.map((item) => Number(item.investment_total)) : [investments];

    const barChart = new Chart(barRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Entradas', data: incomeData, backgroundColor: '#34d399', borderRadius: 10 },
          { label: 'Saídas', data: expenseData, backgroundColor: '#fb7185', borderRadius: 10 },
          { label: 'Investimentos', data: investmentData, backgroundColor: '#38bdf8', borderRadius: 10 },
        ],
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        plugins: { legend: { labels: { color: '#cbd5e1' } } },
        scales: {
          y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(148, 163, 184, 0.1)' } },
          x: { ticks: { color: '#64748b' }, grid: { display: false } },
        },
      },
    });

    const freeValue = Math.max(0, income - paidExpenses - investments);
    const pieChart = new Chart(pieRef.current, {
      type: 'doughnut',
      data: {
        labels: ['Gastos pagos', 'Investimentos', 'Livre'],
        datasets: [{ data: [paidExpenses, investments, freeValue], backgroundColor: ['#fb7185', '#38bdf8', '#22c55e'], borderWidth: 0 }],
      },
      options: {
        maintainAspectRatio: false,
        cutout: '76%',
        plugins: { legend: { position: 'bottom', labels: { color: '#cbd5e1', boxWidth: 12 } } },
      },
    });

    return () => {
      barChart.destroy();
      pieChart.destroy();
    };
  }, [hidden, income, paidExpenses, investments, projection, viewMode]);

  if (hidden) return null;

  return (
    <section id="visual-section" className="grid grid-cols-1 xl:grid-cols-[0.9fr_0.7fr] gap-6 visual-section-compact">
      <div className="card rounded-[2rem] p-6 chart-card chart-card--bar">
        <div className="mb-4">
          <div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Indicadores</div>
          <div className="text-xl font-extrabold">Entradas, saídas e aportes</div>
        </div>
        <canvas ref={barRef} className="chart-canvas chart-canvas--bar" />
      </div>
      <div className="card rounded-[2rem] p-6 chart-card chart-card--pie">
        <div className="mb-4">
          <div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Composição</div>
          <div className="text-xl font-extrabold">Distribuição do caixa</div>
        </div>
        <canvas ref={pieRef} className="chart-canvas chart-canvas--pie" />
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
          <div className="mt-6 rounded-3xl border border-amber-400/20 bg-amber-400/10 px-4 py-4 text-sm text-amber-100">
            <div className="font-bold uppercase tracking-[0.2em] text-[0.65rem]">Carga inicial</div>
            <p className="mt-2 leading-6">O primeiro acesso usa o usuário definido em <strong>.env</strong>. Por padrão: <strong>admin</strong> / <strong>admin123</strong>.</p>
          </div>
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


export default function App() {
  const todayMonth = new Date().toISOString().slice(0, 7);
  const storedSession = useMemo(() => getStoredSession(), []);
  const [token, setToken] = useState(storedSession.token);
  const [user, setUser] = useState(storedSession.user);
  const [currentView, setCurrentView] = useState('Dashboard');
  const [month, setMonth] = useState(todayMonth);
  const [viewMode, setViewMode] = useState('mensal');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [transactions, setTransactions] = useState([]);
  const [projection, setProjection] = useState([]);
  const [futureItems, setFutureItems] = useState([]);
  const [categoryAnalytics, setCategoryAnalytics] = useState(emptyCategoryAnalytics());
  const [goals, setGoals] = useState([]);
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [adminCategories, setAdminCategories] = useState([]);
  const [notificationSettings, setNotificationSettings] = useState(emptyNotificationSettings());
  const [toast, setToast] = useState('');
  const [loginError, setLoginError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [transactionError, setTransactionError] = useState('');
  const [userError, setUserError] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [goalError, setGoalError] = useState('');
  const [notificationSettingsError, setNotificationSettingsError] = useState('');
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
    if (user.is_admin) {
      requests.push(api('/admin/users'));
      requests.push(api('/admin/categories'));
    }

    const [transactionsResponse, projectionResponse, futureResponse, analyticsResponse, goalsResponse, categoriesResponse, settingsResponse, usersResponse, adminCategoriesResponse] = await Promise.all(requests);
    setTransactions(transactionsResponse.items);
    setProjection(projectionResponse.months.slice(0, 6));
    setFutureItems(futureResponse.items);
    setCategoryAnalytics(analyticsResponse);
    setGoals(goalsResponse.items);
    setCategories(categoriesResponse);
    setNotificationSettings({ ...emptyNotificationSettings(), ...settingsResponse });

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
    setCurrentView('Dashboard');
    setToast('Sessão finalizada');
  }

  const filteredTransactions = typeFilter === 'ALL'
    ? transactions
    : typeFilter === 'LINKED_INVESTMENTS'
      ? transactions.filter((item) => item.type === 'INVESTIMENTO' && item.goal_id)
      : transactions.filter((item) => item.type === typeFilter);

  const goalNameById = useMemo(
    () => Object.fromEntries(goals.map((goal) => [goal.id, goal.title])),
    [goals],
  );

  const income = transactions.filter((item) => item.type === 'ENTRADA').reduce((sum, item) => sum + Number(item.amount), 0);
  const totalExpenses = transactions.filter((item) => item.type === 'FIXO' || item.type === 'VARIAVEL').reduce((sum, item) => sum + Number(item.amount), 0);
  const paidExpenses = transactions.filter((item) => item.is_paid && (item.type === 'FIXO' || item.type === 'VARIAVEL')).reduce((sum, item) => sum + Number(item.amount), 0);
  const investments = transactions.filter((item) => item.type === 'INVESTIMENTO').reduce((sum, item) => sum + Number(item.amount), 0);
  const goalLinkedInvestments = transactions.filter((item) => item.type === 'INVESTIMENTO' && item.goal_id);
  const goalLinkedInvestmentsTotal = goalLinkedInvestments.reduce((sum, item) => sum + Number(item.amount), 0);
  const topFutureExpense = futureItems.filter((item) => item.type !== 'ENTRADA').sort((left, right) => Number(right.amount) - Number(left.amount))[0];
  const futureStatementItems = futureItems.filter((item) => item.type === 'VARIAVEL');
  const activeGoals = goals.filter((item) => item.is_active);

  if (!token || !user) {
    return <LoginScreen onSubmit={handleLogin} error={loginError} />;
  }

  return (
    <>
      <div className="min-h-screen md:grid md:grid-cols-[280px_1fr]">
        <aside className="border-b md:border-b-0 md:border-r border-slate-800/70 px-4 py-4 md:p-5 bg-slate-950/40 backdrop-blur-xl md:sticky md:top-0 md:h-screen md:flex md:flex-col md:overflow-y-auto">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-sky-500/20 border border-sky-500/20 flex items-center justify-center"><Wallet className="w-6 h-6 text-sky-300" /></div>
              <div>
                <div className="text-xs font-black uppercase tracking-[0.35em] text-slate-500">Painel</div>
                <div className="text-lg font-extrabold">FinTrack Pro</div>
              </div>
            </div>
            <button className="md:hidden rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-300" onClick={logout}>Sair</button>
          </div>

          <div className="session-card mt-5 card">
            <div className="section-label font-black uppercase text-slate-500">Sessão</div>
            <div className="mt-3 text-lg font-bold">{user.username}</div>
            <div className="text-sm text-slate-400">{user.is_admin ? 'Administrador' : 'Usuário padrão'}</div>
            {user.is_admin ? (
              <div className="mt-5 grid gap-2 border-t border-slate-800/80 pt-4">
                <button className={`sidebar-nav-button w-full rounded-2xl px-4 text-left border transition ${currentView === 'ADMIN_USERS' ? 'nav-active' : 'text-slate-300 border-transparent hover:border-slate-700 hover:bg-slate-900/60'}`} onClick={() => setCurrentView('ADMIN_USERS')}>Gestão de usuários</button>
                <button className={`sidebar-nav-button w-full rounded-2xl px-4 text-left border transition ${currentView === 'ADMIN_CATEGORIES' ? 'nav-active' : 'text-slate-300 border-transparent hover:border-slate-700 hover:bg-slate-900/60'}`} onClick={() => setCurrentView('ADMIN_CATEGORIES')}>Categorias</button>
              </div>
            ) : null}
          </div>

          <nav className="mt-8 space-y-2 text-sm font-semibold md:flex-1">
            <button className={`sidebar-nav-button w-full rounded-2xl px-4 text-left border transition ${currentView === 'Dashboard' ? 'nav-active' : 'text-slate-300 border-transparent hover:border-slate-700 hover:bg-slate-900/60'}`} onClick={() => setCurrentView('Dashboard')}>Dashboard</button>
            <button className={`sidebar-nav-button w-full rounded-2xl px-4 text-left border transition ${currentView === 'GOALS' ? 'nav-active' : 'text-slate-300 border-transparent hover:border-slate-700 hover:bg-slate-900/60'}`} onClick={() => setCurrentView('GOALS')}>Metas</button>
            <button className={`sidebar-nav-button w-full rounded-2xl px-4 text-left border transition ${currentView === 'NOTIFICATIONS' ? 'nav-active' : 'text-slate-300 border-transparent hover:border-slate-700 hover:bg-slate-900/60'}`} onClick={() => setCurrentView('NOTIFICATIONS')}>Minhas notificações</button>
          </nav>

          <button className="hidden md:flex mt-8 w-full items-center justify-center gap-2 rounded-2xl border border-slate-700 px-4 py-3 text-sm font-bold uppercase tracking-[0.2em] text-slate-200 hover:bg-slate-900/80 transition md:mt-auto" onClick={logout}>
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </aside>

        <main className="px-4 py-5 md:px-7 md:py-7 lg:px-8 lg:py-8">
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
                      <label className="field-stack min-w-[180px]">
                        <span className="field-label">Competência</span>
                        <span className="field-control field-control--icon"><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></span>
                      </label>
                      <label className="field-stack min-w-[220px]">
                        <span className="field-label">Modo</span>
                        <span className="field-control field-control--select">
                          <select value={viewMode} onChange={(event) => setViewMode(event.target.value)}>
                            <option value="mensal">Visão mensal</option>
                            <option value="projecao">Projeção 6 meses</option>
                          </select>
                        </span>
                      </label>
                      <label className="field-stack min-w-[220px]">
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

                  <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-5">
                    <article className="metric-card card rounded-[1.7rem] border-b-2 border-emerald-500/70"><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Entradas</div><div className="metric-value font-extrabold text-emerald-300">{formatCurrency(income)}</div></article>
                    <article className="metric-card card rounded-[1.7rem] border-b-2 border-rose-400/70"><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Saídas totais</div><div className="metric-value font-extrabold text-rose-300">- {formatCurrency(totalExpenses)}</div></article>
                    <article className="metric-card card rounded-[1.7rem] border-b-2 border-cyan-400/70"><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Investimentos</div><div className="metric-value font-extrabold text-cyan-300">{formatCurrency(investments)}</div><div className="metric-caption">Inclui todos os investimentos da competência, com ou sem meta.</div></article>
                    <article className="metric-card card rounded-[1.7rem] border-b-2 border-sky-300/70"><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Invest. em metas</div><div className="metric-value font-extrabold text-sky-200">{formatCurrency(goalLinkedInvestmentsTotal)}</div><div className="metric-caption">{goalLinkedInvestments.length ? `${goalLinkedInvestments.length} lançamento(s) vinculados a objetivos.` : 'Nenhum investimento vinculado nesta competência.'}</div></article>
                    <article className="metric-card card rounded-[1.7rem] border-b-2 border-slate-300/70"><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Saldo final</div><div className="metric-value font-extrabold text-slate-50">{formatCurrency(income - paidExpenses - investments)}</div></article>
                    <article className="metric-card card rounded-[1.7rem] border-b-2 border-amber-300/70"><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Maior gasto 12m</div><div className="metric-value font-extrabold text-amber-200">{formatCurrency(topFutureExpense ? topFutureExpense.amount : 0)}</div><div className="metric-caption">{topFutureExpense ? `${topFutureExpense.description} em ${formatMonthLabel(topFutureExpense.competence)}.` : 'Nenhuma saída prevista nos próximos 12 meses.'}</div></article>
                  </section>

                  <ChartsSection hidden={false} income={income} paidExpenses={paidExpenses} investments={investments} projection={projection} viewMode={viewMode} />

                  <CategoryAreaChart hidden={false} analytics={categoryAnalytics} />

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
                        <thead className="bg-slate-900/60 text-[0.65rem] uppercase tracking-[0.25em] text-slate-500"><tr><th className="px-6 py-4">Venc.</th><th className="px-6 py-4">Descrição</th><th className="px-6 py-4">Categoria</th><th className="px-6 py-4">Meta</th><th className="px-6 py-4 text-right">Valor</th><th className="px-6 py-4 text-center">Status</th><th className="px-6 py-4 text-center">Ações</th></tr></thead>
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
                  <div className="px-6 py-5 border-b border-slate-800/80"><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Conta</div><div className="text-xl font-extrabold">Configuração de notificações</div><div className="mt-2 text-sm text-slate-400">Esta configuração vale apenas para o usuário <strong>{user.username}</strong> e o disparo considera apenas os lançamentos dele.</div></div>
                  <div className="p-6">
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
                <label className="flex items-start gap-3 text-sm text-slate-300"><input checked={!transactionForm.applyToPlan} onChange={() => setTransactionForm((current) => ({ ...current, applyToPlan: false }))} type="radio" name="transaction-scope" className="mt-1 h-4 w-4" />Editar só esta competência. Os próximos meses continuam usando o plano atual.</label>
                <label className="flex items-start gap-3 text-sm text-slate-300"><input checked={transactionForm.applyToPlan} onChange={() => setTransactionForm((current) => ({ ...current, applyToPlan: true }))} type="radio" name="transaction-scope" className="mt-1 h-4 w-4" />Editar esta competência e atualizar valor e vencimento dos próximos meses da série.</label>
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


function CategoryAreaChart({ hidden, analytics }) {
  const chartRef = useRef(null);

  useEffect(() => {
    if (hidden || !chartRef.current || !analytics.categories.length) return undefined;

    const chart = new Chart(chartRef.current, {
      type: 'line',
      data: {
        labels: analytics.months.map((item) => formatMonthLabel(item)),
        datasets: analytics.categories.map((series, index) => ({
          label: series.category,
          data: series.months.map((item) => Number(item.total)),
          borderColor: CHART_COLORS[index % CHART_COLORS.length],
          backgroundColor: `${CHART_COLORS[index % CHART_COLORS.length]}33`,
          fill: true,
          tension: 0.35,
          pointRadius: 2,
          stack: 'category-costs',
        })),
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { color: '#cbd5e1', boxWidth: 12 } } },
        scales: {
          y: { stacked: true, ticks: { color: '#64748b' }, grid: { color: 'rgba(148, 163, 184, 0.1)' } },
          x: { ticks: { color: '#64748b' }, grid: { display: false } },
        },
      },
    });

    return () => {
      chart.destroy();
    };
  }, [hidden, analytics]);

  if (hidden) return null;

  return (
    <section className="card rounded-[2rem] p-6 chart-card">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Custos por categoria</div>
          <div className="text-xl font-extrabold">Área acumulada dos próximos 6 meses</div>
          <p className="mt-2 text-sm text-slate-400">Custos fixos e variáveis agrupados para mostrar onde a pressão futura do caixa está concentrada.</p>
        </div>
        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/40 px-4 py-3 text-right">
          <div className="text-[0.65rem] font-black uppercase tracking-[0.25em] text-slate-500">Total projetado</div>
          <div className="mt-2 text-lg font-extrabold text-rose-200">{formatCurrency(analytics.total_cost)}</div>
        </div>
      </div>
      {!analytics.categories.length ? <div className="empty-state">Sem custos suficientes para montar o gráfico por categoria.</div> : <canvas ref={chartRef} className="chart-canvas chart-canvas--bar" />}
      {analytics.categories.length ? (
        <div className="mt-5 grid md:grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
          {analytics.categories.slice(0, 4).map((series) => (
            <div key={series.category} className="rounded-2xl border border-slate-800/80 bg-slate-950/35 px-4 py-3">
              <div className="text-slate-400 uppercase tracking-[0.18em] text-[0.65rem] font-black">{series.category}</div>
              <div className="mt-2 font-extrabold text-slate-100">{formatCurrency(series.total)}</div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}


function GoalProgressChart({ goal }) {
  const chartRef = useRef(null);

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
        plugins: { legend: { position: 'bottom', labels: { color: '#cbd5e1', boxWidth: 12 } } },
        scales: {
          y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(148, 163, 184, 0.1)' } },
          x: { ticks: { color: '#64748b' }, grid: { display: false } },
        },
      },
    });

    return () => {
      chart.destroy();
    };
  }, [goal]);

  if (!goal.chart.length) return null;

  return <canvas ref={chartRef} className="chart-canvas chart-canvas--bar" />;
}
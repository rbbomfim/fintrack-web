import { useEffect, useMemo, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import {
  Bell,
  KeyRound,
  LogOut,
  OctagonMinus,
  Pencil,
  ShieldCheck,
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
const TYPE_LABELS = {
  ENTRADA: 'Receita',
  FIXO: 'Custo fixo',
  VARIAVEL: 'Custo variável',
  INVESTIMENTO: 'Investimento',
};
const ADMIN_VIEWS = ['ADMIN_USERS', 'ADMIN_CATEGORIES', 'ADMIN_NOTIFICATIONS'];


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
    description: '',
    competence: month,
    dueDate: '',
    amount: '',
    type: 'ENTRADA',
    category: '',
    isPaid: false,
    isRecurring: true,
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
  const [notificationSettingsError, setNotificationSettingsError] = useState('');
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showAlertsModal, setShowAlertsModal] = useState(false);
  const [transactionForm, setTransactionForm] = useState(defaultTransactionForm(todayMonth));
  const [userForm, setUserForm] = useState({ username: '', password: '', isAdmin: false });
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '' });
  const [categoryForm, setCategoryForm] = useState({ id: '', type: 'ENTRADA', name: '' });
  const [lastAlertSignature, setLastAlertSignature] = useState('');

  const isAdminView = ADMIN_VIEWS.includes(currentView);
  const alerts = useMemo(() => buildAlerts(transactions), [transactions]);
  const alertsSignature = useMemo(() => alerts.map((item) => `${item.id}:${item.badge}`).join('|'), [alerts]);

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
      api('/categories'),
    ];
    if (user.is_admin) {
      requests.push(api('/admin/users'));
      requests.push(api('/admin/categories'));
      requests.push(api('/admin/notification-settings'));
    }

    const [transactionsResponse, projectionResponse, futureResponse, categoriesResponse, usersResponse, adminCategoriesResponse, settingsResponse] = await Promise.all(requests);
    setTransactions(transactionsResponse.items);
    setProjection(projectionResponse.months.slice(0, 6));
    setFutureItems(futureResponse.items);
    setCategories(categoriesResponse);

    if (user.is_admin) {
      setUsers(usersResponse);
      setAdminCategories(adminCategoriesResponse);
      setNotificationSettings({ ...emptyNotificationSettings(), ...settingsResponse });
    } else {
      setUsers([]);
      setAdminCategories([]);
      setNotificationSettings(emptyNotificationSettings());
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
    setTransactionForm({ ...defaultTransactionForm(month), category: baseCategories[0] || '', isRecurring: true });
    setTransactionError('');
    setShowTransactionModal(true);
  }

  function openEditTransaction(item) {
    setTransactionForm({
      id: item.id,
      description: item.description,
      competence: item.competence,
      dueDate: item.due_date || '',
      amount: formatCurrency(item.amount),
      type: item.type,
      category: item.category,
      isPaid: item.is_paid,
      isRecurring: item.type === 'FIXO' || item.type === 'ENTRADA',
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
        is_paid: transactionForm.isPaid,
      };
      if (!transactionForm.id) payload.is_recurring = transactionForm.isRecurring;

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
    if (!window.confirm('Encerrar a recorrência deste custo fixo a partir da competência atual?')) return;
    try {
      await api(`/transactions/${item.id}/terminate`, { method: 'PATCH' });
      setToast('Recorrência encerrada');
      await refreshData();
    } catch (error) {
      setToast(error.message);
    }
  }

  async function handleDeleteTransaction(item) {
    if (!window.confirm('Excluir este lançamento?')) return;
    try {
      await api(`/transactions/${item.id}`, { method: 'DELETE' });
      setToast('Lançamento excluído');
      await refreshData();
    } catch (error) {
      setToast(error.message);
    }
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
    if (!window.confirm(`Resetar a senha do usuário ${targetUser.username}?`)) return;
    try {
      const result = await api(`/admin/users/${targetUser.id}/reset`, { method: 'POST' });
      setToast(`Senha temporária: ${result.temporary_password}`);
      await refreshData();
    } catch (error) {
      setToast(error.message);
    }
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
    if (!window.confirm(`Excluir a categoria ${category.name}?`)) return;
    try {
      await api(`/admin/categories/${category.id}`, { method: 'DELETE' });
      setToast('Categoria excluída');
      await refreshData();
    } catch (error) {
      setToast(error.message);
    }
  }

  async function handleSubmitNotificationSettings(event) {
    event.preventDefault();
    setNotificationSettingsError('');
    try {
      const saved = await api('/admin/notification-settings', {
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
      const report = await api('/admin/notifications/dispatch', { method: 'POST' });
      setToast(`Disparo concluído: ${report.notifications_sent} enviado(s), ${report.notifications_skipped} ignorado(s)`);
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
    setUsers([]);
    setCategories([]);
    setAdminCategories([]);
    setNotificationSettings(emptyNotificationSettings());
    setCurrentView('Dashboard');
    setToast('Sessão finalizada');
  }

  const filteredTransactions = typeFilter === 'ALL'
    ? transactions
    : transactions.filter((item) => item.type === typeFilter);

  const income = transactions.filter((item) => item.type === 'ENTRADA').reduce((sum, item) => sum + Number(item.amount), 0);
  const totalExpenses = transactions.filter((item) => item.type === 'FIXO' || item.type === 'VARIAVEL').reduce((sum, item) => sum + Number(item.amount), 0);
  const paidExpenses = transactions.filter((item) => item.is_paid && (item.type === 'FIXO' || item.type === 'VARIAVEL')).reduce((sum, item) => sum + Number(item.amount), 0);
  const investments = transactions.filter((item) => item.type === 'INVESTIMENTO').reduce((sum, item) => sum + Number(item.amount), 0);
  const topFutureExpense = futureItems.filter((item) => item.type !== 'ENTRADA').sort((left, right) => Number(right.amount) - Number(left.amount))[0];
  const futureStatementItems = futureItems.filter((item) => item.type === 'ENTRADA' || item.type === 'VARIAVEL');

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
                <button className={`sidebar-nav-button w-full rounded-2xl px-4 text-left border transition ${currentView === 'ADMIN_NOTIFICATIONS' ? 'nav-active' : 'text-slate-300 border-transparent hover:border-slate-700 hover:bg-slate-900/60'}`} onClick={() => setCurrentView('ADMIN_NOTIFICATIONS')}>Notificações</button>
              </div>
            ) : null}
          </div>

          <nav className="mt-8 space-y-2 text-sm font-semibold md:flex-1">
            <button className={`sidebar-nav-button w-full rounded-2xl px-4 text-left border transition ${currentView === 'Dashboard' ? 'nav-active' : 'text-slate-300 border-transparent hover:border-slate-700 hover:bg-slate-900/60'}`} onClick={() => setCurrentView('Dashboard')}>Dashboard</button>
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
              {!isAdminView ? (
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
                            <option value="ALL">Todos</option>
                            {TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
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

                  <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5">
                    <article className="metric-card card rounded-[1.7rem] border-b-2 border-emerald-500/70"><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Entradas</div><div className="metric-value font-extrabold text-emerald-300">{formatCurrency(income)}</div></article>
                    <article className="metric-card card rounded-[1.7rem] border-b-2 border-rose-400/70"><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Saídas totais</div><div className="metric-value font-extrabold text-rose-300">- {formatCurrency(totalExpenses)}</div></article>
                    <article className="metric-card card rounded-[1.7rem] border-b-2 border-cyan-400/70"><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Investimentos</div><div className="metric-value font-extrabold text-cyan-300">{formatCurrency(investments)}</div></article>
                    <article className="metric-card card rounded-[1.7rem] border-b-2 border-slate-300/70"><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Saldo final</div><div className="metric-value font-extrabold text-slate-50">{formatCurrency(income - paidExpenses - investments)}</div></article>
                    <article className="metric-card card rounded-[1.7rem] border-b-2 border-amber-300/70"><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Maior gasto 12m</div><div className="metric-value font-extrabold text-amber-200">{formatCurrency(topFutureExpense ? topFutureExpense.amount : 0)}</div><div className="metric-caption">{topFutureExpense ? `${topFutureExpense.description} em ${formatMonthLabel(topFutureExpense.competence)}.` : 'Nenhuma saída prevista nos próximos 12 meses.'}</div></article>
                  </section>

                  <ChartsSection hidden={false} income={income} paidExpenses={paidExpenses} investments={investments} projection={projection} viewMode={viewMode} />

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
                      <div><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Lançamentos</div><div className="text-xl font-extrabold">Competência {month}</div></div>
                      <div className="text-sm text-slate-400">Saídas são exibidas com sinal negativo.</div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left min-w-[980px]">
                        <thead className="bg-slate-900/60 text-[0.65rem] uppercase tracking-[0.25em] text-slate-500"><tr><th className="px-6 py-4">Venc.</th><th className="px-6 py-4">Descrição</th><th className="px-6 py-4">Categoria</th><th className="px-6 py-4 text-right">Valor</th><th className="px-6 py-4 text-center">Status</th><th className="px-6 py-4 text-center">Ações</th></tr></thead>
                        <tbody className="divide-y divide-slate-800/80 text-sm">
                          {!filteredTransactions.length ? <tr><td colSpan="6" className="empty-state">Nenhum lançamento encontrado para esse filtro na competência selecionada.</td></tr> : null}
                          {filteredTransactions.map((item) => {
                            const status = getStatusInfo(item);
                            const isExpense = item.type === 'FIXO' || item.type === 'VARIAVEL';
                            return (
                              <tr key={item.id} className="hover:bg-slate-900/35 transition">
                                <td className="px-6 py-4 text-slate-400 font-mono">{item.due_date ? item.due_date.slice(-2) : '--'}</td>
                                <td className="px-6 py-4"><div className="font-bold text-slate-50">{item.description}</div><div className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">{TYPE_LABELS[item.type]}</div></td>
                                <td className="px-6 py-4 text-slate-300">{item.category}</td>
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
                      <div><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Futuro</div><div className="text-xl font-extrabold">Entradas e saídas variáveis até 12 meses</div></div>
                      <div className="text-sm text-slate-400">Lista simples de lançamentos futuros para visão de caixa.</div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left min-w-[860px]">
                        <thead className="bg-slate-900/60 text-[0.65rem] uppercase tracking-[0.25em] text-slate-500"><tr><th className="px-6 py-4">Competência</th><th className="px-6 py-4">Venc.</th><th className="px-6 py-4">Descrição</th><th className="px-6 py-4">Categoria</th><th className="px-6 py-4">Tipo</th><th className="px-6 py-4 text-right">Valor</th></tr></thead>
                        <tbody className="divide-y divide-slate-800/80 text-sm">
                          {!futureStatementItems.length ? <tr><td colSpan="6" className="empty-state">Nenhum lançamento futuro de entrada ou custo variável encontrado.</td></tr> : null}
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

              {currentView === 'ADMIN_NOTIFICATIONS' ? (
                <section className="card rounded-[2rem] overflow-hidden admin-section">
                  <div className="px-6 py-5 border-b border-slate-800/80"><div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Admin</div><div className="text-xl font-extrabold">Configuração de notificações</div></div>
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
                        <label className="flex items-center gap-3 text-sm text-slate-300"><input checked={Boolean(notificationSettings.scheduler_enabled)} onChange={(event) => setNotificationSettings((current) => ({ ...current, scheduler_enabled: event.target.checked }))} type="checkbox" className="h-4 w-4 rounded border-slate-600 bg-slate-900" />Habilitar disparo automático</label>
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
          <label className="field-stack"><span className="field-label">Tipo</span><span className="field-control field-control--select"><select value={transactionForm.type} onChange={(event) => setTransactionForm((current) => ({ ...current, type: event.target.value, isRecurring: event.target.value === 'ENTRADA' || event.target.value === 'FIXO' }))}>{TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></span></label>
          <label className="field-stack"><span className="field-label">Categoria</span><span className="field-control field-control--select"><select value={transactionForm.category} onChange={(event) => setTransactionForm((current) => ({ ...current, category: event.target.value }))}>{categories.filter((item) => item.type === transactionForm.type).map((item) => <option key={`${item.type}-${item.name}`} value={item.name}>{item.name}</option>)}</select></span></label>
          {!transactionForm.id ? <label className="flex items-center gap-3 pt-3 md:col-span-2"><input checked={transactionForm.isRecurring} onChange={(event) => setTransactionForm((current) => ({ ...current, isRecurring: event.target.checked }))} type="checkbox" className="h-4 w-4 rounded border-slate-600 bg-slate-900" />Repetir mensalmente a partir desta data</label> : null}
          <div className="flex items-center gap-3 pt-3 md:col-span-2"><input checked={transactionForm.isPaid} onChange={(event) => setTransactionForm((current) => ({ ...current, isPaid: event.target.checked }))} type="checkbox" className="h-4 w-4 rounded border-slate-600 bg-slate-900" /><label className="text-sm text-slate-300">Marcar como liquidado</label></div>
          <div className="md:col-span-2 pt-6 flex flex-col sm:flex-row gap-3"><button type="button" className="flex-1 rounded-2xl border border-slate-700 px-5 py-4 font-bold hover:bg-slate-900/70 transition" onClick={() => setShowTransactionModal(false)}>Cancelar</button><button type="submit" className="flex-[1.4] rounded-2xl bg-sky-500 px-5 py-4 font-extrabold text-slate-950 hover:bg-sky-400 transition">Salvar lançamento</button></div>
        </form>
        {transactionError ? <p className="mt-4 text-sm text-rose-300">{transactionError}</p> : null}
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

      {toast ? <div className="fixed bottom-4 right-4 z-[60] rounded-2xl border border-slate-700 bg-slate-950/90 px-5 py-4 text-sm text-slate-100 shadow-2xl">{toast}</div> : null}
    </>
  );
}
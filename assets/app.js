const API_BASE_URL = (window.__FINTRACK_CONFIG__ && window.__FINTRACK_CONFIG__.API_BASE_URL) || 'http://localhost:8000';
const STORAGE_KEY = 'fintrack_auth';
const NAV_VIEWS = ['Dashboard'];
const ADMIN_VIEWS = ['ADMIN_USERS', 'ADMIN_CATEGORIES', 'ADMIN_NOTIFICATIONS'];
const typeLabels = {
    ENTRADA: 'Receita',
    FIXO: 'Custo fixo',
    VARIAVEL: 'Custo variável',
    INVESTIMENTO: 'Investimento',
};

const state = {
    token: null,
    user: null,
    currentView: 'Dashboard',
    transactions: [],
    projection: [],
    futureProjection: [],
    futureItems: [],
    users: [],
    categories: [],
    adminCategories: [],
    notificationSettings: null,
    alerts: [],
    lastAlertSignature: '',
    confirmResolver: null,
    categoryEditingId: null,
};

function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

function formatCurrencyInput(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    const numericValue = Number(digits) / 100;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numericValue);
}

function normalizeCurrencyInput(value) {
    const cleaned = String(value || '').replace(/\s/g, '').replace('R$', '').replace(/\./g, '').replace(',', '.');
    const numericValue = Number(cleaned);
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

function saveSession() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: state.token, user: state.user }));
}

function loadSession() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
        const parsed = JSON.parse(raw);
        state.token = parsed.token;
        state.user = parsed.user;
    } catch (_) {
        localStorage.removeItem(STORAGE_KEY);
    }
}

async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }
    if (state.token) headers.Authorization = `Bearer ${state.token}`;

    const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
    if (response.status === 204) return null;

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
        const message = typeof payload === 'string' ? payload : payload.detail || 'Erro inesperado';
        if (response.status === 401) logout(false);
        throw new Error(message);
    }
    return payload;
}

function setError(elementId, message) {
    const element = document.getElementById(elementId);
    if (!element) return;
    if (!message) {
        element.textContent = '';
        element.classList.add('hidden-force');
        return;
    }
    element.textContent = message;
    element.classList.remove('hidden-force');
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.remove('hidden-force');
    clearTimeout(showToast.timeoutId);
    showToast.timeoutId = setTimeout(() => toast.classList.add('hidden-force'), 3200);
}

function isAdminView(view = state.currentView) {
    return ADMIN_VIEWS.includes(view);
}

function getCategoriesForType(type, { includeInactiveName = null } = {}) {
    const items = state.categories.filter((category) => category.type === type).map((category) => category.name);
    if (includeInactiveName && !items.includes(includeInactiveName)) {
        items.push(includeInactiveName);
    }
    return items.sort((left, right) => left.localeCompare(right, 'pt-BR'));
}

function updateSubCats(selectedCategory = null) {
    const type = document.getElementById('form-tipo').value;
    const select = document.getElementById('form-sub');
    const categories = getCategoriesForType(type, { includeInactiveName: selectedCategory });
    select.innerHTML = categories.map((category) => `<option value="${category}">${category}</option>`).join('');
    if (selectedCategory && categories.includes(selectedCategory)) {
        select.value = selectedCategory;
    }
}

function openAlertsModal() {
    document.getElementById('alerts-modal').classList.remove('opacity-0', 'pointer-events-none');
    lucide.createIcons();
}

function closeAlertsModal() {
    document.getElementById('alerts-modal').classList.add('opacity-0', 'pointer-events-none');
}

function openTransactionModal(transactionId = null) {
    document.getElementById('finance-form').reset();
    document.getElementById('edit-id').value = '';
    document.getElementById('form-comp').value = document.getElementById('filter-mes').value;
    document.getElementById('form-tipo').value = 'ENTRADA';
    document.getElementById('form-pago').checked = false;
    setError('transaction-error', '');
    updateSubCats();

    if (transactionId) {
        const item = state.transactions.find((transaction) => transaction.id === transactionId);
        if (item) {
            document.getElementById('edit-id').value = item.id;
            document.getElementById('form-desc').value = item.description;
            document.getElementById('form-comp').value = item.competence;
            document.getElementById('form-venc').value = item.due_date || '';
                    document.getElementById('form-valor').value = formatCurrency(item.amount);
            document.getElementById('form-tipo').value = item.type;
            updateSubCats(item.category);
            document.getElementById('form-sub').value = item.category;
            document.getElementById('form-pago').checked = item.is_paid;
        }
    }

    document.getElementById('transaction-modal').classList.remove('opacity-0', 'pointer-events-none');
    lucide.createIcons();
}

function closeTransactionModal() {
    document.getElementById('transaction-modal').classList.add('opacity-0', 'pointer-events-none');
}

function openUserModal() {
    document.getElementById('user-form').reset();
    setError('user-error', '');
    document.getElementById('user-modal').classList.remove('opacity-0', 'pointer-events-none');
    lucide.createIcons();
}

function closeUserModal() {
    document.getElementById('user-modal').classList.add('opacity-0', 'pointer-events-none');
}

function applyConfirmTone(tone) {
    const kicker = document.getElementById('confirm-kicker');
    const acceptButton = document.getElementById('confirm-accept');
    kicker.className = 'text-xs font-black uppercase tracking-[0.25em]';
    acceptButton.className = 'rounded-2xl px-5 py-3 font-extrabold text-slate-950 transition';

    if (tone === 'danger') {
        kicker.classList.add('text-rose-300');
        acceptButton.classList.add('bg-rose-400', 'hover:bg-rose-300');
        return;
    }

    if (tone === 'warning') {
        kicker.classList.add('text-amber-300');
        acceptButton.classList.add('bg-amber-400', 'hover:bg-amber-300');
        return;
    }

    kicker.classList.add('text-sky-300');
    acceptButton.classList.add('bg-sky-500', 'hover:bg-sky-400');
}

function showConfirmModal({ kicker = 'Confirmação', title, message, confirmLabel = 'Confirmar', tone = 'default' }) {
    document.getElementById('confirm-kicker').textContent = kicker;
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    document.getElementById('confirm-accept').textContent = confirmLabel;
    applyConfirmTone(tone);
    document.getElementById('confirm-modal').classList.remove('opacity-0', 'pointer-events-none');
    lucide.createIcons();

    return new Promise((resolve) => {
        state.confirmResolver = resolve;
    });
}

function resolveConfirm(result) {
    document.getElementById('confirm-modal').classList.add('opacity-0', 'pointer-events-none');
    if (state.confirmResolver) {
        const resolver = state.confirmResolver;
        state.confirmResolver = null;
        resolver(result);
    }
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

function buildAlerts() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return state.transactions
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

function renderAlerts() {
    const badge = document.getElementById('alerts-badge');
    const summary = document.getElementById('alerts-summary');
    const list = document.getElementById('alerts-list');

    badge.textContent = state.alerts.length;
    badge.classList.toggle('hidden-force', state.alerts.length === 0);

    if (state.alerts.length === 0) {
        summary.textContent = 'Nenhum alerta crítico no momento.';
        list.innerHTML = '<div class="alerts-empty">Nenhum vencimento pendente dentro da janela crítica de 3 dias.</div>';
        return;
    }

    summary.textContent = `${state.alerts.length} alerta(s) de vencimento exigindo atenção.`;
    list.innerHTML = state.alerts.map((alert) => `
        <article class="alert-row alert-row--${alert.level}">
            <div class="alert-row__header">
                <div class="alert-row__title">${alert.title}</div>
                <div class="alert-row__meta">${alert.badge}</div>
            </div>
            <div class="alert-row__copy">${alert.message} Categoria: ${alert.category}. Valor previsto: ${formatCurrency(alert.amount)}.</div>
        </article>
    `).join('');
}

function maybeOpenAlertsModal(force = false) {
    const signature = state.alerts.map((alert) => `${alert.id}:${alert.badge}`).join('|');
    if (!state.alerts.length) {
        state.lastAlertSignature = '';
        return;
    }
    if (force || signature !== state.lastAlertSignature) {
        state.lastAlertSignature = signature;
        openAlertsModal();
    }
}

function resetCategoryForm() {
    state.categoryEditingId = null;
    document.getElementById('category-form').reset();
    document.getElementById('category-type').value = 'ENTRADA';
    document.getElementById('category-type').disabled = false;
    document.getElementById('category-submit-button').textContent = 'Salvar categoria';
    document.getElementById('category-cancel-edit').classList.add('hidden-force');
    setError('category-error', '');
}

function fillNotificationSettingsForm() {
    const settings = state.notificationSettings;
    if (!settings) return;

    document.getElementById('settings-email-enabled').checked = Boolean(settings.email_enabled);
    document.getElementById('settings-scheduler-enabled').checked = Boolean(settings.scheduler_enabled);
    document.getElementById('settings-poll-minutes').value = settings.poll_minutes ?? 60;
    document.getElementById('settings-email-from').value = settings.email_from || '';
    document.getElementById('settings-email-to').value = settings.email_to || '';
    document.getElementById('settings-smtp-host').value = settings.smtp_host || '';
    document.getElementById('settings-smtp-port').value = settings.smtp_port ?? 587;
    document.getElementById('settings-smtp-user').value = settings.smtp_user || '';
    document.getElementById('settings-smtp-password').value = settings.smtp_password || '';
    document.getElementById('settings-smtp-starttls').checked = Boolean(settings.smtp_starttls);
    document.getElementById('settings-smtp-ssl').checked = Boolean(settings.smtp_ssl);
}

function renderProjectionTable() {
    document.getElementById('projection-body').innerHTML = state.projection.map((item) => `
        <tr>
            <td class="py-4 font-bold">${item.month}</td>
            <td class="py-4 text-right text-emerald-300">${formatCurrency(item.income_total)}</td>
            <td class="py-4 text-right text-rose-300">- ${formatCurrency(item.fixed_total)}</td>
            <td class="py-4 text-right text-rose-200">- ${formatCurrency(item.variable_total)}</td>
            <td class="py-4 text-right text-cyan-300">${formatCurrency(item.investment_total)}</td>
            <td class="py-4 text-right font-extrabold ${Number(item.balance_projection) >= 0 ? 'text-slate-50' : 'text-rose-300'}">${formatCurrency(item.balance_projection)}</td>
        </tr>
    `).join('');
}

function renderFutureTransactions() {
    const body = document.getElementById('future-transactions-body');
    const filteredItems = state.futureItems.filter((item) => item.type === 'ENTRADA' || item.type === 'VARIAVEL');

    if (!filteredItems.length) {
        body.innerHTML = '<tr><td colspan="6" class="empty-state">Nenhum lançamento futuro de entrada ou custo variável encontrado nos próximos 12 meses.</td></tr>';
        return;
    }

    body.innerHTML = filteredItems.map((item) => {
        const isExpense = item.type === 'VARIAVEL';
        return `
            <tr>
                <td class="px-6 py-4 font-bold text-slate-100">${formatMonthLabel(item.competence)}</td>
                <td class="px-6 py-4 text-slate-400 font-mono">${item.due_date ? item.due_date.slice(-2) : '--'}</td>
                <td class="px-6 py-4"><div class="font-bold text-slate-50">${item.description}</div></td>
                <td class="px-6 py-4 text-slate-300">${item.category}</td>
                <td class="px-6 py-4 text-slate-400 uppercase tracking-[0.18em] text-xs">${typeLabels[item.type]}</td>
                <td class="px-6 py-4 text-right font-extrabold ${isExpense ? 'text-rose-300' : 'text-emerald-300'}">${isExpense ? '- ' : ''}${formatCurrency(item.amount)}</td>
            </tr>
        `;
    }).join('');
}

function renderUsers() {
    const body = document.getElementById('users-body');
    if (!state.users.length) {
        body.innerHTML = '<tr><td colspan="4" class="empty-state">Nenhum usuário cadastrado além do padrão atual.</td></tr>';
        return;
    }

    body.innerHTML = state.users.map((user) => `
        <tr>
            <td class="px-6 py-4 font-bold">${user.username}</td>
            <td class="px-6 py-4">${user.is_admin ? 'Administrador' : 'Usuário'}</td>
            <td class="px-6 py-4">${user.must_change_password ? 'Sim' : 'Não'}</td>
            <td class="px-6 py-4 text-right"><button onclick="resetUserPassword('${user.id}')" class="rounded-xl border border-amber-400/30 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-amber-200 hover:bg-amber-400/10 transition">Resetar senha</button></td>
        </tr>
    `).join('');
}

function renderCategories() {
    const body = document.getElementById('categories-body');
    if (!state.adminCategories.length) {
        body.innerHTML = '<tr><td colspan="3" class="empty-state">Nenhuma categoria cadastrada.</td></tr>';
        return;
    }

    body.innerHTML = state.adminCategories.map((category) => `
        <tr>
            <td class="px-6 py-4">
                <div class="font-bold text-slate-100">${typeLabels[category.type]}</div>
                <div class="mt-1"><span class="category-status ${category.is_active ? 'category-status--active' : 'category-status--inactive'}">${category.is_active ? 'Ativa' : 'Inativa'}</span></div>
            </td>
            <td class="px-6 py-4 text-slate-200">${category.name}</td>
            <td class="px-6 py-4">
                <div class="flex flex-wrap items-center justify-end gap-2">
                    <button onclick="editCategory('${category.id}')" class="icon-button rounded-xl border border-slate-700 p-2 hover:bg-slate-900/70 transition" data-tooltip="Editar categoria" aria-label="Editar categoria"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                    <button onclick="toggleCategoryActive('${category.id}', ${category.is_active ? 'false' : 'true'})" class="rounded-xl border ${category.is_active ? 'border-amber-400/30 text-amber-200 hover:bg-amber-400/10' : 'border-emerald-400/30 text-emerald-200 hover:bg-emerald-400/10'} px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] transition">${category.is_active ? 'Inativar' : 'Reativar'}</button>
                    <button onclick="deleteCategory('${category.id}')" class="icon-button rounded-xl border border-rose-400/30 p-2 text-rose-200 hover:bg-rose-400/10 transition" data-tooltip="Excluir categoria" aria-label="Excluir categoria"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>
            </td>
        </tr>
    `).join('');
}

function updateCharts(income, expenses, investments) {
    if (isAdminView() || state.currentView !== 'Dashboard') {
        return;
    }

    const mainContext = document.getElementById('mainChart').getContext('2d');
    const pieContext = document.getElementById('pieChart').getContext('2d');
    if (window.mainChartInstance) window.mainChartInstance.destroy();
    if (window.pieChartInstance) window.pieChartInstance.destroy();

    const isProjection = document.getElementById('view-mode').value === 'projecao' && state.projection.length > 0;
    const labels = isProjection ? state.projection.map((item) => item.month) : ['Mês atual'];
    const incomeData = isProjection ? state.projection.map((item) => Number(item.income_total)) : [income];
    const expenseData = isProjection ? state.projection.map((item) => Number(item.fixed_total) + Number(item.variable_total)) : [expenses];
    const investmentData = isProjection ? state.projection.map((item) => Number(item.investment_total)) : [investments];

    window.mainChartInstance = new Chart(mainContext, {
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

    const freeValue = Math.max(0, income - expenses - investments);
    window.pieChartInstance = new Chart(pieContext, {
        type: 'doughnut',
        data: {
            labels: ['Gastos pagos', 'Investimentos', 'Livre'],
            datasets: [{ data: [expenses, investments, freeValue], backgroundColor: ['#fb7185', '#38bdf8', '#22c55e'], borderWidth: 0 }],
        },
        options: { maintainAspectRatio: false, cutout: '76%', plugins: { legend: { position: 'bottom', labels: { color: '#cbd5e1', boxWidth: 12 } } } },
    });
}

function render() {
    const month = document.getElementById('filter-mes').value;
    const currentView = state.currentView;
    const dashboardMode = currentView === 'Dashboard';
    const adminMode = isAdminView(currentView);
    const dashboardTypeFilter = document.getElementById('dashboard-type-filter').value;
    const filteredTransactions = adminMode || dashboardTypeFilter === 'ALL'
        ? state.transactions
        : state.transactions.filter((item) => item.type === dashboardTypeFilter);

    document.getElementById('mes-label').textContent = month;
    document.getElementById('summary-section').classList.toggle('hidden-force', adminMode);
    document.getElementById('kpis-section').classList.toggle('hidden-force', adminMode);
    document.getElementById('transactions-panel').classList.toggle('hidden-force', adminMode);
    document.getElementById('future-transactions-panel').classList.toggle('hidden-force', adminMode);
    document.getElementById('visual-section').classList.toggle('hidden-force', adminMode || !dashboardMode);
    document.getElementById('projection-panel').classList.toggle('hidden-force', adminMode || !dashboardMode || document.getElementById('view-mode').value !== 'projecao');
    document.getElementById('admin-panel').classList.toggle('hidden-force', currentView !== 'ADMIN_USERS' || !state.user?.is_admin);
    document.getElementById('categories-panel').classList.toggle('hidden-force', currentView !== 'ADMIN_CATEGORIES' || !state.user?.is_admin);
    document.getElementById('notification-settings-panel').classList.toggle('hidden-force', currentView !== 'ADMIN_NOTIFICATIONS' || !state.user?.is_admin);
    document.getElementById('admin-link-users').classList.toggle('nav-active', currentView === 'ADMIN_USERS');
    document.getElementById('admin-link-categories').classList.toggle('nav-active', currentView === 'ADMIN_CATEGORIES');
    document.getElementById('admin-link-notifications').classList.toggle('nav-active', currentView === 'ADMIN_NOTIFICATIONS');

    document.querySelectorAll('nav button').forEach((button) => button.classList.remove('nav-active'));
    if (NAV_VIEWS.includes(currentView)) {
        const active = document.getElementById(`nav-${currentView}`);
        if (active) active.classList.add('nav-active');
    }

    const income = state.transactions.filter((item) => item.type === 'ENTRADA').reduce((sum, item) => sum + Number(item.amount), 0);
    const totalExpenses = state.transactions.filter((item) => item.type === 'FIXO' || item.type === 'VARIAVEL').reduce((sum, item) => sum + Number(item.amount), 0);
    const paidExpenses = state.transactions.filter((item) => item.is_paid && (item.type === 'FIXO' || item.type === 'VARIAVEL')).reduce((sum, item) => sum + Number(item.amount), 0);
    const investments = state.transactions.filter((item) => item.type === 'INVESTIMENTO').reduce((sum, item) => sum + Number(item.amount), 0);

    document.getElementById('kpi-entradas').textContent = formatCurrency(income);
    document.getElementById('kpi-saidas').textContent = `- ${formatCurrency(totalExpenses)}`;
    document.getElementById('kpi-invest').textContent = formatCurrency(investments);
    document.getElementById('kpi-saldo').textContent = formatCurrency(income - paidExpenses - investments);

    const topFutureExpense = state.futureItems
        .filter((item) => item.type !== 'ENTRADA')
        .sort((left, right) => Number(right.amount) - Number(left.amount))[0];
    document.getElementById('kpi-future').textContent = formatCurrency(topFutureExpense ? topFutureExpense.amount : 0);
    document.getElementById('kpi-future-caption').textContent = topFutureExpense
        ? `${topFutureExpense.description} em ${formatMonthLabel(topFutureExpense.competence)}.`
        : 'Nenhuma saída prevista nos próximos 12 meses.';

    if (!adminMode) {
        if (filteredTransactions.length === 0) {
            document.getElementById('table-body').innerHTML = '<tr><td colspan="6" class="empty-state">Nenhum lançamento encontrado para esse filtro na competência selecionada.</td></tr>';
        } else {
            document.getElementById('table-body').innerHTML = filteredTransactions
                .slice()
                .sort((left, right) => {
                    if (!left.due_date) return 1;
                    if (!right.due_date) return -1;
                    return new Date(left.due_date) - new Date(right.due_date);
                })
                .map((item) => {
                    const status = getStatusInfo(item);
                    const isExpense = item.type === 'FIXO' || item.type === 'VARIAVEL';
                    const statusControl = isExpense
                        ? `<button onclick="togglePaid('${item.id}', ${item.is_paid ? 'false' : 'true'})" class="status-pill ${status.className}">${status.label}</button>`
                        : `<span class="status-pill ${status.className}">${status.label}</span>`;

                    return `
                        <tr class="hover:bg-slate-900/35 transition">
                            <td class="px-6 py-4 text-slate-400 font-mono">${item.due_date ? item.due_date.slice(-2) : '--'}</td>
                            <td class="px-6 py-4"><div class="font-bold text-slate-50">${item.description}</div><div class="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">${typeLabels[item.type]}</div></td>
                            <td class="px-6 py-4 text-slate-300">${item.category}</td>
                            <td class="px-6 py-4 text-right font-extrabold ${isExpense ? 'text-rose-300' : 'text-emerald-300'}">${isExpense ? '- ' : ''}${formatCurrency(item.amount)}</td>
                            <td class="px-6 py-4 text-center">${statusControl}</td>
                            <td class="px-6 py-4"><div class="flex items-center justify-center gap-2"><button onclick="openTransactionModal('${item.id}')" class="icon-button rounded-xl border border-slate-700 p-2 hover:bg-slate-900/70 transition" data-tooltip="Editar lançamento" aria-label="Editar lançamento"><i data-lucide="pencil" class="w-4 h-4"></i></button>${item.type === 'FIXO' ? `<button onclick="terminateTransaction('${item.id}')" class="icon-button rounded-xl border border-amber-400/30 p-2 text-amber-200 hover:bg-amber-400/10 transition" data-tooltip="Encerrar recorrência" aria-label="Encerrar recorrência"><i data-lucide="octagon-minus" class="w-4 h-4"></i></button>` : ''}<button onclick="deleteTransaction('${item.id}')" class="icon-button rounded-xl border border-rose-400/30 p-2 text-rose-200 hover:bg-rose-400/10 transition" data-tooltip="Excluir lançamento" aria-label="Excluir lançamento"><i data-lucide="trash-2" class="w-4 h-4"></i></button></div></td>
                        </tr>
                    `;
                }).join('');
        }
    }

    renderProjectionTable();
    renderFutureTransactions();
    renderUsers();
    renderCategories();
    renderAlerts();
    fillNotificationSettingsForm();
    updateCharts(income, paidExpenses, investments);
    lucide.createIcons();
}

function changeView(view) {
    state.currentView = view;
    render();
}

async function bootstrapApp() {
    if (!state.token) {
        document.getElementById('auth-screen').classList.remove('hidden-force');
        document.getElementById('app-shell').classList.add('hidden-force');
        lucide.createIcons();
        return;
    }

    try {
        state.user = await api('/auth/me');
        saveSession();
    } catch (error) {
        state.token = null;
        state.user = null;
        localStorage.removeItem(STORAGE_KEY);
        setError('login-error', error.message);
        document.getElementById('auth-screen').classList.remove('hidden-force');
        document.getElementById('app-shell').classList.add('hidden-force');
        return;
    }

    document.getElementById('auth-screen').classList.add('hidden-force');
    document.getElementById('app-shell').classList.remove('hidden-force');
    document.getElementById('session-user').textContent = state.user.username;
    document.getElementById('session-role').textContent = state.user.is_admin ? 'Administrador' : 'Usuário padrão';
    document.getElementById('admin-menu').classList.toggle('hidden-force', !state.user.is_admin);

    if (state.user.must_change_password) {
        document.getElementById('password-change-panel').classList.remove('hidden-force');
        document.getElementById('app-content').classList.add('hidden-force');
    } else {
        document.getElementById('password-change-panel').classList.add('hidden-force');
        document.getElementById('app-content').classList.remove('hidden-force');
        await refreshData({ autoOpenAlerts: true });
    }

    lucide.createIcons();
}

async function refreshData(options = {}) {
    if (!state.user || state.user.must_change_password) return;

    const month = document.getElementById('filter-mes').value;
    const requests = [
        api(`/transactions?month=${month}`),
        api(`/transactions/projection?month=${month}&horizon=12`),
        api(`/transactions/future?month=${month}&horizon=12`),
        api('/categories'),
    ];

    if (state.user.is_admin) {
        requests.push(api('/admin/users'));
        requests.push(api('/admin/categories'));
        requests.push(api('/admin/notification-settings'));
    }

    const [transactionsResponse, projectionResponse, futureResponse, categoriesResponse, usersResponse, adminCategoriesResponse, notificationSettingsResponse] = await Promise.all(requests);

    state.transactions = transactionsResponse.items;
    state.futureProjection = projectionResponse.months;
    state.projection = state.futureProjection.slice(0, 6);
    state.futureItems = futureResponse.items;
    state.categories = categoriesResponse;
    state.alerts = buildAlerts();

    if (state.user.is_admin) {
        state.users = usersResponse;
        state.adminCategories = adminCategoriesResponse;
        state.notificationSettings = notificationSettingsResponse;
    } else {
        state.users = [];
        state.adminCategories = [];
        state.notificationSettings = null;
    }

    updateSubCats();
    render();
    if (options.autoOpenAlerts) maybeOpenAlertsModal(true);
}

async function login(event) {
    event.preventDefault();
    setError('login-error', '');
    try {
        const payload = await api('/auth/login', {
            method: 'POST',
            body: JSON.stringify({
                username: document.getElementById('login-username').value.trim(),
                password: document.getElementById('login-password').value,
            }),
        });
        state.token = payload.access_token;
        state.user = payload.user;
        state.currentView = 'Dashboard';
        saveSession();
        await bootstrapApp();
    } catch (error) {
        setError('login-error', error.message);
    }
}

async function submitTransaction(event) {
    event.preventDefault();
    setError('transaction-error', '');

    const transactionId = document.getElementById('edit-id').value;
    try {
        const payload = {
            description: document.getElementById('form-desc').value.trim(),
            competence: document.getElementById('form-comp').value,
            due_date: document.getElementById('form-venc').value || null,
            amount: normalizeCurrencyInput(document.getElementById('form-valor').value),
            type: document.getElementById('form-tipo').value,
            category: document.getElementById('form-sub').value,
            is_paid: document.getElementById('form-pago').checked,
        };
        await api(transactionId ? `/transactions/${transactionId}` : '/transactions', {
            method: transactionId ? 'PATCH' : 'POST',
            body: JSON.stringify(payload),
        });
        closeTransactionModal();
        showToast(transactionId ? 'Lançamento atualizado' : 'Lançamento criado');
        await refreshData();
    } catch (error) {
        setError('transaction-error', error.message);
    }
}

async function submitPasswordChange(event) {
    event.preventDefault();
    setError('password-change-error', '');

    try {
        state.user = await api('/auth/change-password', {
            method: 'POST',
            body: JSON.stringify({
                current_password: document.getElementById('password-current').value,
                new_password: document.getElementById('password-new').value,
            }),
        });
        saveSession();
        document.getElementById('password-change-form').reset();
        showToast('Senha atualizada');
        await bootstrapApp();
    } catch (error) {
        setError('password-change-error', error.message);
    }
}

async function submitUser(event) {
    event.preventDefault();
    setError('user-error', '');

    try {
        await api('/admin/users', {
            method: 'POST',
            body: JSON.stringify({
                username: document.getElementById('user-username').value.trim(),
                password: document.getElementById('user-password').value,
                is_admin: document.getElementById('user-is-admin').checked,
            }),
        });
        closeUserModal();
        showToast('Usuário criado');
        await refreshData();
    } catch (error) {
        setError('user-error', error.message);
    }
}

async function submitCategory(event) {
    event.preventDefault();
    setError('category-error', '');

    const payload = {
        type: document.getElementById('category-type').value,
        name: document.getElementById('category-name').value.trim(),
        is_active: true,
    };

    try {
        if (state.categoryEditingId) {
            await api(`/admin/categories/${state.categoryEditingId}`, {
                method: 'PATCH',
                body: JSON.stringify({ name: payload.name }),
            });
            showToast('Categoria atualizada');
        } else {
            await api('/admin/categories', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            showToast('Categoria criada');
        }
        resetCategoryForm();
        await refreshData();
    } catch (error) {
        setError('category-error', error.message);
    }
}

async function submitNotificationSettings(event) {
    event.preventDefault();
    setError('notification-settings-error', '');

    const payload = {
        email_enabled: document.getElementById('settings-email-enabled').checked,
        scheduler_enabled: document.getElementById('settings-scheduler-enabled').checked,
        poll_minutes: Number(document.getElementById('settings-poll-minutes').value || 60),
        email_from: document.getElementById('settings-email-from').value.trim() || null,
        email_to: document.getElementById('settings-email-to').value.trim() || null,
        smtp_host: document.getElementById('settings-smtp-host').value.trim() || null,
        smtp_port: Number(document.getElementById('settings-smtp-port').value || 587),
        smtp_user: document.getElementById('settings-smtp-user').value.trim() || null,
        smtp_password: document.getElementById('settings-smtp-password').value || null,
        smtp_starttls: document.getElementById('settings-smtp-starttls').checked,
        smtp_ssl: document.getElementById('settings-smtp-ssl').checked,
    };

    try {
        state.notificationSettings = await api('/admin/notification-settings', {
            method: 'PUT',
            body: JSON.stringify(payload),
        });
        fillNotificationSettingsForm();
        showToast('Configuração de notificações salva');
    } catch (error) {
        setError('notification-settings-error', error.message);
    }
}

async function sendTestNotifications() {
    setError('notification-settings-error', '');
    try {
        const report = await api('/admin/notifications/dispatch', { method: 'POST' });
        showToast(`Disparo concluído: ${report.notifications_sent} enviado(s), ${report.notifications_skipped} ignorado(s)`);
    } catch (error) {
        setError('notification-settings-error', error.message);
    }
}

async function togglePaid(transactionId, nextValue) {
    try {
        await api(`/transactions/${transactionId}`, { method: 'PATCH', body: JSON.stringify({ is_paid: nextValue }) });
        await refreshData();
    } catch (error) {
        showToast(error.message);
    }
}

async function terminateTransaction(transactionId) {
    const confirmed = await showConfirmModal({
        kicker: 'Custo fixo',
        title: 'Encerrar recorrência',
        message: 'Encerrar a recorrência deste custo fixo a partir da competência atual?',
        confirmLabel: 'Encerrar',
        tone: 'warning',
    });
    if (!confirmed) return;

    try {
        await api(`/transactions/${transactionId}/terminate`, { method: 'PATCH' });
        showToast('Recorrência encerrada');
        await refreshData();
    } catch (error) {
        showToast(error.message);
    }
}

async function deleteTransaction(transactionId) {
    const confirmed = await showConfirmModal({
        kicker: 'Exclusão',
        title: 'Excluir lançamento',
        message: 'Excluir permanentemente este lançamento?',
        confirmLabel: 'Excluir',
        tone: 'danger',
    });
    if (!confirmed) return;

    try {
        await api(`/transactions/${transactionId}`, { method: 'DELETE' });
        showToast('Lançamento excluído');
        await refreshData();
    } catch (error) {
        showToast(error.message);
    }
}

async function resetUserPassword(userId) {
    const confirmed = await showConfirmModal({
        kicker: 'Administração',
        title: 'Resetar senha do usuário',
        message: 'Resetar a senha deste usuário para o padrão definido no backend?',
        confirmLabel: 'Resetar',
        tone: 'warning',
    });
    if (!confirmed) return;

    try {
        const result = await api(`/admin/users/${userId}/reset`, { method: 'POST' });
        showToast(`Senha temporária: ${result.temporary_password}`);
        await refreshData();
    } catch (error) {
        showToast(error.message);
    }
}

function editCategory(categoryId) {
    const category = state.adminCategories.find((item) => item.id === categoryId);
    if (!category) return;
    state.categoryEditingId = categoryId;
    document.getElementById('category-type').value = category.type;
    document.getElementById('category-type').disabled = true;
    document.getElementById('category-name').value = category.name;
    document.getElementById('category-submit-button').textContent = 'Atualizar categoria';
    document.getElementById('category-cancel-edit').classList.remove('hidden-force');
    setError('category-error', '');
    changeView('ADMIN_CATEGORIES');
}

async function toggleCategoryActive(categoryId, nextValue) {
    try {
        await api(`/admin/categories/${categoryId}`, {
            method: 'PATCH',
            body: JSON.stringify({ is_active: nextValue }),
        });
        showToast(nextValue ? 'Categoria reativada' : 'Categoria inativada');
        await refreshData();
    } catch (error) {
        showToast(error.message);
    }
}

async function deleteCategory(categoryId) {
    const confirmed = await showConfirmModal({
        kicker: 'Categorias',
        title: 'Excluir categoria',
        message: 'Excluir esta categoria permanentemente? Use inativação se quiser apenas ocultar do formulário.',
        confirmLabel: 'Excluir',
        tone: 'danger',
    });
    if (!confirmed) return;

    try {
        await api(`/admin/categories/${categoryId}`, { method: 'DELETE' });
        if (state.categoryEditingId === categoryId) {
            resetCategoryForm();
        }
        showToast('Categoria excluída');
        await refreshData();
    } catch (error) {
        showToast(error.message);
    }
}

function logout(showMessage = true) {
    state.token = null;
    state.user = null;
    state.transactions = [];
    state.projection = [];
    state.futureProjection = [];
    state.futureItems = [];
    state.users = [];
    state.categories = [];
    state.adminCategories = [];
    state.notificationSettings = null;
    state.alerts = [];
    state.lastAlertSignature = '';
    state.currentView = 'Dashboard';
    state.categoryEditingId = null;
    localStorage.removeItem(STORAGE_KEY);
    if (showMessage) showToast('Sessão finalizada');
    bootstrapApp();
}

document.getElementById('login-form').addEventListener('submit', login);
document.getElementById('finance-form').addEventListener('submit', submitTransaction);
document.getElementById('password-change-form').addEventListener('submit', submitPasswordChange);
document.getElementById('user-form').addEventListener('submit', submitUser);
document.getElementById('category-form').addEventListener('submit', submitCategory);
document.getElementById('notification-settings-form').addEventListener('submit', submitNotificationSettings);
document.getElementById('new-transaction-button').addEventListener('click', () => openTransactionModal());
document.getElementById('new-user-button').addEventListener('click', openUserModal);
document.getElementById('notifications-button').addEventListener('click', () => maybeOpenAlertsModal(true));
document.getElementById('test-notifications-button').addEventListener('click', sendTestNotifications);
document.getElementById('logout-button').addEventListener('click', () => logout());
document.getElementById('logout-button-mobile').addEventListener('click', () => logout());
document.getElementById('filter-mes').addEventListener('change', () => refreshData());
document.getElementById('view-mode').addEventListener('change', () => refreshData());
document.getElementById('dashboard-type-filter').addEventListener('change', render);
document.getElementById('confirm-cancel').addEventListener('click', () => resolveConfirm(false));
document.getElementById('confirm-accept').addEventListener('click', () => resolveConfirm(true));
document.getElementById('admin-link-users').addEventListener('click', () => changeView('ADMIN_USERS'));
document.getElementById('admin-link-categories').addEventListener('click', () => changeView('ADMIN_CATEGORIES'));
document.getElementById('admin-link-notifications').addEventListener('click', () => changeView('ADMIN_NOTIFICATIONS'));
document.getElementById('category-cancel-edit').addEventListener('click', resetCategoryForm);
document.getElementById('form-valor').addEventListener('input', (event) => {
    const cursorAtEnd = event.target.selectionStart === event.target.value.length;
    event.target.value = formatCurrencyInput(event.target.value);
    if (cursorAtEnd) {
        event.target.setSelectionRange(event.target.value.length, event.target.value.length);
    }
});

document.getElementById('filter-mes').value = new Date().toISOString().slice(0, 7);
document.getElementById('dashboard-type-filter').value = 'ALL';
resetCategoryForm();
loadSession();
bootstrapApp();
import { useCallback, useEffect, useState } from 'react';
import { Menu } from 'lucide-react';

import { getToken, requestApi, setToken, setUnauthorizedHandler } from './api.js';
import { currentCompetence } from './helpers.js';
import Sidebar from './components/Sidebar.jsx';
import TopBar from './components/TopBar.jsx';
import LoadingSpinner from './components/LoadingSpinner.jsx';
import LoginView from './views/LoginView.jsx';
import DashboardView from './views/DashboardView.jsx';
import MovimentacoesView from './views/MovimentacoesView.jsx';
import LancamentosView from './views/LancamentosView.jsx';
import NotificacoesView from './views/NotificacoesView.jsx';
import MetasView from './views/MetasView.jsx';
import AdminUsersView from './views/AdminUsersView.jsx';
import AdminCategoriesView from './views/AdminCategoriesView.jsx';
import ModalCriarPlano from './components/ModalCriarPlano.jsx';

const VIEW_TITLES = {
  Dashboard: 'Dashboard',
  Movimentacoes: 'Movimentações',
  Lancamentos: 'Lançamentos',
  Metas: 'Metas',
  Notificacoes: 'Notificações',
  ADMIN_USERS: 'Gestão de usuários',
  ADMIN_CATEGORIES: 'Categorias',
};

const SPRINT_HINTS = {
  Lancamentos: 'A gestão de lançamentos chega na Sprint 4.',
  Metas: 'As metas chegam na Sprint 5.',
  Notificacoes: 'As notificações chegam na Sprint 4.',
  ADMIN_USERS: 'A gestão de usuários chega em breve.',
  ADMIN_CATEGORIES: 'A gestão de categorias chega em breve.',
};

function Placeholder({ view }) {
  return (
    <div className="p-5">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-10 text-center">
        <div className="text-lg font-extrabold text-slate-100">{VIEW_TITLES[view]}</div>
        <p className="mt-2 text-sm text-slate-400">{SPRINT_HINTS[view] || 'Em construção.'}</p>
      </div>
    </div>
  );
}

export default function App() {
  const [token, setTokenState] = useState(() => getToken());
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(Boolean(getToken()));
  const [currentView, setCurrentView] = useState('Dashboard');
  const [competence, setCompetence] = useState(currentCompetence());
  const [loginError, setLoginError] = useState('');
  const [toast, setToast] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const logout = useCallback(() => {
    setToken(null);
    setTokenState(null);
    setUser(null);
    setCurrentView('Dashboard');
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => logout());
  }, [logout]);

  useEffect(() => {
    let active = true;
    if (!token) {
      setBooting(false);
      return undefined;
    }
    setBooting(true);
    requestApi('GET', '/auth/me')
      .then((data) => {
        if (active) setUser(data);
      })
      .catch(() => {
        if (active) logout();
      })
      .finally(() => {
        if (active) setBooting(false);
      });
    return () => {
      active = false;
    };
  }, [token, logout]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function handleLogin({ username, password }) {
    setLoginError('');
    try {
      const result = await requestApi('POST', '/auth/login', { username, password });
      setToken(result.access_token);
      setTokenState(result.access_token);
      setUser(result.user);
      setCurrentView('Dashboard');
    } catch (error) {
      setLoginError(error.message);
    }
  }

  function navigate(view) {
    setCurrentView(view);
    setSidebarOpen(false);
  }

  if (!token || (booting && !user)) {
    if (!token) return <LoginView onSubmit={handleLogin} error={loginError} />;
    return <LoadingSpinner label="Carregando sessão..." />;
  }
  if (!user) return <LoginView onSubmit={handleLogin} error={loginError} />;

  function renderView() {
    if (currentView === 'Dashboard') {
      return (
        <DashboardView
          competence={competence}
          investmentFloorPercent={user.investment_floor_percent}
          onNavigate={navigate}
        />
      );
    }
    if (currentView === 'Movimentacoes') {
      return <MovimentacoesView competence={competence} onToast={setToast} />;
    }
    if (currentView === 'Lancamentos') {
      return <LancamentosView competence={competence} onToast={setToast} reloadKey={reloadKey} />;
    }
    if (currentView === 'Notificacoes') {
      return <NotificacoesView competence={competence} onNavigate={navigate} />;
    }
    if (currentView === 'Metas') {
      return <MetasView onToast={setToast} />;
    }
    if (currentView === 'ADMIN_USERS') {
      return <AdminUsersView onToast={setToast} />;
    }
    if (currentView === 'ADMIN_CATEGORIES') {
      return <AdminCategoriesView onToast={setToast} />;
    }
    return <Placeholder view={currentView} />;
  }

  return (
    <div className="flex min-h-screen">
      {sidebarOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button className="absolute inset-0 bg-slate-950/70" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu" />
          <div className="relative h-full w-64 max-w-[80%]">
            <Sidebar currentView={currentView} onNavigate={navigate} user={user} onLogout={logout} mobile />
          </div>
        </div>
      ) : null}

      <Sidebar currentView={currentView} onNavigate={navigate} user={user} onLogout={logout} />

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 px-4 pt-4 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-xl border border-slate-700 p-2 text-slate-200"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-extrabold">FinTrack Pro</span>
        </div>

        <TopBar
          title={VIEW_TITLES[currentView]}
          competence={competence}
          onCompetenceChange={setCompetence}
          onNewLancamento={() => setCreateOpen(true)}
          onBell={() => navigate('Notificacoes')}
        />

        <div className="flex-1 overflow-y-auto">{renderView()}</div>
      </main>

      {toast ? (
        <div className="fixed bottom-4 right-4 z-[60] rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm text-slate-100 shadow-2xl">
          {toast}
        </div>
      ) : null}

      <ModalCriarPlano
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          setToast('Lançamento criado');
          setReloadKey((k) => k + 1);
          navigate('Lancamentos');
        }}
        defaultCompetence={competence}
      />
    </div>
  );
}

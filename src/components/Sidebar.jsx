import { Bell, LayoutDashboard, List, LogOut, Receipt, Tags, Target, Users, Wallet } from 'lucide-react';

const ITEMS = [
  { key: 'Dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'Movimentacoes', label: 'Movimentações', icon: Receipt },
  { key: 'Lancamentos', label: 'Lançamentos', icon: List },
  { key: 'Metas', label: 'Metas', icon: Target },
  { key: 'Notificacoes', label: 'Notificações', icon: Bell },
  { key: 'ADMIN_USERS', label: 'Gestão de usuários', icon: Users, adminOnly: true },
  { key: 'ADMIN_CATEGORIES', label: 'Categorias', icon: Tags, adminOnly: true },
];

export default function Sidebar({ currentView, onNavigate, user, onLogout, mobile = false }) {
  const items = ITEMS.filter((item) => !item.adminOnly || user?.is_admin);

  return (
    <aside
      className={`${mobile ? 'flex' : 'hidden md:flex'} h-full w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-950/40 p-4`}
    >
      <div className="flex items-center gap-3 px-2 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/15">
          <Wallet className="h-5 w-5 text-sky-300" />
        </div>
        <div>
          <div className="text-[0.65rem] font-black uppercase tracking-[0.3em] text-slate-500">Painel</div>
          <div className="text-lg font-extrabold text-slate-50">FinTrack Pro</div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-slate-500">Sessão</div>
        <div className="mt-1 font-bold text-slate-100">{user?.username}</div>
        <div className="text-xs text-slate-400">{user?.is_admin ? 'Administrador' : 'Usuário'}</div>
      </div>

      <nav className="mt-6 flex-1 space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = currentView === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                active
                  ? 'border-sky-500/40 bg-sky-500/10 text-sky-200'
                  : 'border-transparent text-slate-300 hover:border-slate-700 hover:bg-slate-900/60'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <button
        onClick={onLogout}
        className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-3 text-sm font-bold uppercase tracking-widest text-slate-200 transition hover:bg-slate-900/70"
      >
        <LogOut className="h-4 w-4" /> Sair
      </button>
    </aside>
  );
}

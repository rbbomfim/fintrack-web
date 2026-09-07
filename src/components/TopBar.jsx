import { Bell, Plus } from 'lucide-react';

import { formatCompetence } from '../helpers.js';

export default function TopBar({ title, competence, onCompetenceChange, onNewLancamento, onBell }) {
  return (
    <header data-testid="topbar" className="flex flex-col gap-4 border-b border-slate-800 bg-slate-950/30 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div className="text-[0.65rem] font-black uppercase tracking-[0.25em] text-slate-500">{title}</div>
        <div className="text-xl font-extrabold capitalize text-slate-50">{formatCompetence(competence)}</div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex flex-col">
          <span className="text-[0.6rem] font-bold uppercase tracking-widest text-slate-500">Competência</span>
          <input
            type="month"
            value={competence}
            onChange={(event) => onCompetenceChange(event.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
          />
        </label>
        <button
          onClick={onBell}
          className="rounded-xl border border-slate-700 p-2.5 text-slate-200 transition hover:bg-slate-900"
          aria-label="Notificações"
        >
          <Bell className="h-4 w-4" />
        </button>
        <button
          onClick={onNewLancamento}
          className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-extrabold text-slate-950 transition hover:bg-sky-400"
        >
          <Plus className="h-4 w-4" /> Novo lançamento
        </button>
      </div>
    </header>
  );
}

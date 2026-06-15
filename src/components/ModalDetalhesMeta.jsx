import { useCallback, useEffect, useState } from 'react';

import { requestApi } from '../api.js';
import { formatCurrency, formatDate } from '../helpers.js';
import ModalShell from './ModalShell.jsx';

const FIELD = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none focus:border-emerald-400';

export default function ModalDetalhesMeta({ open, goal, onClose, onChanged }) {
  const [plans, setPlans] = useState([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadPlans = useCallback(() => {
    return requestApi('GET', '/plans?type=INVESTIMENTO')
      .then(setPlans)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!open) return;
    setError('');
    setSelected('');
    loadPlans();
  }, [open, loadPlans]);

  if (!goal) return null;

  const linked = plans.filter((plan) => plan.goal?.id === goal.id);
  const available = plans.filter((plan) => !plan.goal);
  const percent = Math.min(Number(goal.percent || 0), 100);

  async function linkPlan() {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await requestApi('PATCH', `/plans/${selected}`, { goal_id: goal.id });
      setSelected('');
      await loadPlans();
      if (onChanged) onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell open={open} onClose={onClose} eyebrow="Meta" title={goal.title} maxWidth="max-w-xl">
      <div className="space-y-5">
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-4">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-slate-500">Progresso</div>
              <div className="mt-1 text-xl font-extrabold text-emerald-300">
                {formatCurrency(goal.progress)} <span className="text-sm font-bold text-slate-400">de {formatCurrency(goal.target_amount)}</span>
              </div>
            </div>
            <div className="text-2xl font-extrabold text-slate-100">{Number(goal.percent || 0).toFixed(1)}%</div>
          </div>
          <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-900">
            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${percent}%` }} />
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Alvo até {formatDate(goal.target_date)} · {goal.entries_count} aporte(s) pago(s).
          </div>
        </div>

        <div>
          <div className="text-xs font-black uppercase tracking-widest text-slate-500">Planos vinculados</div>
          <div className="mt-2 space-y-2">
            {!linked.length ? <div className="text-sm text-slate-500">Nenhum plano de investimento vinculado.</div> : null}
            {linked.map((plan) => (
              <div key={plan.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-2.5">
                <span className="font-semibold text-slate-100">{plan.description}</span>
                <span className="text-sm text-cyan-300">{formatCurrency(plan.expected_amount)}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs font-black uppercase tracking-widest text-slate-500">Vincular plano</div>
          <div className="mt-2 flex gap-3">
            <select value={selected} onChange={(e) => setSelected(e.target.value)} className={FIELD}>
              <option value="">Selecione um plano de investimento...</option>
              {available.map((plan) => <option key={plan.id} value={plan.id}>{plan.description}</option>)}
            </select>
            <button
              onClick={linkPlan}
              disabled={busy || !selected}
              className="shrink-0 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-extrabold text-slate-950 transition hover:bg-sky-400 disabled:opacity-50"
            >
              Vincular
            </button>
          </div>
          {!available.length ? <p className="mt-2 text-xs text-slate-500">Nenhum plano INVESTIMENTO livre para vincular.</p> : null}
        </div>

        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        <div className="flex justify-end">
          <button onClick={onClose} className="rounded-xl border border-slate-700 px-5 py-2.5 font-bold text-slate-200 transition hover:bg-slate-800">Fechar</button>
        </div>
      </div>
    </ModalShell>
  );
}

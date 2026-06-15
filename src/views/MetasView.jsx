import { useCallback, useEffect, useState } from 'react';
import { Plus, Target } from 'lucide-react';

import { requestApi } from '../api.js';
import { formatCurrency, formatDate } from '../helpers.js';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ModalCriarMeta from '../components/ModalCriarMeta.jsx';
import ModalDetalhesMeta from '../components/ModalDetalhesMeta.jsx';

export default function MetasView({ onToast }) {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    return requestApi('GET', '/goals')
      .then((data) => setGoals(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="m-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-200">{error}</div>;

  return (
    <div className="p-5">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/50">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Metas</div>
            <div className="text-lg font-extrabold text-slate-50">Objetivos de investimento</div>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-extrabold text-slate-950 transition hover:bg-emerald-300"
          >
            <Plus className="h-4 w-4" /> Nova meta
          </button>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          {!goals.length ? (
            <div className="md:col-span-2 rounded-xl border border-slate-800 bg-slate-950/40 p-8 text-center text-sm text-slate-500">
              Nenhuma meta cadastrada. Crie um objetivo e vincule planos de investimento.
            </div>
          ) : null}
          {goals.map((goal) => {
            const percent = Math.min(Number(goal.percent || 0), 100);
            const reached = Number(goal.percent || 0) >= 100;
            return (
              <button
                key={goal.id}
                onClick={() => setDetail(goal)}
                className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 text-left transition hover:border-slate-700 hover:bg-slate-900/60"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-emerald-300" />
                    <span className="font-extrabold text-slate-50">{goal.title}</span>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider ${reached ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300' : 'border-slate-500/30 bg-slate-500/15 text-slate-300'}`}>
                    {reached ? 'Atingida' : 'Em curso'}
                  </span>
                </div>
                <div className="mt-3 text-sm text-slate-400">
                  {formatCurrency(goal.progress)} de {formatCurrency(goal.target_amount)} · alvo {formatDate(goal.target_date)}
                </div>
                <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-900">
                  <div className="h-full rounded-full bg-emerald-400" style={{ width: `${percent}%` }} />
                </div>
                <div className="mt-2 text-right text-sm font-extrabold text-emerald-300">{Number(goal.percent || 0).toFixed(1)}%</div>
              </button>
            );
          })}
        </div>
      </section>

      <ModalCriarMeta
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          if (onToast) onToast('Meta criada');
          load();
        }}
      />
      <ModalDetalhesMeta
        open={Boolean(detail)}
        goal={detail}
        onClose={() => setDetail(null)}
        onChanged={() => {
          if (onToast) onToast('Plano vinculado');
          load();
        }}
      />
    </div>
  );
}

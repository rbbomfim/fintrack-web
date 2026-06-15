import { useEffect, useMemo, useState } from 'react';
import { Bell } from 'lucide-react';

import { requestApi } from '../api.js';
import { daysUntil, formatCurrency, formatDate } from '../helpers.js';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

export default function NotificacoesView({ competence, onNavigate }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    requestApi('GET', `/entries?competence=${competence}`)
      .then((data) => {
        if (active) setEntries(data);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [competence]);

  const alerts = useMemo(
    () =>
      entries
        .filter((entry) => {
          if (entry.status !== 'PENDENTE') return false;
          const diff = daysUntil(entry.due_date);
          return diff !== null && diff <= 3; // vencidas (diff<0), hoje (0) e próximos 3 dias
        })
        .sort((left, right) => (left.due_date || '').localeCompare(right.due_date || '')),
    [entries],
  );

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="m-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-200">{error}</div>;

  return (
    <div className="p-5">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-400/10">
            <Bell className="h-5 w-5 text-amber-300" />
          </div>
          <div>
            <div className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Notificações</div>
            <div className="text-lg font-extrabold text-slate-50">Alertas de vencimento</div>
            <div className="text-sm text-slate-400">
              {alerts.length ? `${alerts.length} lançamento(s) exigindo atenção.` : 'Nenhum alerta crítico nesta competência.'}
            </div>
          </div>
        </div>

        <div className="space-y-3 p-5">
          {!alerts.length ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-6 text-center text-sm text-slate-500">
              Sem vencimentos dentro da janela crítica (vencidos ou nos próximos 3 dias).
            </div>
          ) : null}
          {alerts.map((entry) => (
            <article
              key={entry.id}
              className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="flex items-center gap-3">
                  <div className="font-extrabold text-slate-50">{entry.plan.description}</div>
                  <StatusBadge entry={entry} />
                </div>
                <div className="mt-1 text-sm text-slate-400">
                  Vence em {formatDate(entry.due_date)} · valor previsto {formatCurrency(entry.expected_amount)}
                </div>
              </div>
              <button
                onClick={() => onNavigate('Movimentacoes')}
                className="self-start rounded-xl bg-emerald-400 px-4 py-2 text-sm font-extrabold text-slate-950 transition hover:bg-emerald-300 sm:self-auto"
              >
                Ir para Movimentações
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { OctagonMinus, Pencil, Plus, Trash2 } from 'lucide-react';

import { requestApi } from '../api.js';
import { formatCurrency, paymentLabel, TYPE_LABELS } from '../helpers.js';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import ModalCriarPlano from '../components/ModalCriarPlano.jsx';
import ModalEditarPlano from '../components/ModalEditarPlano.jsx';
import ModalEncerrarPlano from '../components/ModalEncerrarPlano.jsx';

const EXPENSE_TYPES = ['FIXO', 'VARIAVEL'];
const RECURRENCE_LABELS = { MENSAL: 'Mensal', UNICO: 'Única' };
const dueDay = (entry) => (entry.due_date ? `dia ${Number(entry.due_date.slice(8, 10))}` : '--');

export default function LancamentosView({ competence, onToast, reloadKey }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editPlanId, setEditPlanId] = useState(null);
  const [closePlan, setClosePlan] = useState(null);
  const [deleteEntry, setDeleteEntry] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    return requestApi('GET', `/entries?competence=${competence}`)
      .then(setEntries)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [competence]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    requestApi('GET', `/entries?competence=${competence}`)
      .then((d) => active && setEntries(d))
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [competence, reloadKey]);

  const rows = useMemo(
    () => [...entries].sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')),
    [entries],
  );

  async function confirmDelete() {
    setDeleteBusy(true);
    try {
      await requestApi('DELETE', `/plans/${deleteEntry.plan.id}`);
      setDeleteEntry(null);
      if (onToast) onToast('Lançamento excluído');
      await load();
    } catch (err) {
      setDeleteEntry(null);
      if (onToast) {
        onToast(
          err.status === 409
            ? "Não é possível excluir: existe histórico de pagamentos. Use 'Encerrar' para desativar a partir de uma competência."
            : err.message,
        );
      }
    } finally {
      setDeleteBusy(false);
    }
  }

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="m-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-200">{error}</div>;

  return (
    <div className="p-5">
      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50">
        <div className="flex flex-col gap-3 border-b border-slate-800 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Lançamentos</div>
            <div className="text-lg font-extrabold text-slate-50">Planos e lançamentos</div>
            <div className="mt-1 text-sm text-slate-400">Gerencie seus planos recorrentes e lançamentos avulsos</div>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-extrabold text-slate-950 transition hover:bg-sky-400"
          >
            <Plus className="h-4 w-4" /> Novo lançamento
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-slate-900/70 text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">
              <tr>
                <th className="px-5 py-3">Descrição</th>
                <th className="px-5 py-3">Categoria</th>
                <th className="px-5 py-3">Tipo</th>
                <th className="px-5 py-3">Pagamento</th>
                <th className="px-5 py-3 text-right">Valor</th>
                <th className="px-5 py-3">Recorrência</th>
                <th className="px-5 py-3">Dia venc.</th>
                <th className="px-5 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {!rows.length ? (
                <tr><td colSpan="8" className="px-5 py-8 text-center text-slate-500">Nenhum lançamento nesta competência.</td></tr>
              ) : null}
              {rows.map((entry) => {
                const expense = EXPENSE_TYPES.includes(entry.plan.type);
                const value = entry.amount != null ? entry.amount : entry.expected_amount;
                const isRecurring = entry.plan.recurrence === 'MENSAL';
                const canDelete = entry.status !== 'PAGO';
                return (
                  <tr key={entry.id} className="transition hover:bg-slate-900/40">
                    <td className="px-5 py-3 font-bold text-slate-50">{entry.plan.description}</td>
                    <td className="px-5 py-3 text-slate-300">{entry.plan.category?.name || '--'}</td>
                    <td className="px-5 py-3 text-xs uppercase tracking-widest text-slate-400">{TYPE_LABELS[entry.plan.type]}</td>
                    <td className="px-5 py-3 text-slate-300">
                      {paymentLabel(entry.plan.payment_method)}
                      {entry.plan.card ? <span className="ml-1 text-xs text-sky-300">· {entry.plan.card.name}</span> : null}
                    </td>
                    <td className={`px-5 py-3 text-right font-extrabold ${expense ? 'text-rose-300' : 'text-emerald-300'}`}>
                      {expense ? '- ' : ''}
                      {formatCurrency(value)}
                    </td>
                    <td className="px-5 py-3 text-slate-300">{RECURRENCE_LABELS[entry.plan.recurrence] || entry.plan.recurrence}</td>
                    <td className="px-5 py-3 font-mono text-slate-400">{dueDay(entry)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setEditPlanId(entry.plan.id)}
                          className="rounded-lg border border-slate-700 p-2 text-slate-200 transition hover:bg-slate-800"
                          aria-label="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        {isRecurring ? (
                          <button
                            onClick={() => setClosePlan({ id: entry.plan.id, description: entry.plan.description })}
                            className="rounded-lg border border-amber-400/30 p-2 text-amber-200 transition hover:bg-amber-400/10"
                            aria-label="Encerrar recorrência"
                          >
                            <OctagonMinus className="h-4 w-4" />
                          </button>
                        ) : null}
                        {canDelete ? (
                          <button
                            onClick={() => setDeleteEntry(entry)}
                            className="rounded-lg border border-rose-400/30 p-2 text-rose-200 transition hover:bg-rose-400/10"
                            aria-label="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <ModalCriarPlano
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          if (onToast) onToast('Lançamento criado');
          load();
        }}
        defaultCompetence={competence}
      />
      <ModalEditarPlano
        open={Boolean(editPlanId)}
        planId={editPlanId}
        competence={competence}
        onClose={() => setEditPlanId(null)}
        onSaved={() => {
          if (onToast) onToast('Plano atualizado');
          load();
        }}
      />
      <ModalEncerrarPlano
        open={Boolean(closePlan)}
        plan={closePlan}
        onClose={() => setClosePlan(null)}
        onClosed={() => {
          if (onToast) onToast('Recorrência encerrada');
          load();
        }}
      />
      <ConfirmModal
        open={Boolean(deleteEntry)}
        onClose={() => setDeleteEntry(null)}
        onConfirm={confirmDelete}
        title="Excluir lançamento"
        description="Este lançamento será excluído permanentemente, incluindo todo o histórico. Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        tone="danger"
        busy={deleteBusy}
      />
    </div>
  );
}

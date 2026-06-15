import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

import { requestApi } from '../api.js';
import { formatCurrency, formatDate, normalizeAmount, paymentLabel, TYPE_LABELS } from '../helpers.js';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ModalShell from '../components/ModalShell.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

const INCOME_TYPES = ['RECEITA', 'INVESTIMENTO'];
const COST_TYPES = ['FIXO', 'VARIAVEL'];
const byDueDate = (a, b) => (a.due_date || '').localeCompare(b.due_date || '');

export default function MovimentacoesView({ competence, onToast }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalEntry, setModalEntry] = useState(null);
  const [amountInput, setAmountInput] = useState('');
  const [modalError, setModalError] = useState('');
  const [busy, setBusy] = useState(false);

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
  }, [competence]);

  const incomes = useMemo(
    () => entries.filter((e) => INCOME_TYPES.includes(e.plan.type)).sort(byDueDate),
    [entries],
  );
  const costs = useMemo(
    () => entries.filter((e) => COST_TYPES.includes(e.plan.type)).sort(byDueDate),
    [entries],
  );

  function openConfirm(entry) {
    setModalEntry(entry);
    setAmountInput(String(entry.expected_amount));
    setModalError('');
  }

  const isIncome = modalEntry ? INCOME_TYPES.includes(modalEntry.plan.type) : false;

  async function confirm() {
    setModalError('');
    let amount;
    try {
      amount = normalizeAmount(amountInput);
    } catch (e) {
      setModalError(e.message);
      return;
    }
    setBusy(true);
    try {
      await requestApi('PATCH', `/entries/${modalEntry.id}`, { status: 'PAGO', amount });
      setModalEntry(null);
      if (onToast) onToast(isIncome ? 'Entrada confirmada' : 'Pagamento confirmado');
      await load();
    } catch (e) {
      setModalError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="m-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-200">{error}</div>;

  return (
    <div className="space-y-6 p-5">
      <div>
        <div className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Movimentações</div>
        <div className="text-lg font-extrabold text-slate-50">Confirme entradas e dê baixa nos custos da competência</div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50">
        <div className="border-b border-slate-800 px-5 py-4">
          <div className="text-sm font-extrabold text-slate-50">Entradas previstas</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-900/70 text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">
              <tr>
                <th className="px-5 py-3">Venc.</th>
                <th className="px-5 py-3">Descrição</th>
                <th className="px-5 py-3">Categoria</th>
                <th className="px-5 py-3 text-right">Valor previsto</th>
                <th className="px-5 py-3 text-right">Valor real</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-center">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {!incomes.length ? (
                <tr><td colSpan="7" className="px-5 py-8 text-center text-slate-500">Nenhuma entrada nesta competência.</td></tr>
              ) : null}
              {incomes.map((entry) => (
                <tr key={entry.id} className="transition hover:bg-slate-900/40">
                  <td className="px-5 py-3 font-mono text-slate-400">{formatDate(entry.due_date)}</td>
                  <td className="px-5 py-3 font-bold text-slate-50">{entry.plan.description}</td>
                  <td className="px-5 py-3 text-slate-300">{entry.plan.category?.name || '--'}</td>
                  <td className="px-5 py-3 text-right text-slate-300">{formatCurrency(entry.expected_amount)}</td>
                  <td className="px-5 py-3 text-right font-extrabold text-emerald-300">{entry.amount != null ? formatCurrency(entry.amount) : '--'}</td>
                  <td className="px-5 py-3 text-center"><StatusBadge entry={entry} /></td>
                  <td className="px-5 py-3 text-center">
                    {entry.status === 'PENDENTE' ? (
                      <button onClick={() => openConfirm(entry)} className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-950 transition hover:bg-sky-400">
                        <CheckCircle2 className="h-4 w-4" /> Confirmar
                      </button>
                    ) : (
                      <span className="text-xs uppercase tracking-widest text-slate-600">--</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50">
        <div className="border-b border-slate-800 px-5 py-4">
          <div className="text-sm font-extrabold text-slate-50">Custos da competência</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-left text-sm">
            <thead className="bg-slate-900/70 text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">
              <tr>
                <th className="px-5 py-3">Venc.</th>
                <th className="px-5 py-3">Descrição</th>
                <th className="px-5 py-3">Categoria</th>
                <th className="px-5 py-3">Tipo</th>
                <th className="px-5 py-3 text-right">Valor</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-center">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {!costs.length ? (
                <tr><td colSpan="7" className="px-5 py-8 text-center text-slate-500">Nenhum custo nesta competência.</td></tr>
              ) : null}
              {costs.map((entry) => {
                const value = entry.amount != null ? entry.amount : entry.expected_amount;
                return (
                  <tr key={entry.id} className="transition hover:bg-slate-900/40">
                    <td className="px-5 py-3 font-mono text-slate-400">{formatDate(entry.due_date)}</td>
                    <td className="px-5 py-3 font-bold text-slate-50">{entry.plan.description}</td>
                    <td className="px-5 py-3 text-slate-300">{entry.plan.category?.name || '--'}</td>
                    <td className="px-5 py-3 text-xs uppercase tracking-widest text-slate-400">{TYPE_LABELS[entry.plan.type]}</td>
                    <td className="px-5 py-3 text-right font-extrabold text-rose-300">- {formatCurrency(value)}</td>
                    <td className="px-5 py-3 text-center"><StatusBadge entry={entry} /></td>
                    <td className="px-5 py-3 text-center">
                      {entry.status === 'PENDENTE' ? (
                        <button onClick={() => openConfirm(entry)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-950 transition hover:bg-emerald-300">
                          <CheckCircle2 className="h-4 w-4" /> Pagar
                        </button>
                      ) : (
                        <span className="text-xs uppercase tracking-widest text-slate-600">--</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <ModalShell
        open={Boolean(modalEntry)}
        onClose={() => (busy ? null : setModalEntry(null))}
        eyebrow={isIncome ? 'Entrada' : 'Pagamento'}
        title={isIncome ? 'Confirmar entrada' : 'Confirmar pagamento'}
      >
        {modalEntry ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-slate-500">Lançamento</div>
              <div className="mt-1 text-lg font-extrabold text-slate-50">{modalEntry.plan.description}</div>
              <div className="mt-1 text-sm text-slate-400">{paymentLabel(modalEntry.plan.payment_method)} · vencimento {formatDate(modalEntry.due_date)}</div>
            </div>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{isIncome ? 'Valor recebido (R$)' : 'Valor pago (R$)'}</span>
              <input
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                inputMode="decimal"
                className={`mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none ${isIncome ? 'focus:border-sky-500' : 'focus:border-emerald-400'}`}
              />
            </label>
            <p className="text-xs text-slate-500">Ajuste pontual desta competência. O plano permanece inalterado.</p>
            {modalError ? <p className="text-sm text-rose-300">{modalError}</p> : null}
            <div className="flex gap-3 pt-1">
              <button onClick={() => setModalEntry(null)} disabled={busy} className="flex-1 rounded-xl border border-slate-700 px-4 py-3 font-bold text-slate-200 transition hover:bg-slate-800 disabled:opacity-60">Cancelar</button>
              <button onClick={confirm} disabled={busy} className={`flex-[1.4] rounded-xl px-4 py-3 font-extrabold text-slate-950 transition disabled:opacity-60 ${isIncome ? 'bg-sky-500 hover:bg-sky-400' : 'bg-emerald-400 hover:bg-emerald-300'}`}>
                {busy ? 'Processando...' : isIncome ? 'Confirmar entrada' : 'Confirmar pagamento'}
              </button>
            </div>
          </div>
        ) : null}
      </ModalShell>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';

import { requestApi } from '../api.js';
import { formatCurrency, formatDate, paymentLabel } from '../helpers.js';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

const EXPENSE_TYPES = ['FIXO', 'VARIAVEL'];
const num = (value) => Number(value || 0);
const isExpense = (entry) => EXPENSE_TYPES.includes(entry.plan.type);

const SEGMENT_COLORS = ['#34d399', '#fbbf24', '#38bdf8'];
const CATEGORY_COLORS = ['#38bdf8', '#34d399', '#f97316', '#a78bfa', '#fb7185', '#94a3b8'];

function SummaryCard({ label, value, accent, caption }) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/50 px-5 py-4">
      <div className="text-[0.65rem] font-black uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className={`mt-2 text-xl font-extrabold ${accent || 'text-slate-50'}`}>{value}</div>
      {caption ? <div className="mt-1 text-xs text-slate-500">{caption}</div> : null}
    </article>
  );
}

function StackedBar({ segments }) {
  const total = segments.reduce((sum, segment) => sum + Math.max(segment.value, 0), 0);
  return (
    <div>
      <div className="flex h-5 w-full overflow-hidden rounded-full border border-slate-800 bg-slate-950">
        {total > 0
          ? segments.map((segment) => (
              <div
                key={segment.label}
                style={{ width: `${(Math.max(segment.value, 0) / total) * 100}%`, backgroundColor: segment.color }}
                title={`${segment.label}: ${formatCurrency(segment.value)}`}
              />
            ))
          : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-4">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center gap-2 text-xs text-slate-300">
            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: segment.color }} />
            {segment.label}: <strong className="text-slate-100">{formatCurrency(segment.value)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryBars({ rows }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  if (!rows.length) {
    return <div className="py-6 text-sm text-slate-500">Sem custos nesta competência.</div>;
  }
  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={row.label}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-slate-300">{row.label}</span>
            <span className="font-bold text-slate-100">{formatCurrency(row.value)}</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-950">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(row.value / max) * 100}%`,
                backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DashboardView({ competence, investmentFloorPercent = 20, onNavigate }) {
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

  const metrics = useMemo(() => {
    const entradas = entries
      .filter((entry) => entry.plan.type === 'RECEITA')
      .reduce((sum, entry) => sum + num(entry.expected_amount), 0);
    const pagamentos = entries
      .filter((entry) => entry.status === 'PAGO' && entry.plan.type !== 'RECEITA')
      .reduce((sum, entry) => sum + num(entry.amount), 0);
    const saidasPrevistas = entries
      .filter((entry) => entry.status === 'PENDENTE' && isExpense(entry))
      .reduce((sum, entry) => sum + num(entry.expected_amount), 0);
    const investimentos = entries
      .filter((entry) => entry.status === 'PENDENTE' && entry.plan.type === 'INVESTIMENTO')
      .reduce((sum, entry) => sum + num(entry.expected_amount), 0);
    const noCartao = entries
      .filter((entry) => entry.plan.card)
      .reduce((sum, entry) => sum + num(entry.expected_amount), 0);
    const fixosNoCartao = entries
      .filter((entry) => entry.plan.type === 'FIXO' && entry.plan.card)
      .reduce((sum, entry) => sum + num(entry.expected_amount), 0);
    const saldoProjetado = entradas - saidasPrevistas - investimentos;
    const saldoNaReceita = entradas > 0 ? (saldoProjetado / entradas) * 100 : 0;
    return {
      entradas,
      pagamentos,
      saidasPrevistas,
      investimentos,
      noCartao,
      fixosNoCartao,
      saldoProjetado,
      saldoNaReceita,
    };
  }, [entries]);

  const categoryRows = useMemo(() => {
    const totals = {};
    entries
      .filter(isExpense)
      .forEach((entry) => {
        const name = entry.plan.category?.name || 'Sem categoria';
        totals[name] = (totals[name] || 0) + num(entry.expected_amount);
      });
    const ranked = Object.entries(totals)
      .map(([label, value]) => ({ label, value }))
      .sort((left, right) => right.value - left.value);
    const top = ranked.slice(0, 5);
    const restTotal = ranked.slice(5).reduce((sum, row) => sum + row.value, 0);
    if (restTotal > 0) top.push({ label: 'Outras', value: restTotal });
    return top;
  }, [entries]);

  const sortedEntries = useMemo(
    () => [...entries].sort((left, right) => (left.due_date || '').localeCompare(right.due_date || '')),
    [entries],
  );

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-200">{error}</div>;

  return (
    <div className="space-y-6 p-5">
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        <SummaryCard label="Entradas" value={formatCurrency(metrics.entradas)} accent="text-emerald-300" />
        <SummaryCard label="Pagamentos" value={formatCurrency(metrics.pagamentos)} accent="text-rose-300" caption="Já liquidados" />
        <SummaryCard label="Saídas previstas" value={formatCurrency(metrics.saidasPrevistas)} accent="text-amber-200" caption="Ainda em aberto" />
        <SummaryCard label="Investimentos" value={formatCurrency(metrics.investimentos)} accent="text-cyan-300" caption="Aportes previstos" />
        <SummaryCard label="No cartão" value={formatCurrency(metrics.noCartao)} accent="text-sky-300" />
        <SummaryCard label="Fixos no cartão" value={formatCurrency(metrics.fixosNoCartao)} accent="text-indigo-200" />
        <SummaryCard
          label="Piso p/ investir"
          value={`${investmentFloorPercent}%`}
          accent="text-cyan-300"
          caption={metrics.entradas > 0 ? formatCurrency(metrics.entradas * (investmentFloorPercent / 100)) : '--'}
        />
        <SummaryCard
          label="Saldo projetado"
          value={formatCurrency(metrics.saldoProjetado)}
          accent={metrics.saldoProjetado >= 0 ? 'text-slate-50' : 'text-rose-300'}
          caption="Entradas − saídas − investimentos"
        />
        <SummaryCard
          label="Saldo na receita"
          value={`${metrics.saldoNaReceita.toFixed(1)}%`}
          accent={metrics.saldoNaReceita >= 0 ? 'text-emerald-300' : 'text-rose-300'}
          caption="Saldo projetado sobre entradas"
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Panorama operacional</div>
          <div className="mb-4 text-lg font-extrabold text-slate-50">Distribuição da competência</div>
          <StackedBar
            segments={[
              { label: 'Pagamentos realizados', value: metrics.pagamentos, color: SEGMENT_COLORS[0] },
              { label: 'A pagar', value: metrics.saidasPrevistas, color: SEGMENT_COLORS[1] },
              { label: 'Saldo projetado', value: Math.max(metrics.saldoProjetado, 0), color: SEGMENT_COLORS[2] },
            ]}
          />
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Custos por categoria</div>
          <div className="mb-4 text-lg font-extrabold text-slate-50">Top 5 + Outras</div>
          <CategoryBars rows={categoryRows} />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50">
        <div className="flex flex-col gap-3 border-b border-slate-800 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Lançamentos</div>
            <div className="text-lg font-extrabold text-slate-50">Visão da competência (somente leitura)</div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm font-semibold">
            <button onClick={() => onNavigate('Movimentacoes')} className="text-sky-300 transition hover:text-sky-200">
              Gerenciar movimentações →
            </button>
            <button onClick={() => onNavigate('Lancamentos')} className="text-sky-300 transition hover:text-sky-200">
              Gerenciar lançamentos →
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-900/70 text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">
              <tr>
                <th className="px-5 py-3">Venc.</th>
                <th className="px-5 py-3">Descrição</th>
                <th className="px-5 py-3">Categoria</th>
                <th className="px-5 py-3">Pagamento</th>
                <th className="px-5 py-3 text-right">Valor</th>
                <th className="px-5 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {!sortedEntries.length ? (
                <tr>
                  <td colSpan="6" className="px-5 py-8 text-center text-slate-500">
                    Nenhum lançamento nesta competência.
                  </td>
                </tr>
              ) : null}
              {sortedEntries.map((entry) => {
                const expense = isExpense(entry);
                const value = entry.amount != null ? entry.amount : entry.expected_amount;
                return (
                  <tr key={entry.id} className="transition hover:bg-slate-900/40">
                    <td className="px-5 py-3 font-mono text-slate-400">{formatDate(entry.due_date)}</td>
                    <td className="px-5 py-3 font-bold text-slate-50">{entry.plan.description}</td>
                    <td className="px-5 py-3 text-slate-300">{entry.plan.category?.name || '--'}</td>
                    <td className="px-5 py-3 text-slate-300">
                      {paymentLabel(entry.plan.payment_method)}
                      {entry.plan.card ? <span className="ml-1 text-xs text-sky-300">· {entry.plan.card.name}</span> : null}
                    </td>
                    <td className={`px-5 py-3 text-right font-extrabold ${expense ? 'text-rose-300' : 'text-emerald-300'}`}>
                      {expense ? '- ' : ''}
                      {formatCurrency(value)}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <StatusBadge entry={entry} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

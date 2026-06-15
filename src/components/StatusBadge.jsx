import { daysUntil } from '../helpers.js';

const NEUTRAL = 'bg-slate-500/15 text-slate-300 border-slate-500/30';
const GREEN = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
const AMBER = 'bg-amber-400/15 text-amber-200 border-amber-400/30';
const RED = 'bg-rose-500/15 text-rose-300 border-rose-500/30';
const BLUE = 'bg-sky-500/15 text-sky-300 border-sky-500/30';

const INCOME_TYPES = ['RECEITA', 'INVESTIMENTO'];

export function getStatusInfo(entry) {
  if (INCOME_TYPES.includes(entry.plan?.type)) {
    if (entry.status === 'PAGO') return { label: 'RECEBIDO', className: GREEN };
    if (entry.status === 'IGNORADO') return { label: 'IGNORADO', className: NEUTRAL };
    return { label: 'PREVISTO', className: BLUE };
  }

  if (entry.status === 'PAGO') return { label: 'PAGO', className: GREEN };
  if (entry.status === 'IGNORADO') return { label: 'IGNORADO', className: NEUTRAL };

  const diff = daysUntil(entry.due_date);
  if (diff === null) return { label: 'PENDENTE', className: NEUTRAL };
  if (diff < 0) return { label: 'VENCIDO', className: RED };
  if (diff === 0) return { label: 'VENCE HOJE', className: AMBER };
  if (diff <= 3) return { label: `FALTAM ${diff} DIA${diff > 1 ? 'S' : ''}`, className: AMBER };
  return { label: 'PENDENTE', className: NEUTRAL };
}

export default function StatusBadge({ entry }) {
  const info = getStatusInfo(entry);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-wider ${info.className}`}
    >
      {info.label}
    </span>
  );
}

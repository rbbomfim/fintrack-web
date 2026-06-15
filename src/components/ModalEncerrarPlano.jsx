import { useEffect, useState } from 'react';

import { requestApi } from '../api.js';
import { currentCompetence, shiftCompetence } from '../helpers.js';
import ModalShell from './ModalShell.jsx';

const FIELD = 'mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none focus:border-amber-400';
const LABEL = 'block text-xs font-bold uppercase tracking-widest text-slate-400';

export default function ModalEncerrarPlano({ open, onClose, onClosed, plan }) {
  const [endCompetence, setEndCompetence] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEndCompetence(shiftCompetence(currentCompetence(), 1));
    setError('');
  }, [open]);

  async function confirm() {
    setError('');
    setBusy(true);
    try {
      await requestApi('PATCH', `/plans/${plan.id}/close`, { end_competence: endCompetence });
      onClosed();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!plan) return null;

  return (
    <ModalShell open={open} onClose={busy ? () => {} : onClose} eyebrow="Recorrência" title="Encerrar recorrência">
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-slate-500">Plano</div>
          <div className="mt-1 text-lg font-extrabold text-slate-50">{plan.description}</div>
        </div>
        <label className="block">
          <span className={LABEL}>Encerrar a partir de</span>
          <input value={endCompetence} onChange={(e) => setEndCompetence(e.target.value)} type="month" className={FIELD} />
        </label>
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          Lançamentos futuros não pagos serão removidos da previsão. O histórico pago é mantido.
        </div>
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} disabled={busy} className="flex-1 rounded-xl border border-slate-700 px-4 py-3 font-bold text-slate-200 transition hover:bg-slate-800 disabled:opacity-60">Cancelar</button>
          <button onClick={confirm} disabled={busy} className="flex-[1.4] rounded-xl bg-amber-400 px-4 py-3 font-extrabold text-slate-950 transition hover:bg-amber-300 disabled:opacity-60">{busy ? 'Processando...' : 'Encerrar recorrência'}</button>
        </div>
      </div>
    </ModalShell>
  );
}

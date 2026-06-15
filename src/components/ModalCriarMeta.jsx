import { useEffect, useState } from 'react';

import { requestApi } from '../api.js';
import { currentCompetence, normalizeAmount } from '../helpers.js';
import ModalShell from './ModalShell.jsx';

const FIELD = 'mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none focus:border-emerald-400';
const LABEL = 'block text-xs font-bold uppercase tracking-widest text-slate-400';

function emptyForm() {
  return { title: '', target_amount: '', target_date: '', start_month: currentCompetence() };
}

export default function ModalCriarMeta({ open, onClose, onCreated }) {
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(emptyForm());
      setError('');
    }
  }, [open]);

  function patch(values) {
    setForm((current) => ({ ...current, ...values }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    let target;
    try {
      target = normalizeAmount(form.target_amount);
    } catch (err) {
      setError(err.message);
      return;
    }
    setBusy(true);
    try {
      await requestApi('POST', '/goals', {
        title: form.title.trim(),
        target_amount: target,
        target_date: form.target_date,
        start_month: `${form.start_month}-01`,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell open={open} onClose={busy ? () => {} : onClose} eyebrow="Meta" title="Nova meta">
      <form className="space-y-4" onSubmit={submit}>
        <label className="block">
          <span className={LABEL}>Título</span>
          <input value={form.title} onChange={(e) => patch({ title: e.target.value })} required className={FIELD} />
        </label>
        <label className="block">
          <span className={LABEL}>Valor alvo (R$)</span>
          <input value={form.target_amount} onChange={(e) => patch({ target_amount: e.target.value })} inputMode="decimal" required placeholder="0,00" className={FIELD} />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className={LABEL}>Data alvo</span>
            <input value={form.target_date} onChange={(e) => patch({ target_date: e.target.value })} type="date" required className={FIELD} />
          </label>
          <label className="block">
            <span className={LABEL}>Mês de início</span>
            <input value={form.start_month} onChange={(e) => patch({ start_month: e.target.value })} type="month" required className={FIELD} />
          </label>
        </div>
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} disabled={busy} className="flex-1 rounded-xl border border-slate-700 px-4 py-3 font-bold text-slate-200 transition hover:bg-slate-800 disabled:opacity-60">Cancelar</button>
          <button type="submit" disabled={busy} className="flex-[1.4] rounded-xl bg-emerald-400 px-4 py-3 font-extrabold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-60">{busy ? 'Salvando...' : 'Criar meta'}</button>
        </div>
      </form>
    </ModalShell>
  );
}

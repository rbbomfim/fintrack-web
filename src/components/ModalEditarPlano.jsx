import { useEffect, useState } from 'react';

import { requestApi } from '../api.js';
import { normalizeAmount, TYPE_LABELS } from '../helpers.js';
import ModalShell from './ModalShell.jsx';

const FIELD = 'mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none focus:border-sky-500';
const LABEL = 'block text-xs font-bold uppercase tracking-widest text-slate-400';

const PAYMENT_OPTIONS = [
  { value: 'CONTA', label: 'Conta / caixa' },
  { value: 'CARTAO', label: 'Cartão de crédito' },
  { value: 'PIX', label: 'Pix' },
  { value: 'OUTRO', label: 'Outro' },
];

function normalizePayment(plan) {
  const pm = plan.payment_method;
  if (PAYMENT_OPTIONS.some((o) => o.value === pm)) return pm;
  if (pm === 'CARTAO_CREDITO' || plan.card) return 'CARTAO';
  return 'CONTA';
}

function competenceDate(competence, dueDay) {
  if (dueDay == null || !competence) return '';
  const [y, m] = competence.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const day = Math.min(Math.max(dueDay, 1), last);
  return `${competence}-${String(day).padStart(2, '0')}`;
}

export default function ModalEditarPlano({ open, onClose, onSaved, planId, competence }) {
  const [plan, setPlan] = useState(null);
  const [form, setForm] = useState(null);
  const [categories, setCategories] = useState([]);
  const [cards, setCards] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function patch(values) {
    setForm((current) => ({ ...current, ...values }));
  }

  useEffect(() => {
    if (!open || !planId) return;
    setError('');
    setForm(null);
    setPlan(null);
    requestApi('GET', `/plans/${planId}`)
      .then((data) => {
        setPlan(data);
        setForm({
          description: data.description,
          category_id: data.category?.id || '',
          expected_amount: String(data.expected_amount),
          due_date: competenceDate(competence, data.due_day),
          payment_method: normalizePayment(data),
          card_id: data.card?.id || '',
          notes: data.notes || '',
        });
        return Promise.all([
          requestApi('GET', `/categories?type=${data.type}`),
          requestApi('GET', '/cards?is_active=true'),
        ]);
      })
      .then(([categoryList, cardList]) => {
        setCategories(categoryList.filter((category) => category.is_active));
        setCards(cardList);
      })
      .catch((err) => setError(err.message));
  }, [open, planId]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    let expected;
    try {
      expected = normalizeAmount(form.expected_amount);
    } catch (err) {
      setError(err.message);
      return;
    }
    setBusy(true);
    try {
      await requestApi('PATCH', `/plans/${planId}`, {
        description: form.description.trim(),
        category_id: form.category_id,
        expected_amount: expected,
        due_day: form.due_date ? Number(form.due_date.slice(8, 10)) : null,
        payment_method: form.payment_method.trim() || 'CONTA',
        card_id: form.card_id || null,
        notes: form.notes.trim() || null,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell open={open} onClose={busy ? () => {} : onClose} eyebrow="Lançamento" title="Editar plano" maxWidth="max-w-2xl">
      {!form ? (
        <p className="py-6 text-sm text-slate-400">{error || 'Carregando...'}</p>
      ) : (
        <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
          <div className="md:col-span-2 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-2 text-xs text-slate-400">
            Tipo <strong className="text-slate-200">{TYPE_LABELS[plan.type]}</strong> e recorrência{' '}
            <strong className="text-slate-200">{plan.recurrence}</strong> não são editáveis após a criação.
          </div>
          <label className="md:col-span-2">
            <span className={LABEL}>Descrição</span>
            <input value={form.description} onChange={(e) => patch({ description: e.target.value })} required className={FIELD} />
          </label>
          <label>
            <span className={LABEL}>Categoria</span>
            <select value={form.category_id} onChange={(e) => patch({ category_id: e.target.value })} required className={FIELD}>
              <option value="">Selecione...</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label>
            <span className={LABEL}>Valor previsto (R$)</span>
            <input value={form.expected_amount} onChange={(e) => patch({ expected_amount: e.target.value })} inputMode="decimal" required className={FIELD} />
          </label>
          <label>
            <span className={LABEL}>Data de vencimento</span>
            <input value={form.due_date} onChange={(e) => patch({ due_date: e.target.value })} type="date" className={FIELD} />
            <span className="mt-1 block text-xs text-slate-500">O dia será usado como referência mensal para lançamentos recorrentes.</span>
          </label>
          <label>
            <span className={LABEL}>Forma de pagamento</span>
            <select
              value={form.payment_method}
              onChange={(e) => patch({ payment_method: e.target.value, card_id: e.target.value === 'CARTAO' ? form.card_id : '' })}
              className={FIELD}
            >
              {PAYMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          {form.payment_method === 'CARTAO' ? (
            <label className="md:col-span-2">
              <span className={LABEL}>Cartão</span>
              <select value={form.card_id} onChange={(e) => patch({ card_id: e.target.value })} className={FIELD}>
                <option value="">Sem cartão</option>
                {cards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}
              </select>
            </label>
          ) : null}
          <label className="md:col-span-2">
            <span className={LABEL}>Observações</span>
            <textarea value={form.notes} onChange={(e) => patch({ notes: e.target.value })} rows={2} className={FIELD} />
          </label>
          {error ? <p className="md:col-span-2 text-sm text-rose-300">{error}</p> : null}
          <div className="md:col-span-2 flex gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={busy} className="flex-1 rounded-xl border border-slate-700 px-4 py-3 font-bold text-slate-200 transition hover:bg-slate-800 disabled:opacity-60">Cancelar</button>
            <button type="submit" disabled={busy} className="flex-[1.4] rounded-xl bg-sky-500 px-4 py-3 font-extrabold text-slate-950 transition hover:bg-sky-400 disabled:opacity-60">{busy ? 'Salvando...' : 'Salvar alterações'}</button>
          </div>
        </form>
      )}
    </ModalShell>
  );
}

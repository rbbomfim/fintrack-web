import { useEffect, useState } from 'react';

import { requestApi } from '../api.js';
import { currentCompetence, normalizeAmount } from '../helpers.js';
import ModalShell from './ModalShell.jsx';

const TYPE_OPTIONS = [
  { value: 'FIXO', label: 'Custo fixo' },
  { value: 'VARIAVEL', label: 'Custo variável' },
  { value: 'RECEITA', label: 'Receita' },
  { value: 'INVESTIMENTO', label: 'Investimento' },
];

const RECURRENCE_OPTIONS = [
  { value: 'MENSAL', label: 'Mensal' },
  { value: 'UNICO', label: 'Único' },
];

const PAYMENT_OPTIONS = [
  { value: 'CONTA', label: 'Conta / caixa' },
  { value: 'CARTAO', label: 'Cartão de crédito' },
  { value: 'PIX', label: 'Pix' },
  { value: 'OUTRO', label: 'Outro' },
];

const FIELD = 'mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none focus:border-sky-500';
const LABEL = 'block text-xs font-bold uppercase tracking-widest text-slate-400';

function emptyForm(competence) {
  return {
    description: '',
    type: 'FIXO',
    recurrence: 'MENSAL',
    category_id: '',
    expected_amount: '',
    due_date: '',
    start_competence: competence,
    payment_method: 'CONTA',
    card_id: '',
    notes: '',
  };
}

export default function ModalCriarPlano({ open, onClose, onCreated, defaultCompetence }) {
  const [form, setForm] = useState(emptyForm(defaultCompetence || currentCompetence()));
  const [categories, setCategories] = useState([]);
  const [cards, setCards] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function patch(values) {
    setForm((current) => ({ ...current, ...values }));
  }

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm(defaultCompetence || currentCompetence()));
    setError('');
    requestApi('GET', '/cards?is_active=true')
      .then(setCards)
      .catch(() => setCards([]));
  }, [open, defaultCompetence]);

  useEffect(() => {
    if (!open) return;
    requestApi('GET', `/categories?type=${form.type}`)
      .then((data) => {
        setCategories(data.filter((category) => category.is_active));
        setForm((current) => ({ ...current, category_id: '' }));
      })
      .catch(() => setCategories([]));
  }, [open, form.type]);

  // Default de recorrência conforme o tipo (o usuário ainda pode trocar manualmente depois).
  useEffect(() => {
    const single = form.type === 'RECEITA' || form.type === 'VARIAVEL';
    setForm((current) => ({ ...current, recurrence: single ? 'UNICO' : 'MENSAL' }));
  }, [form.type]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!form.category_id) {
      setError('Selecione uma categoria.');
      return;
    }
    let expected;
    try {
      expected = normalizeAmount(form.expected_amount);
    } catch (err) {
      setError(err.message);
      return;
    }
    setBusy(true);
    try {
      await requestApi('POST', '/plans', {
        description: form.description.trim(),
        type: form.type,
        recurrence: form.recurrence,
        category_id: form.category_id,
        expected_amount: expected,
        due_day: form.due_date ? Number(form.due_date.slice(8, 10)) : null,
        start_competence: form.start_competence,
        payment_method: form.payment_method.trim() || 'CONTA',
        card_id: form.card_id || null,
        notes: form.notes.trim() || null,
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
    <ModalShell open={open} onClose={busy ? () => {} : onClose} eyebrow="Lançamento" title="Novo lançamento" maxWidth="max-w-2xl">
      <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
        <label className="md:col-span-2">
          <span className={LABEL}>Descrição</span>
          <input value={form.description} onChange={(e) => patch({ description: e.target.value })} required className={FIELD} />
        </label>
        <label>
          <span className={LABEL}>Tipo</span>
          <select value={form.type} onChange={(e) => patch({ type: e.target.value })} className={FIELD}>
            {TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          <span className={LABEL}>Recorrência</span>
          <select value={form.recurrence} onChange={(e) => patch({ recurrence: e.target.value })} className={FIELD}>
            {RECURRENCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
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
          <input value={form.expected_amount} onChange={(e) => patch({ expected_amount: e.target.value })} inputMode="decimal" required placeholder="0,00" className={FIELD} />
        </label>
        <label>
          <span className={LABEL}>Data de vencimento</span>
          <input value={form.due_date} onChange={(e) => patch({ due_date: e.target.value })} type="date" className={FIELD} />
          <span className="mt-1 block text-xs text-slate-500">O dia será usado como referência mensal para lançamentos recorrentes.</span>
        </label>
        <label>
          <span className={LABEL}>Competência de início</span>
          <input value={form.start_competence} onChange={(e) => patch({ start_competence: e.target.value })} type="month" required className={FIELD} />
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
          <label>
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
          <button type="submit" disabled={busy} className="flex-[1.4] rounded-xl bg-sky-500 px-4 py-3 font-extrabold text-slate-950 transition hover:bg-sky-400 disabled:opacity-60">{busy ? 'Salvando...' : 'Criar lançamento'}</button>
        </div>
      </form>
    </ModalShell>
  );
}

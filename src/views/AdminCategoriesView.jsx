import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';

import { requestApi } from '../api.js';
import { TYPE_LABELS } from '../helpers.js';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ModalShell from '../components/ModalShell.jsx';

const TYPE_OPTIONS = [
  { value: 'FIXO', label: 'Custo fixo' },
  { value: 'VARIAVEL', label: 'Custo variável' },
  { value: 'RECEITA', label: 'Receita' },
  { value: 'INVESTIMENTO', label: 'Investimento' },
];
const FIELD = 'mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none focus:border-sky-500';
const LABEL = 'block text-xs font-bold uppercase tracking-widest text-slate-400';

export default function AdminCategoriesView({ onToast }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', type: 'FIXO' });
  const [editCat, setEditCat] = useState(null);
  const [editName, setEditName] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    return requestApi('GET', '/categories')
      .then(setCategories)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    const list = typeFilter === 'ALL' ? categories : categories.filter((c) => c.type === typeFilter);
    return [...list].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  }, [categories, typeFilter]);

  async function createCategory(event) {
    event.preventDefault();
    setFormError('');
    setBusy(true);
    try {
      await requestApi('POST', '/categories', { type: createForm.type, name: createForm.name.trim(), is_active: true });
      setCreateOpen(false);
      setCreateForm({ name: '', type: 'FIXO' });
      if (onToast) onToast('Categoria criada');
      await load();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(event) {
    event.preventDefault();
    setFormError('');
    setBusy(true);
    try {
      await requestApi('PATCH', `/categories/${editCat.id}`, { name: editName.trim() });
      setEditCat(null);
      if (onToast) onToast('Categoria atualizada');
      await load();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(cat) {
    try {
      await requestApi('PATCH', `/categories/${cat.id}`, { is_active: !cat.is_active });
      if (onToast) onToast(cat.is_active ? 'Categoria desativada' : 'Categoria reativada');
      await load();
    } catch (e) {
      if (onToast) onToast(e.message);
    }
  }

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="m-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-200">{error}</div>;

  return (
    <div className="p-5">
      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50">
        <div className="flex flex-col gap-3 border-b border-slate-800 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Admin</div>
            <div className="text-lg font-extrabold text-slate-50">Categorias</div>
          </div>
          <div className="flex items-center gap-3">
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500">
              <option value="ALL">Todos os tipos</option>
              {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button
              onClick={() => {
                setCreateForm({ name: '', type: 'FIXO' });
                setFormError('');
                setCreateOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-extrabold text-slate-950 transition hover:bg-emerald-300"
            >
              <Plus className="h-4 w-4" /> Nova categoria
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-900/70 text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">
              <tr>
                <th className="px-5 py-3">Nome</th>
                <th className="px-5 py-3">Tipo</th>
                <th className="px-5 py-3 text-center">Ativa</th>
                <th className="px-5 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {!rows.length ? (
                <tr><td colSpan="4" className="px-5 py-8 text-center text-slate-500">Nenhuma categoria.</td></tr>
              ) : null}
              {rows.map((cat) => (
                <tr key={cat.id} className="transition hover:bg-slate-900/40">
                  <td className="px-5 py-3 font-bold text-slate-50">{cat.name}</td>
                  <td className="px-5 py-3 text-xs uppercase tracking-widest text-slate-400">{TYPE_LABELS[cat.type]}</td>
                  <td className="px-5 py-3 text-center">
                    {cat.is_active ? (
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-[0.65rem] font-bold uppercase text-emerald-300">Ativa</span>
                    ) : (
                      <span className="rounded-full border border-slate-500/30 bg-slate-500/15 px-2.5 py-1 text-[0.65rem] font-bold uppercase text-slate-300">Inativa</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => { setEditCat(cat); setEditName(cat.name); setFormError(''); }} className="rounded-lg border border-slate-700 p-2 text-slate-200 transition hover:bg-slate-800" aria-label="Editar"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => toggleActive(cat)} className={`rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${cat.is_active ? 'border-amber-400/30 text-amber-200 hover:bg-amber-400/10' : 'border-emerald-400/30 text-emerald-200 hover:bg-emerald-400/10'}`}>{cat.is_active ? 'Desativar' : 'Reativar'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ModalShell open={createOpen} onClose={() => (busy ? null : setCreateOpen(false))} eyebrow="Categoria" title="Nova categoria">
        <form className="space-y-4" onSubmit={createCategory}>
          <label className="block">
            <span className={LABEL}>Nome</span>
            <input value={createForm.name} onChange={(e) => setCreateForm((c) => ({ ...c, name: e.target.value }))} required className={FIELD} />
          </label>
          <label className="block">
            <span className={LABEL}>Tipo</span>
            <select value={createForm.type} onChange={(e) => setCreateForm((c) => ({ ...c, type: e.target.value }))} className={FIELD}>
              {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          {formError ? <p className="text-sm text-rose-300">{formError}</p> : null}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => setCreateOpen(false)} disabled={busy} className="flex-1 rounded-xl border border-slate-700 px-4 py-3 font-bold text-slate-200 transition hover:bg-slate-800 disabled:opacity-60">Cancelar</button>
            <button type="submit" disabled={busy} className="flex-[1.4] rounded-xl bg-emerald-400 px-4 py-3 font-extrabold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-60">{busy ? 'Salvando...' : 'Criar categoria'}</button>
          </div>
        </form>
      </ModalShell>

      <ModalShell open={Boolean(editCat)} onClose={() => (busy ? null : setEditCat(null))} eyebrow="Categoria" title="Editar categoria">
        {editCat ? (
          <form className="space-y-4" onSubmit={saveEdit}>
            <div className="text-sm text-slate-400">Tipo <strong className="text-slate-200">{TYPE_LABELS[editCat.type]}</strong> (não editável).</div>
            <label className="block">
              <span className={LABEL}>Nome</span>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} required className={FIELD} />
            </label>
            {formError ? <p className="text-sm text-rose-300">{formError}</p> : null}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setEditCat(null)} disabled={busy} className="flex-1 rounded-xl border border-slate-700 px-4 py-3 font-bold text-slate-200 transition hover:bg-slate-800 disabled:opacity-60">Cancelar</button>
              <button type="submit" disabled={busy} className="flex-[1.4] rounded-xl bg-sky-500 px-4 py-3 font-extrabold text-slate-950 transition hover:bg-sky-400 disabled:opacity-60">{busy ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </form>
        ) : null}
      </ModalShell>
    </div>
  );
}

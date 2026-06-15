import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';

import { requestApi } from '../api.js';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ModalShell from '../components/ModalShell.jsx';

const FIELD = 'mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none focus:border-sky-500';
const LABEL = 'block text-xs font-bold uppercase tracking-widest text-slate-400';

export default function AdminUsersView({ onToast }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', is_admin: false });
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    return requestApi('GET', '/admin/users')
      .then(setUsers)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(event) {
    event.preventDefault();
    setFormError('');
    setBusy(true);
    try {
      await requestApi('POST', '/admin/users', {
        username: form.username.trim(),
        password: form.password,
        is_admin: form.is_admin,
      });
      setOpen(false);
      setForm({ username: '', password: '', is_admin: false });
      if (onToast) onToast('Usuário criado');
      await load();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="m-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-200">{error}</div>;

  return (
    <div className="p-5">
      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Admin</div>
            <div className="text-lg font-extrabold text-slate-50">Gestão de usuários</div>
          </div>
          <button
            onClick={() => {
              setForm({ username: '', password: '', is_admin: false });
              setFormError('');
              setOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-extrabold text-slate-950 transition hover:bg-emerald-300"
          >
            <Plus className="h-4 w-4" /> Novo usuário
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-900/70 text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">
              <tr>
                <th className="px-5 py-3">Usuário</th>
                <th className="px-5 py-3">Perfil</th>
                <th className="px-5 py-3">Troca de senha obrigatória</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {!users.length ? (
                <tr><td colSpan="3" className="px-5 py-8 text-center text-slate-500">Nenhum usuário.</td></tr>
              ) : null}
              {users.map((u) => (
                <tr key={u.id} className="transition hover:bg-slate-900/40">
                  <td className="px-5 py-3 font-bold text-slate-50">{u.username}</td>
                  <td className="px-5 py-3">
                    {u.is_admin ? (
                      <span className="rounded-full border border-sky-500/30 bg-sky-500/15 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-sky-300">Administrador</span>
                    ) : (
                      <span className="text-slate-300">Usuário</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-300">{u.must_change_password ? 'Sim' : 'Não'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ModalShell open={open} onClose={() => (busy ? null : setOpen(false))} eyebrow="Admin" title="Novo usuário">
        <form className="space-y-4" onSubmit={submit}>
          <label className="block">
            <span className={LABEL}>Usuário</span>
            <input value={form.username} onChange={(e) => setForm((c) => ({ ...c, username: e.target.value }))} required minLength={3} className={FIELD} />
          </label>
          <label className="block">
            <span className={LABEL}>Senha inicial</span>
            <input type="password" value={form.password} onChange={(e) => setForm((c) => ({ ...c, password: e.target.value }))} required minLength={6} className={FIELD} />
          </label>
          <label className="flex items-center gap-3 text-sm text-slate-300">
            <input type="checkbox" checked={form.is_admin} onChange={(e) => setForm((c) => ({ ...c, is_admin: e.target.checked }))} className="h-4 w-4 rounded border-slate-600 bg-slate-900" />
            Criar como administrador
          </label>
          {formError ? <p className="text-sm text-rose-300">{formError}</p> : null}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => setOpen(false)} disabled={busy} className="flex-1 rounded-xl border border-slate-700 px-4 py-3 font-bold text-slate-200 transition hover:bg-slate-800 disabled:opacity-60">Cancelar</button>
            <button type="submit" disabled={busy} className="flex-[1.4] rounded-xl bg-emerald-400 px-4 py-3 font-extrabold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-60">{busy ? 'Salvando...' : 'Criar usuário'}</button>
          </div>
        </form>
      </ModalShell>
    </div>
  );
}

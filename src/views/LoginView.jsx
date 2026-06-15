import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';

export default function LoginView({ onSubmit, error }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSubmit({ username: username.trim(), password });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="glass w-full max-w-5xl rounded-[2rem] overflow-hidden grid lg:grid-cols-[1.15fr_0.85fr] fade-in">
        <section className="p-10 lg:p-14 border-b lg:border-b-0 lg:border-r border-slate-800/80">
          <div className="inline-flex items-center gap-3 rounded-full border border-sky-500/20 bg-sky-500/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.25em] text-sky-300">FinTrack Pro</div>
          <h1 className="mt-8 text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight">Controle financeiro com competência mensal, recorrência automática e gestão multiusuário.</h1>
          <p className="mt-6 text-slate-300 max-w-2xl leading-7">Planeje, acompanhe e pague seus compromissos mensais com recorrência automática e controle total por competência.</p>
          <div className="mt-10 grid sm:grid-cols-3 gap-4 text-sm">
            <div className="card rounded-3xl p-5">
              <div className="text-slate-400 uppercase text-[0.65rem] font-bold tracking-[0.25em]">Automação</div>
              <div className="mt-3 text-lg font-bold">Planos recorrentes com ajuste por competência</div>
            </div>
            <div className="card rounded-3xl p-5">
              <div className="text-slate-400 uppercase text-[0.65rem] font-bold tracking-[0.25em]">Segurança</div>
              <div className="mt-3 text-lg font-bold">JWT com troca obrigatória de senha</div>
            </div>
            <div className="card rounded-3xl p-5">
              <div className="text-slate-400 uppercase text-[0.65rem] font-bold tracking-[0.25em]">Visibilidade</div>
              <div className="mt-3 text-lg font-bold">Dashboard, pagamentos e metas em um só lugar.</div>
            </div>
          </div>
        </section>

        <section className="p-8 lg:p-10 bg-slate-950/30">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Acesso</p>
              <h2 className="mt-2 text-2xl font-extrabold">Entrar no sistema</h2>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-sky-500/15 border border-sky-500/20 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-sky-300" />
            </div>
          </div>
          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <label className="field-stack">
              <span className="field-label">Usuário</span>
              <span className="field-control">
                <input value={username} onChange={(event) => setUsername(event.target.value)} type="text" required autoFocus placeholder="admin" />
              </span>
            </label>
            <label className="field-stack">
              <span className="field-label">Senha</span>
              <span className="field-control">
                <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required placeholder="Sua senha" />
              </span>
            </label>
            <button type="submit" disabled={busy} className="w-full rounded-2xl bg-sky-500 hover:bg-sky-400 transition px-5 py-4 font-extrabold text-slate-950 disabled:opacity-60">{busy ? 'Entrando...' : 'Acessar'}</button>
          </form>
          {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
        </section>
      </div>
    </div>
  );
}

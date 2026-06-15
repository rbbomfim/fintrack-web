import ModalShell from './ModalShell.jsx';

const TONE_CLASSES = {
  danger: 'bg-rose-500 hover:bg-rose-400',
  warning: 'bg-amber-400 hover:bg-amber-300',
  info: 'bg-sky-500 hover:bg-sky-400',
};

export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  tone = 'danger',
  busy = false,
}) {
  return (
    <ModalShell open={open} onClose={busy ? () => {} : onClose} title={title} eyebrow="Confirmação">
      <p className="text-sm leading-7 text-slate-300">{description}</p>
      <div className="mt-6 flex gap-3">
        <button
          onClick={onClose}
          disabled={busy}
          className="flex-1 rounded-xl border border-slate-700 px-4 py-3 font-bold text-slate-200 transition hover:bg-slate-800 disabled:opacity-60"
        >
          Cancelar
        </button>
        <button
          onClick={onConfirm}
          disabled={busy}
          className={`flex-1 rounded-xl px-4 py-3 font-extrabold text-slate-950 transition disabled:opacity-60 ${TONE_CLASSES[tone] || TONE_CLASSES.danger}`}
        >
          {busy ? 'Processando...' : confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}

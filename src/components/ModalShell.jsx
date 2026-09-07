import { X } from 'lucide-react';

export default function ModalShell({ open, onClose, title, eyebrow, children, maxWidth = 'max-w-lg' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title || eyebrow || 'Janela'}
        className={`relative w-full ${maxWidth} rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl`}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            {eyebrow ? (
              <div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">{eyebrow}</div>
            ) : null}
            {title ? <div className="mt-1 text-xl font-extrabold text-slate-50">{title}</div> : null}
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-700 p-2 text-slate-300 transition hover:bg-slate-800"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

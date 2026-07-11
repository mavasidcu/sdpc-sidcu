import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Trash2, CheckCircle2, X } from "lucide-react";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "success";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const VARIANTS = {
  danger: {
    icon: Trash2,
    iconBg: "bg-rose-50",
    iconColor: "text-rose-500",
    btnClass: "bg-rose-500 hover:bg-rose-600 shadow-rose-500/20",
  },
  warning: {
    icon: AlertTriangle,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-500",
    btnClass: "bg-amber-500 hover:bg-amber-600 shadow-amber-500/20",
  },
  success: {
    icon: CheckCircle2,
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-500",
    btnClass: "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20",
  },
};

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "danger",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const v = VARIANTS[variant];
  const Icon = v.icon;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-start gap-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${v.iconBg}`}>
                <Icon className={`h-5 w-5 ${v.iconColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-slate-900">{title}</h3>
                <p className="mt-1 text-sm text-slate-500">{message}</p>
              </div>
              <button onClick={onCancel} className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50 ${v.btnClass}`}
              >
                {loading ? (
                  <div className="mx-auto h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  confirmLabel
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

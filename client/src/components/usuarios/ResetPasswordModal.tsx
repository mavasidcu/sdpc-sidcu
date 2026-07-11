import { useState } from "react";
import { motion } from "framer-motion";
import { Lock, X, KeyRound } from "lucide-react";

export default function ResetPasswordModal({
  nombre,
  onClose,
  onSubmit,
  loading,
  error,
}: {
  nombre: string;
  onClose: () => void;
  onSubmit: (password: string) => Promise<void>;
  loading: boolean;
  error: string | null;
}) {
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const noCoincide = confirmar.length > 0 && password !== confirmar;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8 || password !== confirmar) return;
    await onSubmit(password);
  };

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-700 placeholder-slate-400 outline-none transition-all focus:border-primary-300 focus:ring-2 focus:ring-primary-100";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-slate-200/60 bg-white shadow-modal"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-accent-600">
              <KeyRound size={15} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Restablecer contraseña</p>
              <p className="text-xs text-slate-400">{nombre}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-600">
              {error}
            </div>
          )}

          <p className="text-xs text-slate-400">
            No es posible recuperar la contraseña anterior — solo asignar una nueva. Esto la reemplaza de inmediato; comparte la nueva con la persona por un canal seguro.
          </p>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              Nueva contraseña
            </label>
            <div className="relative">
              <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className={inputClass}
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              Confirmar contraseña
            </label>
            <div className="relative">
              <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
              <input
                type="password"
                required
                minLength={8}
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                placeholder="Repite la contraseña"
                className={`${inputClass} ${noCoincide ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100" : ""}`}
              />
            </div>
            {noCoincide && (
              <p className="mt-1 text-xs text-rose-500">Las contraseñas no coinciden</p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || password.length < 8 || password !== confirmar}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary-500 py-2.5 text-sm font-bold text-white shadow-sm shadow-primary-500/25 transition-colors hover:bg-primary-600 disabled:bg-primary-300 disabled:shadow-none"
            >
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <>
                  <KeyRound size={14} />
                  Restablecer
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

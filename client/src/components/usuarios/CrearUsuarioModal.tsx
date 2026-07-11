import { useState } from "react";
import { motion } from "framer-motion";
import { UserPlus, X, Lock, User } from "lucide-react";
import { ROLE_CONFIG, ROLES } from "@/lib/roles";

export default function CrearUsuarioModal({
  onClose,
  onSubmit,
  loading,
  error,
}: {
  onClose: () => void;
  onSubmit: (data: { nombre: string; curp: string; password: string; role: "admin" | "capturista" | "consultor" | "user" }) => Promise<void>;
  loading: boolean;
  error: string | null;
}) {
  const [nombre, setNombre] = useState("");
  const [curp, setCurp] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "capturista" | "consultor" | "user">("user");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({ nombre, curp, password, role });
  };

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-700 placeholder-slate-400 outline-none transition-all focus:border-primary-300 focus:ring-2 focus:ring-primary-100";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mx-4 w-full max-w-md rounded-2xl border border-slate-200/60 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <UserPlus size={16} className="text-primary-500" />
            <span className="text-sm font-bold text-slate-800">Crear usuario</span>
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

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              Nombre completo
            </label>
            <div className="relative">
              <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
              <input
                type="text"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Juan Pérez"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              CURP
            </label>
            <div className="relative">
              <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
              <input
                type="text"
                required
                minLength={18}
                maxLength={18}
                value={curp}
                onChange={(e) => setCurp(e.target.value.toUpperCase())}
                placeholder="CURP de 18 caracteres"
                className={`${inputClass} font-mono tracking-wider`}
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              Contraseña
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
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              Rol
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map((r) => {
                const rc = ROLE_CONFIG[r];
                const selected = role === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-all ${
                      selected
                        ? "border-primary-300 bg-primary-50 text-primary-600 ring-2 ring-primary-100"
                        : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    <div
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: rc.color }}
                    />
                    {rc.label}
                  </button>
                );
              })}
            </div>
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
              disabled={loading}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary-500 py-2.5 text-sm font-bold text-white shadow-sm shadow-primary-500/25 transition-colors hover:bg-primary-600 disabled:opacity-50"
            >
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <>
                  <UserPlus size={14} />
                  Crear
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

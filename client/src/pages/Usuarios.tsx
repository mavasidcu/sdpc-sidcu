import { useState } from "react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import ConfirmModal from "@/components/ConfirmModal";
import CrearUsuarioModal from "@/components/usuarios/CrearUsuarioModal";
import ResetPasswordModal from "@/components/usuarios/ResetPasswordModal";
import SolicitudesBajaSection from "@/components/usuarios/SolicitudesBajaSection";
import { ROLE_CONFIG, ROLES } from "@/lib/roles";
import {
  UserCog,
  Search,
  ShieldCheck,
  UserCheck,
  UserX,
  Clock,
  ChevronDown,
  UserPlus,
  Trash2,
  KeyRound,
} from "lucide-react";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
};

function formatFecha(date: string | Date | null) {
  if (!date) return "Nunca";
  const d = new Date(date);
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Usuarios() {
  const { user: currentUser } = useAuth();
  const [search, setSearch] = useState("");
  const [roleDropdown, setRoleDropdown] = useState<number | null>(null);
  const [showCrear, setShowCrear] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ type: "toggle"; id: number; nombre: string; isActive: boolean } | { type: "delete"; id: number; nombre: string } | null>(null);
  const [resetTarget, setResetTarget] = useState<{ id: number; nombre: string } | null>(null);
  const utils = trpc.useUtils();

  const { data: usuarios, isLoading } = trpc.usuarios.listar.useQuery(
    { search: search || undefined },
    { retry: false }
  );

  const crearMut = trpc.usuarios.crear.useMutation({
    onSuccess: () => {
      utils.usuarios.listar.invalidate();
      setShowCrear(false);
    },
  });

  const cambiarRolMut = trpc.usuarios.cambiarRol.useMutation({
    onSuccess: () => {
      utils.usuarios.listar.invalidate();
      setRoleDropdown(null);
    },
  });

  const toggleActivoMut = trpc.usuarios.toggleActivo.useMutation({
    onSuccess: () => {
      utils.usuarios.listar.invalidate();
    },
  });

  const eliminarMut = trpc.usuarios.eliminar.useMutation({
    onSuccess: () => {
      utils.usuarios.listar.invalidate();
    },
  });

  const resetearPasswordMut = trpc.usuarios.resetearPassword.useMutation({
    onSuccess: () => {
      utils.usuarios.listar.invalidate();
      setResetTarget(null);
    },
  });

  const handleCambiarRol = (id: number, role: typeof ROLES[number]) => {
    if (id === currentUser?.id) {
      alert("No puedes cambiar tu propio rol");
      return;
    }
    cambiarRolMut.mutate({ id, role });
  };

  const handleToggleActivo = (id: number, nombre: string, isActive: boolean) => {
    if (id === currentUser?.id) {
      alert("No puedes desactivar tu propia cuenta");
      return;
    }
    setConfirmAction({ type: "toggle", id, nombre, isActive });
  };

  const totalActivos = usuarios?.filter((u: any) => u.isActive).length ?? 0;
  const totalInactivos = usuarios?.filter((u: any) => !u.isActive).length ?? 0;

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={fadeUp} className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Gestión de Usuarios
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Administrar roles y accesos del sistema
          </p>
        </div>
        <button
          onClick={() => setShowCrear(true)}
          className="flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2 text-sm font-bold text-white shadow-sm shadow-primary-500/25 transition-colors hover:bg-primary-600"
        >
          <UserPlus size={16} />
          Crear usuario
        </button>
      </motion.div>

      {/* Summary */}
      <motion.div variants={fadeUp} className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200/60 bg-white p-4 text-center shadow-card-rest">
          <p className="text-2xl font-extrabold text-slate-800">{usuarios?.length ?? 0}</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Total</p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-center">
          <p className="text-2xl font-extrabold text-emerald-600">{totalActivos}</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">Activos</p>
        </div>
        <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-center">
          <p className="text-2xl font-extrabold text-rose-600">{totalInactivos}</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-rose-400">Inactivos</p>
        </div>
      </motion.div>

      {/* Search */}
      <motion.div variants={fadeUp} className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar por nombre o estatus..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-700 placeholder-slate-400 outline-none transition-all focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
        />
      </motion.div>

      {/* Solicitudes de baja */}
      <SolicitudesBajaSection />

      {/* Users list */}
      {isLoading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-slate-200 border-t-primary-500" />
        </div>
      ) : !usuarios?.length ? (
        <motion.div variants={fadeUp} className="flex flex-col items-center py-16 text-center">
          <div className="rounded-2xl bg-slate-50 p-5">
            <UserCog size={28} className="text-slate-300" />
          </div>
          <p className="mt-4 text-sm font-medium text-slate-400">
            {search ? "Sin resultados para esa búsqueda" : "Sin usuarios registrados"}
          </p>
        </motion.div>
      ) : (
        <motion.div variants={fadeUp} className="space-y-2">
          {(usuarios as any[]).map((usr, index) => {
            const roleConfig = ROLE_CONFIG[usr.role] ?? ROLE_CONFIG.user;
            const isSelf = usr.id === currentUser?.id;

            return (
              <motion.div
                key={usr.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.03, duration: 0.3 }}
                className={`group relative flex items-center gap-4 rounded-2xl border bg-white p-4 shadow-card-rest transition-all hover:shadow-card-hover ${
                  usr.isActive ? "border-slate-200/60" : "border-rose-200/60 bg-rose-50/30"
                }`}
              >
                {/* Avatar */}
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white ${
                  usr.isActive
                    ? "bg-gradient-to-br from-primary-500 to-accent-500"
                    : "bg-slate-300"
                }`}>
                  {usr.nombre?.charAt(0)?.toUpperCase() ?? "U"}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {usr.nombre}
                      {isSelf && (
                        <span className="ml-2 text-[10px] font-medium text-primary-400">(tú)</span>
                      )}
                    </p>
                    {!usr.isActive && (
                      <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-500">
                        Inactivo
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                    {usr.curp && (
                      <span className="flex items-center gap-1 font-mono">
                        {usr.curp}
                      </span>
                    )}
                    <span className="hidden items-center gap-1 sm:flex">
                      <Clock size={11} />
                      {formatFecha(usr.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Role selector */}
                <div className="relative">
                  <button
                    onClick={() => setRoleDropdown(roleDropdown === usr.id ? null : usr.id)}
                    disabled={isSelf}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${roleConfig.bg} ${roleConfig.text} ${
                      isSelf ? "opacity-60 cursor-not-allowed" : "hover:shadow-sm cursor-pointer"
                    }`}
                  >
                    <ShieldCheck size={12} />
                    {roleConfig.label}
                    {!isSelf && <ChevronDown size={10} />}
                  </button>

                  {roleDropdown === usr.id && !isSelf && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setRoleDropdown(null)}
                      />
                      <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                        {ROLES.map((r) => {
                          const rc = ROLE_CONFIG[r];
                          return (
                            <button
                              key={r}
                              onClick={() => handleCambiarRol(usr.id, r)}
                              disabled={cambiarRolMut.isPending}
                              className={`flex w-full items-center gap-2 px-3 py-2 text-xs font-medium transition-colors hover:bg-slate-50 ${
                                usr.role === r ? "bg-slate-50 font-bold" : ""
                              }`}
                            >
                              <div
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: rc.color }}
                              />
                              {rc.label}
                              {usr.role === r && <span className="ml-auto text-primary-500">●</span>}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                {/* Restablecer contraseña */}
                <button
                  onClick={() => setResetTarget({ id: usr.id, nombre: usr.nombre })}
                  title="Restablecer contraseña"
                  className="shrink-0 rounded-lg p-2 text-slate-400 transition-all hover:bg-amber-50 hover:text-accent-600"
                >
                  <KeyRound size={16} />
                </button>

                {/* Toggle active */}
                <button
                  onClick={() => handleToggleActivo(usr.id, usr.nombre, usr.isActive)}
                  disabled={isSelf || toggleActivoMut.isPending}
                  title={usr.isActive ? "Desactivar usuario" : "Activar usuario"}
                  className={`shrink-0 rounded-lg p-2 transition-all ${
                    isSelf
                      ? "opacity-30 cursor-not-allowed text-slate-300"
                      : usr.isActive
                        ? "text-emerald-500 hover:bg-emerald-50"
                        : "text-rose-400 hover:bg-rose-50"
                  }`}
                >
                  {usr.isActive ? <UserCheck size={16} /> : <UserX size={16} />}
                </button>

                {/* Delete — solo si inactivo */}
                {!usr.isActive && !isSelf && (
                  <button
                    onClick={() => setConfirmAction({ type: "delete", id: usr.id, nombre: usr.nombre })}
                    title="Eliminar usuario"
                    className="shrink-0 rounded-lg p-2 text-slate-700 hover:bg-rose-50 hover:text-rose-500 transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Modal crear usuario */}
      {showCrear && (
        <CrearUsuarioModal
          onClose={() => setShowCrear(false)}
          onSubmit={async (data) => {
            await crearMut.mutateAsync(data);
          }}
          loading={crearMut.isPending}
          error={crearMut.error?.message ?? null}
        />
      )}

      {/* Modal restablecer contraseña */}
      {resetTarget && (
        <ResetPasswordModal
          nombre={resetTarget.nombre}
          onClose={() => setResetTarget(null)}
          onSubmit={async (password) => {
            await resetearPasswordMut.mutateAsync({ id: resetTarget.id, password });
          }}
          loading={resetearPasswordMut.isPending}
          error={resetearPasswordMut.error?.message ?? null}
        />
      )}

      <ConfirmModal
        open={!!confirmAction}
        title={
          confirmAction?.type === "delete" ? "Eliminar usuario"
            : confirmAction?.type === "toggle" && confirmAction.isActive ? "Desactivar usuario"
            : "Activar usuario"
        }
        message={
          confirmAction?.type === "delete"
            ? `¿Eliminar a "${confirmAction.nombre}" permanentemente? Se borrarán todos sus datos, servidor y solicitudes.`
            : `¿${confirmAction?.type === "toggle" && confirmAction.isActive ? "Desactivar" : "Activar"} a "${confirmAction?.nombre ?? ""}"?`
        }
        confirmLabel={
          confirmAction?.type === "delete" ? "Eliminar"
            : confirmAction?.type === "toggle" && confirmAction.isActive ? "Desactivar"
            : "Activar"
        }
        variant={confirmAction?.type === "delete" || (confirmAction?.type === "toggle" && confirmAction.isActive) ? "danger" : "success"}
        loading={toggleActivoMut.isPending || eliminarMut.isPending}
        onConfirm={() => {
          if (confirmAction?.type === "toggle") {
            toggleActivoMut.mutate({ id: confirmAction.id }, { onSuccess: () => setConfirmAction(null) });
          } else if (confirmAction?.type === "delete") {
            eliminarMut.mutate({ id: confirmAction.id }, { onSuccess: () => setConfirmAction(null) });
          }
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </motion.div>
  );
}

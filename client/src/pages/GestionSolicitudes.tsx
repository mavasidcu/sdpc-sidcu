import { useState } from "react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import {
  ClipboardCheck,
  X,
  Award,
  Clock,
  User,
  BookOpen,
  Building2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import ImportarCSVModal from "@/components/ImportarCSVModal";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

// "pendiente"/"rechazada" ya no ocurren en la practica -- la inscripcion
// es directa (crearSolicitudConAsignacion siempre inserta "aprobada"), y
// no existe flujo para rechazar una solicitud ya inscrita.
type Estado = "" | "aprobada" | "completada";

const ESTADOS: { value: Estado; label: string }[] = [
  { value: "", label: "Todas" },
  { value: "aprobada", label: "Aprobadas" },
  { value: "completada", label: "Completadas" },
];

const estadoBadge: Record<string, string> = {
  aprobada: "bg-emerald-50 text-emerald-700",
  completada: "bg-indigo-50 text-indigo-700",
};

type ModalState =
  | { type: "closed" }
  | { type: "completar"; solicitudId: number; userName: string; cursoNombre: string };

function formatFecha(date: string | Date) {
  const d = new Date(date);
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function GestionSolicitudes() {
  const utils = trpc.useUtils();
  const [estadoFilter, setEstadoFilter] = useState<Estado>("");
  const [userFilter, setUserFilter] = useState("");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<ModalState>({ type: "closed" });
  const [calificacion, setCalificacion] = useState("");
  const [showImportCalificaciones, setShowImportCalificaciones] = useState(false);

  const { data, isLoading, isFetching } = trpc.solicitudes.listar.useQuery(
    { estado: estadoFilter || undefined, page },
    { placeholderData: (prev) => prev },
  );
  const solicitudes = data?.items;

  const { data: conteoAcreditacion } = trpc.solicitudes.conteoAcreditacion.useQuery();
  const { data: conteoPorBloque } = trpc.solicitudes.conteoPorBloque.useQuery();

  const completarMut = trpc.solicitudes.completar.useMutation({
    onSuccess: () => {
      utils.solicitudes.listar.invalidate();
      utils.solicitudes.conteoAcreditacion.invalidate();
      utils.solicitudes.conteoPorBloque.invalidate();
      setModal({ type: "closed" });
      setCalificacion("");
    },
  });

  const importarCalificacionesMut = trpc.solicitudes.importarCalificaciones.useMutation();

  const handleCompletar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modal.type !== "completar" || calificacion === "") return;
    await completarMut.mutateAsync({ id: modal.solicitudId, calificacion: Number(calificacion) });
  };

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 outline-none transition-all focus:border-primary-300 focus:ring-2 focus:ring-primary-100";

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">
      {/* Header */}
      <motion.div variants={fadeUp} className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Solicitudes de Capacitacion
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Revisa y gestiona las solicitudes de los servidores
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImportCalificaciones(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            <Award size={16} />
            Importar Calificaciones
          </button>
          <div className="hidden items-center gap-2 rounded-xl bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-600 sm:flex">
            <ClipboardCheck size={14} />
            {data?.total ?? 0} solicitudes
          </div>
        </div>
      </motion.div>

      {/* Acreditacion summary */}
      {conteoAcreditacion && conteoAcreditacion.total > 0 && (
        <motion.div variants={fadeUp} className="rounded-2xl bg-white p-5 shadow-card-rest border border-slate-200/60">
          <div className="flex items-baseline justify-between">
            <p className="text-micro font-semibold uppercase tracking-widest text-slate-400">
              Progreso de acreditación
            </p>
            <p className="text-xs text-slate-400">
              {conteoAcreditacion.acreditados} de {conteoAcreditacion.total} servidores
            </p>
          </div>

          <div className="mt-3 flex items-end gap-2">
            <span className="text-3xl font-extrabold tracking-tight text-slate-900">
              {Math.round((conteoAcreditacion.acreditados / conteoAcreditacion.total) * 100)}%
            </span>
            <span className="mb-1 text-xs text-slate-400">acreditados</span>
          </div>

          <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-rose-100">
            <motion.div
              className="h-full rounded-full bg-emerald-500"
              initial={{ width: 0 }}
              animate={{ width: `${(conteoAcreditacion.acreditados / conteoAcreditacion.total) * 100}%` }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
            />
          </div>

          <div className="mt-2 flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {conteoAcreditacion.acreditados} acreditados
            </span>
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="h-2 w-2 rounded-full bg-rose-300" />
              {conteoAcreditacion.noAcreditados} no acreditados
            </span>
          </div>

          {/* Aprobacion por bloque */}
          {conteoPorBloque && conteoPorBloque.length > 0 && (
            <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
              <p className="text-micro font-semibold uppercase tracking-widest text-slate-400">
                Por bloque
              </p>
              {conteoPorBloque.map(({ bloque, pasan, noPasan }) => {
                const totalBloque = pasan + noPasan;
                const pct = totalBloque > 0 ? (pasan / totalBloque) * 100 : 0;
                return (
                  <div key={bloque ?? "sin-bloque"}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700">
                        {bloque != null ? `Bloque ${bloque}` : "Sin bloque"}
                      </span>
                      <span className="text-slate-400">
                        {pasan} pasan · {noPasan} no pasan
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-rose-100">
                      <motion.div
                        className="h-full rounded-full bg-emerald-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      )}

      {/* Filters */}
      <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-2">
        {isFetching && !isLoading && (
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-200 border-t-primary-500" />
        )}
        {ESTADOS.map((est) => {
          const active = estadoFilter === est.value;
          return (
            <button
              key={est.value}
              onClick={() => { setEstadoFilter(est.value); setPage(1); }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                active
                  ? "bg-primary-500 text-white shadow-sm shadow-primary-500/25"
                  : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              {est.label}
            </button>
          );
        })}
        <select
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600"
        >
          <option value="">Todos los usuarios</option>
          {[...new Set((solicitudes ?? []).map((s: any) => s.users?.nombre).filter(Boolean))].sort().map((nombre: string) => (
            <option key={nombre} value={nombre}>{nombre}</option>
          ))}
        </select>
      </motion.div>

      {/* Solicitudes list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-slate-200/60 bg-white p-5 shadow-card-rest">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-20 rounded-lg bg-slate-200/60" />
                  <div className="h-3.5 w-40 rounded bg-slate-200/60" />
                  <div className="h-3.5 w-56 rounded bg-slate-200/60" />
                </div>
                <div className="flex shrink-0 gap-2">
                  <div className="h-8 w-24 rounded-xl bg-slate-200/60" />
                  <div className="h-8 w-24 rounded-xl bg-slate-200/60" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : !solicitudes?.length ? (
        <motion.div variants={fadeUp} className="flex flex-col items-center py-16 text-center">
          <div className="rounded-2xl bg-slate-50 p-5">
            <ClipboardCheck size={28} className="text-slate-300" />
          </div>
          <p className="mt-4 text-sm font-medium text-slate-400">No hay solicitudes</p>
        </motion.div>
      ) : (
        <motion.div variants={stagger} className="space-y-3">
          {solicitudes.filter((item: any) => !userFilter || item.users?.nombre === userFilter).map((item: any, index: number) => {
            const solicitud = item.solicitudes_curso ?? item;
            const curso = item.cursos ?? {};
            const usuario = item.users ?? {};
            const estado = solicitud.estado ?? "aprobada";

            return (
              <motion.div
                key={solicitud.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.04, duration: 0.3 }}
                className="group rounded-2xl border border-slate-200/60 bg-white p-5 shadow-card-rest transition-all hover:shadow-card-hover hover:border-slate-200"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${estadoBadge[estado] ?? "bg-slate-50 text-slate-500"}`}>
                        {estado}
                      </span>
                      {solicitud.createdAt && (
                        <span className="flex items-center gap-1 text-[11px] text-slate-400">
                          <Clock size={11} />
                          {formatFecha(solicitud.createdAt)}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex flex-col gap-1">
                      <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <User size={14} className="text-slate-400" />
                        {usuario.nombre ?? usuario.email ?? `Usuario #${solicitud.usuarioId}`}
                      </p>
                      <p className="flex items-center gap-2 text-sm text-slate-500">
                        <BookOpen size={14} className="text-slate-400" />
                        {curso.nombre ?? `Curso #${solicitud.cursoId}`}
                      </p>
                    </div>

                    {solicitud.notasAdmin && (
                      <p className="mt-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-500">
                        Notas: {solicitud.notasAdmin}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 gap-2">
                    {estado === "aprobada" && (
                      <button
                        onClick={() =>
                          setModal({
                            type: "completar",
                            solicitudId: solicitud.id,
                            userName: usuario.nombre ?? usuario.email ?? `#${solicitud.usuarioId}`,
                            cursoNombre: curso.nombre ?? `Curso #${solicitud.cursoId}`,
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
                      >
                        <Award size={14} />
                        Marcar Completado
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Paginación */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200/60 bg-white px-4 py-3 text-sm text-slate-600">
          <span>
            Página {data.page} de {data.totalPages} ({data.total} resultados)
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded p-1.5 hover:bg-slate-100 disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page >= data.totalPages}
              className="rounded p-1.5 hover:bg-slate-100 disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Completar confirmation modal */}
      {modal.type === "completar" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm rounded-2xl border border-slate-200/60 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-bold text-slate-800">Confirmar Completado</h2>
              <button
                onClick={() => setModal({ type: "closed" })}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCompletar} className="space-y-4 p-5">
              {completarMut.error && (
                <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-600">
                  {completarMut.error.message}
                </div>
              )}

              <div className="rounded-xl bg-indigo-50 p-4 text-center">
                <Award size={24} className="mx-auto text-indigo-500" />
                <p className="mt-2 text-sm font-semibold text-indigo-800">
                  {modal.userName}
                </p>
                <p className="text-xs text-indigo-600 mt-0.5">{modal.cursoNombre}</p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Calificación (0-100) *</label>
                <input
                  type="number"
                  required
                  min={0}
                  max={100}
                  value={calificacion}
                  onChange={(e) => setCalificacion(e.target.value)}
                  className={inputClass}
                  placeholder="Ej. 85"
                />
                {calificacion !== "" && (
                  <p className={`mt-1.5 text-xs font-medium ${Number(calificacion) >= 70 ? "text-emerald-600" : "text-rose-600"}`}>
                    {Number(calificacion) >= 70 ? "Aprobatoria — subirá de nivel" : "No aprobatoria — no subirá de nivel"}
                  </p>
                )}
              </div>

              <p className="text-xs text-slate-400 text-center">
                Esta acción no se puede deshacer.
              </p>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setModal({ type: "closed" }); setCalificacion(""); }}
                  className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={completarMut.isPending || calificacion === ""}
                  className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/20 transition-colors hover:bg-indigo-700 disabled:opacity-50"
                >
                  {completarMut.isPending ? "Completando..." : "Completar"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Import Calificaciones Modal */}
      {showImportCalificaciones && (
        <ImportarCSVModal
          titulo="Calificaciones"
          columnas={[
            { key: "curp", label: "CURP", ejemplo: "GORC850101HDFNCS09" },
            { key: "curso", label: "Curso", ejemplo: "Ética en el servicio público" },
            { key: "calificacion", label: "Calificación", ejemplo: "85" },
          ]}
          onImportar={(registros) => importarCalificacionesMut.mutateAsync({ registros })}
          onClose={() => setShowImportCalificaciones(false)}
          onSuccess={() => {
            utils.solicitudes.listar.invalidate();
            utils.solicitudes.conteoAcreditacion.invalidate();
            utils.solicitudes.conteoPorBloque.invalidate();
          }}
        />
      )}
    </motion.div>
  );
}

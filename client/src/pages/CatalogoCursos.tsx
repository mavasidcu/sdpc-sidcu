import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Search, Clock, X, BookOpen, CheckCircle2, AlertCircle } from "lucide-react";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

function formatFecha(date: string | Date) {
  const d = new Date(date);
  // timeZone: "UTC" -- fechaInicio/fechaFin son fechas de calendario puras
  // guardadas como medianoche UTC, sin esto se desfasan un dia segun la
  // timezone del navegador (ver server/db.ts, mismo bug del lado servidor).
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function formatRangoFechas(fechaInicio: string | Date | null | undefined, fechaFin: string | Date | null | undefined) {
  if (!fechaInicio && !fechaFin) return null;
  if (fechaInicio && fechaFin) return `${formatFecha(fechaInicio)} - ${formatFecha(fechaFin)}`;
  if (fechaInicio) return `Desde ${formatFecha(fechaInicio)}`;
  return `Hasta ${formatFecha(fechaFin!)}`;
}

const MODALIDAD_COLORS: Record<string, string> = {
  presencial: "bg-emerald-50 text-emerald-700",
  virtual: "bg-blue-50 text-blue-700",
  mixto: "bg-purple-50 text-purple-700",
};

export default function CatalogoCursos() {
  const [, navigate] = useLocation();
  const [categoria, setCategoria] = useState("");
  const [bloqueSeleccionado, setBloqueSeleccionado] = useState<number | null>(null);
  const [selectedCursoId, setSelectedCursoId] = useState<number | null>(null);
  const [solicitudMsg, setSolicitudMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const { data: perfil, isLoading: perfilLoading } = trpc.perfil.obtener.useQuery();

  if (!perfilLoading && perfil === null) {
    navigate("/onboarding");
    return null;
  }

  const { data: cursos, isLoading: cursosLoading } = trpc.cursos.listar.useQuery({
    categoria: categoria || undefined,
  }, { placeholderData: (prev) => prev });

  const { data: cursoDetalle, isLoading: detalleLoading } = trpc.cursos.obtener.useQuery(
    { id: selectedCursoId! },
    { enabled: selectedCursoId !== null }
  );

  const { data: misSolicitudes } = trpc.solicitudes.misSolicitudes.useQuery();

  const bloques = (() => {
    if (!cursos) return [] as { bloque: number | null; cursos: any[] }[];
    const grupos = new Map<number | null, any[]>();
    for (const curso of cursos) {
      const key = curso.bloque ?? null;
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key)!.push(curso);
    }
    return [...grupos.entries()]
      .sort(([a], [b]) => {
        if (a === null) return 1;
        if (b === null) return -1;
        return a - b;
      })
      .map(([bloque, cursos]) => ({ bloque, cursos }));
  })();

  const bloqueActivo = bloques.some((b) => b.bloque === bloqueSeleccionado)
    ? bloqueSeleccionado
    : bloques[0]?.bloque ?? null;
  const cursosDelBloque = bloques.find((b) => b.bloque === bloqueActivo)?.cursos ?? [];

  const utils = trpc.useUtils();

  const solicitarMut = trpc.solicitudes.crear.useMutation({
    onSuccess: () => {
      setSolicitudMsg({ type: "success", text: "¡Inscripción confirmada! Ya puedes verla en 'Mis Solicitudes'." });
      utils.solicitudes.misSolicitudes.invalidate();
    },
    onError: (err) => {
      const msg = err.message.includes("activa")
        ? "Ya tienes una solicitud activa para este curso"
        : err.message.includes("2 cursos")
        ? "Solo puedes tener 2 cursos activos. Completa o cancela uno antes de solicitar otro."
        : err.message.includes("empalman")
        ? "Las fechas de este curso se empalman con otro curso inscrito."
        : err.message.includes("institución configurada")
        ? "El sistema no tiene ninguna institución configurada todavía. Contacta al administrador."
        : err.message;
      setSolicitudMsg({ type: "error", text: msg });
    },
  });

  const handleSolicitar = (cursoId: number) => {
    setSolicitudMsg(null);
    solicitarMut.mutate({ cursoId });
  };

  const closeModal = () => {
    setSelectedCursoId(null);
    setSolicitudMsg(null);
  };

  const tieneSolicitudActiva = (cursoId: number) => {
    if (!misSolicitudes) return false;
    return misSolicitudes.some((s: any) => {
      const sol = s.solicitudes_curso ?? s;
      return sol.cursoId === cursoId && (sol.estado === "pendiente" || sol.estado === "aprobada");
    });
  };

  const getEstadoSolicitud = (cursoId: number) => {
    if (!misSolicitudes) return null;
    const found = misSolicitudes.find((s: any) => {
      const sol = s.solicitudes_curso ?? s;
      return sol.cursoId === cursoId;
    });
    if (!found) return null;
    const sol = found.solicitudes_curso ?? found;
    return sol.estado;
  };

  if (perfilLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={fadeUp}>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Catálogo de Cursos</h1>
        <p className="mt-1 text-sm text-slate-400">Encuentra cursos de capacitación disponibles para tu nivel</p>
      </motion.div>

      {/* Filters */}
      <motion.div variants={fadeUp} className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar por categoría..."
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
        />
      </motion.div>

      {/* Block selector */}
      {bloques.length > 1 && (
        <motion.div variants={fadeUp} className="flex flex-wrap gap-2">
          {bloques.map(({ bloque }) => (
            <button
              key={bloque ?? "sin-bloque"}
              onClick={() => setBloqueSeleccionado(bloque)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                bloqueActivo === bloque
                  ? "bg-primary-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {bloque != null ? `Bloque ${bloque}` : "Sin bloque"}
            </button>
          ))}
        </motion.div>
      )}

      {/* Course Grid */}
      {cursosLoading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
        </div>
      ) : !cursos?.length ? (
        <motion.div variants={fadeUp} className="rounded-2xl bg-white p-12 text-center shadow-card-rest border border-slate-100">
          <BookOpen className="mx-auto h-12 w-12 text-slate-300" />
          <p className="mt-3 text-slate-500">No se encontraron cursos con los filtros seleccionados</p>
        </motion.div>
      ) : (
        <motion.div key={bloqueActivo ?? "sin-bloque"} variants={stagger} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cursosDelBloque.map((curso: any) => {
            const estado = getEstadoSolicitud(curso.id);
            return (
              <motion.div
                key={curso.id}
                variants={fadeUp}
                onClick={() => setSelectedCursoId(curso.id)}
                className="relative cursor-pointer rounded-2xl bg-white p-5 shadow-card-rest border border-slate-200/60 hover:border-primary-200 hover:shadow-card-hover transition-all"
              >
                {estado && (
                  <div className={`absolute top-3 right-3 rounded-lg px-2 py-0.5 text-micro font-bold uppercase tracking-wider ${
                    estado === "pendiente" ? "bg-amber-50 text-amber-600" :
                    estado === "aprobada" ? "bg-emerald-50 text-emerald-600" :
                    estado === "completada" ? "bg-indigo-50 text-indigo-600" :
                    "bg-rose-50 text-rose-600"
                  }`}>
                    {estado === "pendiente" ? "Solicitado" :
                     estado === "aprobada" ? "Aprobado" :
                     estado === "completada" ? "Completado" : "Rechazado"}
                  </div>
                )}
                <h3 className="font-semibold text-slate-900 line-clamp-1 pr-20">{curso.nombre}</h3>
                {curso.descripcion && (
                  <p className="mt-2 text-sm text-slate-500 line-clamp-2">{curso.descripcion}</p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {curso.duracionHoras && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                      <Clock className="h-3 w-3" />
                      {curso.duracionHoras}h
                    </span>
                  )}
                  {curso.modalidad && (
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${MODALIDAD_COLORS[curso.modalidad] ?? "bg-slate-100 text-slate-600"}`}>
                      {curso.modalidad.charAt(0).toUpperCase() + curso.modalidad.slice(1)}
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedCursoId !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={closeModal}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
            >
              {detalleLoading ? (
                <div className="flex h-32 items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-[3px] border-slate-200 border-t-primary-500" />
                </div>
              ) : cursoDetalle ? (
                <>
                  <div className="flex items-start justify-between">
                    <h2 className="text-lg font-bold text-slate-900">{cursoDetalle.nombre}</h2>
                    <button
                      onClick={closeModal}
                      className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  {cursoDetalle.descripcion && (
                    <p className="mt-3 text-sm text-slate-600 leading-relaxed">{cursoDetalle.descripcion}</p>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {cursoDetalle.duracionHoras && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                        <Clock className="h-3 w-3" />
                        {cursoDetalle.duracionHoras} horas
                      </span>
                    )}
                    {cursoDetalle.modalidad && (
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${MODALIDAD_COLORS[cursoDetalle.modalidad] ?? "bg-slate-100 text-slate-600"}`}>
                        {cursoDetalle.modalidad.charAt(0).toUpperCase() + cursoDetalle.modalidad.slice(1)}
                      </span>
                    )}
                  </div>

                  {/* Instituciones */}
                  {cursoDetalle.instituciones && cursoDetalle.instituciones.length > 0 && (
                    <div className="mt-5">
                      <h3 className="text-sm font-semibold text-slate-700 mb-3">Instituciones disponibles</h3>
                      <div className="space-y-3">
                        {cursoDetalle.instituciones.map((inst: any, idx: number) => (
                          <div key={idx} className="rounded-xl bg-slate-50 p-4 text-sm">
                            <p className="font-medium text-slate-900">{inst.instituciones?.nombre ?? inst.nombre ?? `Institución ${idx + 1}`}</p>
                            {formatRangoFechas(
                              inst.cursos_instituciones?.fechaInicio ?? inst.fechaInicio,
                              inst.cursos_instituciones?.fechaFin ?? inst.fechaFin
                            ) && (
                              <p className="mt-1 text-slate-500">
                                {formatRangoFechas(
                                  inst.cursos_instituciones?.fechaInicio ?? inst.fechaInicio,
                                  inst.cursos_instituciones?.fechaFin ?? inst.fechaFin
                                )}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Feedback message inside modal */}
                  <AnimatePresence>
                    {solicitudMsg && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className={`mt-4 flex items-center gap-2 rounded-xl p-3 text-sm font-medium ${
                          solicitudMsg.type === "success"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {solicitudMsg.type === "success" ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                        ) : (
                          <AlertCircle className="h-4 w-4 shrink-0" />
                        )}
                        {solicitudMsg.text}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Solicitar button */}
                  <div className="mt-5">
                    {tieneSolicitudActiva(cursoDetalle.id) ? (
                      <div className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 py-2.5 text-sm font-medium text-slate-500">
                        <CheckCircle2 className="h-4 w-4" />
                        Ya tienes una solicitud para este curso
                      </div>
                    ) : (
                      <button
                        onClick={() => handleSolicitar(cursoDetalle.id)}
                        disabled={solicitarMut.isPending}
                        className="w-full rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                      >
                        {solicitarMut.isPending ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        Inscribirme
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="py-8 text-center text-sm text-slate-400">Curso no encontrado</div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

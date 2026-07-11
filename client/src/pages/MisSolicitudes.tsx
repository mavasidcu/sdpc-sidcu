import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { ClipboardList, CheckCircle2, Award } from "lucide-react";

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

// "pendiente"/"rechazada" ya no ocurren en la practica -- la inscripcion
// es directa y no existe flujo para rechazar una solicitud ya inscrita.
const ESTATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: React.ElementType }> = {
  aprobada: { label: "Aprobada", bg: "bg-emerald-50", text: "text-emerald-700", icon: CheckCircle2 },
  completada: { label: "Completada", bg: "bg-indigo-50", text: "text-indigo-700", icon: Award },
};

export default function MisSolicitudes() {
  const [, navigate] = useLocation();

  const { data: perfil, isLoading: perfilLoading } = trpc.perfil.obtener.useQuery();
  const { data: solicitudes, isLoading: solicitudesLoading } = trpc.solicitudes.misSolicitudes.useQuery();

  // Redirect to onboarding if no profile
  if (!perfilLoading && perfil === null) {
    navigate("/onboarding");
    return null;
  }

  const isLoading = perfilLoading || solicitudesLoading;

  if (isLoading) {
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
        <h1 className="text-2xl font-bold text-gray-900">Mis Solicitudes</h1>
        <p className="mt-1 text-gray-500">Historial de tus solicitudes de inscripcion a cursos</p>
      </motion.div>

      {/* Solicitudes List */}
      {!solicitudes?.length ? (
        <motion.div variants={fadeUp} className="rounded-2xl bg-white p-12 text-center shadow-card-rest border border-gray-100">
          <ClipboardList className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-3 font-medium text-gray-600">No tienes solicitudes aun</p>
          <p className="mt-1 text-sm text-gray-400">Explora el catalogo de cursos para inscribirte</p>
          <button
            onClick={() => navigate("/portal/cursos")}
            className="mt-4 inline-flex items-center rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
          >
            Ver Catalogo
          </button>
        </motion.div>
      ) : (
        <motion.div variants={stagger} className="space-y-4">
          {solicitudes.map((item: any) => {
            const solicitud = item.solicitudes_curso;
            const curso = item.cursos;
            const estatus = solicitud.estado ?? "aprobada";
            const config = ESTATUS_CONFIG[estatus] ?? ESTATUS_CONFIG.aprobada;
            const EstatusIcon = config.icon;

            return (
              <motion.div
                key={solicitud.id}
                variants={fadeUp}
                className="rounded-2xl bg-white p-5 shadow-card-rest border border-gray-100"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">
                      {curso?.nombre ?? "Curso"}
                    </h3>

                    {/* Date */}
                    {solicitud.createdAt && (
                      <p className="mt-1 text-xs text-gray-400">
                        Solicitado el {new Date(solicitud.createdAt).toLocaleDateString("es-MX", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                    )}

                    {/* Approved details */}
                    {estatus === "aprobada" && (
                      <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
                        {item.instituciones ? (
                          <div>
                            <p className="font-medium">¡Vas muy bien! Sigue así</p>
                            {formatRangoFechas(item.cursos_instituciones?.fechaInicio, item.cursos_instituciones?.fechaFin) && (
                              <p className="mt-1">{formatRangoFechas(item.cursos_instituciones?.fechaInicio, item.cursos_instituciones?.fechaFin)}</p>
                            )}
                          </div>
                        ) : (
                          <p>Aprobada — pendiente asignación de sede</p>
                        )}
                      </div>
                    )}

                  </div>

                  {/* Status badge */}
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap ${config.bg} ${config.text}`}>
                    <EstatusIcon className="h-3.5 w-3.5" />
                    {config.label}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </motion.div>
  );
}

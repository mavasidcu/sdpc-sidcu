import { useState } from "react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Flag, Award, ClipboardCheck, Users, ArrowRight, Calendar } from "lucide-react";
import ConfirmModal from "@/components/ConfirmModal";

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } } };

function formatFecha(fecha: string): string {
  // fecha ya es "YYYY-MM-DD" (columna DATE en modo string) -- parsear a
  // mediodia local, nunca UTC, para no repetir el bug de un-dia-adelantado
  // que ya tuvo este repo (ver exportar.ts / db.moduloEstaHabilitadoAhora).
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

export default function CentroModulos() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [confirmandoApagado, setConfirmandoApagado] = useState(false);
  const [editandoVentana, setEditandoVentana] = useState(false);
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const { data: config, isLoading } = trpc.inconformidad.moduloConfig.useQuery();
  // Estado EFECTIVO (lo que el trabajador realmente ve ahora) -- NO es lo
  // mismo que config.habilitado: si hay ventana programada, esta manda por
  // encima del flag manual (ver moduloEstaHabilitadoAhora en db.ts). Pintar
  // el switch/texto con config.habilitado directo sería mentirle al admin
  // sobre lo que el trabajador ve mientras hay una ventana activa.
  const { data: habilitadoEfectivo } = trpc.inconformidad.moduloHabilitado.useQuery();

  const actualizarMut = trpc.inconformidad.actualizarModulo.useMutation({
    onSuccess: (_data, variables) => {
      utils.inconformidad.moduloConfig.invalidate();
      utils.inconformidad.moduloHabilitado.invalidate();
      toast.success(`Módulo Inconformidad ${variables.habilitado ? "activado" : "desactivado"}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const programarMut = trpc.inconformidad.programarVentanaModulo.useMutation({
    onSuccess: () => {
      utils.inconformidad.moduloConfig.invalidate();
      utils.inconformidad.moduloHabilitado.invalidate();
      setEditandoVentana(false);
      toast.success("Ventana guardada");
    },
    onError: (err) => toast.error(err.message),
  });

  const tieneVentana = Boolean(config?.fechaDesde && config?.fechaHasta);

  const handleToggle = () => {
    if (habilitadoEfectivo) {
      setConfirmandoApagado(true);
    } else {
      actualizarMut.mutate({ habilitado: true });
    }
  };

  const handleGuardarVentana = () => {
    if (!fechaDesde || !fechaHasta) {
      toast.error("Elige ambas fechas");
      return;
    }
    if (fechaHasta < fechaDesde) {
      toast.error('"Hasta" no puede ser antes que "Desde"');
      return;
    }
    programarMut.mutate({ fechaDesde, fechaHasta });
  };

  if (isLoading || !config) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={fadeUp}>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Centro de Módulos</h1>
        <p className="mt-0.5 text-sm text-slate-400">Activa o desactiva lo que un trabajador puede ver ahora mismo.</p>
      </motion.div>

      {!habilitadoEfectivo && (
        <motion.div variants={fadeUp} role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
          El módulo Inconformidad está desactivado — los trabajadores no lo ven ni pueden iniciar un caso.
        </motion.div>
      )}

      <motion.div variants={fadeUp} className="space-y-3">
        {/* Inconformidad: real */}
        <div className="rounded-2xl bg-white p-5 shadow-card-rest border border-slate-200/60">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 font-semibold text-gray-800">
                <Flag size={17} className="text-gray-500" aria-hidden="true" />
                Inconformidad
              </p>
              <p className="mt-1 text-sm text-gray-600">
                {habilitadoEfectivo
                  ? "Los trabajadores pueden ver la sección e iniciar su caso."
                  : "Los trabajadores no ven la sección ni pueden iniciar un caso nuevo."}
              </p>
              {config.actualizadoPorNombre && (
                <p className="mt-1.5 text-xs text-slate-400">
                  Actualizado por {config.actualizadoPorNombre} · {new Date(config.updatedAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                </p>
              )}
              <button type="button" onClick={() => navigate("/inconformidades")} className="mt-1.5 text-xs font-semibold text-primary-500 underline">
                Ir al panel de Inconformidad
              </button>
            </div>
            <button
              role="switch"
              aria-checked={habilitadoEfectivo}
              aria-label="Habilitar módulo de Inconformidad"
              onClick={handleToggle}
              disabled={actualizarMut.isPending}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${
                habilitadoEfectivo ? "bg-primary-500" : "bg-slate-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                  habilitadoEfectivo ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Ventana programada -- fila etiqueta/control, mismo ritmo que la fila de arriba */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-gray-100 pt-3.5">
            <p className="text-sm font-medium text-gray-700">Ventana programada</p>

            {!editandoVentana && !tieneVentana && (
              <button
                type="button"
                onClick={() => setEditandoVentana(true)}
                className="text-sm font-semibold text-primary-500 underline decoration-dotted underline-offset-2"
              >
                + Programar fechas
              </button>
            )}

            {editandoVentana && (
              <div className="flex items-center gap-4">
                <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-gray-50 px-3 py-1.5">
                  <input
                    type="date"
                    value={fechaDesde}
                    onChange={(e) => setFechaDesde(e.target.value)}
                    aria-label="Fecha de inicio"
                    className="border-none bg-transparent text-sm text-slate-900 focus:outline-none"
                  />
                  <ArrowRight size={13} className="text-slate-400" aria-hidden="true" />
                  <input
                    type="date"
                    value={fechaHasta}
                    onChange={(e) => setFechaHasta(e.target.value)}
                    aria-label="Fecha de fin"
                    className="border-none bg-transparent text-sm text-slate-900 focus:outline-none"
                  />
                </div>
                <div className="flex gap-4">
                  <button type="button" onClick={() => setEditandoVentana(false)} className="text-sm font-semibold text-gray-600 hover:underline">
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleGuardarVentana}
                    disabled={programarMut.isPending}
                    className="text-sm font-semibold text-primary-500 hover:underline disabled:opacity-50"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            )}

            {!editandoVentana && tieneVentana && (
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Calendar size={15} className="text-primary-500" aria-hidden="true" />
                <span>{formatFecha(config.fechaDesde!)} – {formatFecha(config.fechaHasta!)}</span>
                <button
                  type="button"
                  onClick={() => {
                    setFechaDesde(config.fechaDesde!);
                    setFechaHasta(config.fechaHasta!);
                    setEditandoVentana(true);
                  }}
                  className="ml-1 font-semibold text-primary-500 hover:underline"
                >
                  Editar
                </button>
              </div>
            )}

            <p className="w-full text-xs text-slate-400">
              El switch de arriba manda siempre — esto solo automatiza cuándo cambiarlo.
            </p>
          </div>
        </div>

        {/* Futuros: agrupados, sin switch (no hay estado real que mostrar todavia) */}
        <div className="rounded-2xl bg-gray-50 p-5 border border-gray-100">
          <p className="text-micro font-semibold uppercase tracking-widest text-slate-400">Próximamente</p>
          <div className="mt-1 divide-y divide-gray-100">
            <div className="flex items-center justify-between py-3">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-400">
                <Award size={16} aria-hidden="true" /> Inscripción a Promoción
              </p>
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-slate-500">Sin construir</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-400">
                <ClipboardCheck size={16} aria-hidden="true" /> Autoevaluación
              </p>
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-slate-500">Sin construir</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-400">
                <Users size={16} aria-hidden="true" /> Evaluadores
              </p>
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-slate-500">Sin construir</span>
            </div>
          </div>
        </div>
      </motion.div>

      <ConfirmModal
        open={confirmandoApagado}
        variant="warning"
        title="¿Desactivar Inconformidad?"
        message={
          tieneVentana
            ? "Los trabajadores dejarán de ver esta sección de inmediato y se cancela la ventana programada. Los casos ya guardados o enviados no se pierden."
            : "Los trabajadores dejarán de ver esta sección de inmediato. Los casos ya guardados o enviados no se pierden — solo se bloquean los envíos nuevos mientras esté desactivado."
        }
        confirmLabel="Sí, desactivar"
        loading={actualizarMut.isPending}
        onCancel={() => setConfirmandoApagado(false)}
        onConfirm={() => {
          actualizarMut.mutate({ habilitado: false }, { onSuccess: () => setConfirmandoApagado(false) });
        }}
      />
    </motion.div>
  );
}

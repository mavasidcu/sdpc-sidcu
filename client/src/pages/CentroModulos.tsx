import { useState } from "react";
import { motion } from "framer-motion";
import { stagger, fadeUp } from "@/lib/animations";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Flag, Award, ClipboardCheck, Users, ArrowRight, Calendar, type LucideIcon } from "lucide-react";
import ConfirmModal from "@/components/ConfirmModal";

function formatFecha(fecha: string): string {
  // fecha ya es "YYYY-MM-DD" (columna DATE en modo string) -- parsear a
  // mediodia local, nunca UTC, para no repetir el bug de un-dia-adelantado
  // que ya tuvo este repo (ver exportar.ts / db.moduloEstaHabilitadoAhora).
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

type ModuloConfig = {
  fechaDesde: string | null;
  fechaHasta: string | null;
  actualizadoPorNombre?: string | null;
  updatedAt: Date | string;
};

// Extraido al agregarse el segundo modulo real (Promocion) -- los 4 modulos
// (Inconformidad, Promocion, Autoevaluacion, Evaluadores) comparten forma de
// config identica (ver *ModuloConfig en drizzle/schema.ts), asi que la
// tarjeta completa (switch + ventana programada) es la unidad que se repite,
// no solo el switch.
function ModuloToggleCard({
  titulo, Icono, habilitadoEfectivo, textoHabilitado, textoDeshabilitado,
  config, onIrAlPanel, linkLabel, onToggle, toggleLoading, onGuardarVentana, guardandoVentana,
}: {
  titulo: string;
  Icono: LucideIcon;
  habilitadoEfectivo: boolean | undefined;
  textoHabilitado: string;
  textoDeshabilitado: string;
  config: ModuloConfig;
  onIrAlPanel: () => void;
  linkLabel: string;
  onToggle: () => void;
  toggleLoading: boolean;
  onGuardarVentana: (fechaDesde: string, fechaHasta: string) => void;
  guardandoVentana: boolean;
}) {
  const [editandoVentana, setEditandoVentana] = useState(false);
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const tieneVentana = Boolean(config.fechaDesde && config.fechaHasta);

  const handleGuardarVentana = () => {
    if (!fechaDesde || !fechaHasta) {
      toast.error("Elige ambas fechas");
      return;
    }
    if (fechaHasta < fechaDesde) {
      toast.error('"Hasta" no puede ser antes que "Desde"');
      return;
    }
    onGuardarVentana(fechaDesde, fechaHasta);
    setEditandoVentana(false);
  };

  return (
    <div className="rounded-2xl bg-white p-5 shadow-card-rest border border-slate-200/60">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 font-semibold text-gray-800">
            <Icono size={17} className="text-gray-500" aria-hidden="true" />
            {titulo}
          </p>
          <p className="mt-1 text-sm text-gray-600">
            {habilitadoEfectivo ? textoHabilitado : textoDeshabilitado}
          </p>
          {config.actualizadoPorNombre && (
            <p className="mt-1.5 text-xs text-slate-400">
              Actualizado por {config.actualizadoPorNombre} · {new Date(config.updatedAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
            </p>
          )}
          <button type="button" onClick={onIrAlPanel} className="mt-1.5 text-xs font-semibold text-primary-500 underline">
            {linkLabel}
          </button>
        </div>
        <button
          role="switch"
          aria-checked={habilitadoEfectivo}
          aria-label={`Habilitar módulo de ${titulo}`}
          onClick={onToggle}
          disabled={toggleLoading}
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
                disabled={guardandoVentana}
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
  );
}

export default function CentroModulos() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [confirmandoApagadoInconformidad, setConfirmandoApagadoInconformidad] = useState(false);
  const [confirmandoApagadoPromocion, setConfirmandoApagadoPromocion] = useState(false);
  const [confirmandoApagadoAutoevaluacion, setConfirmandoApagadoAutoevaluacion] = useState(false);
  const [confirmandoApagadoEvaluadores, setConfirmandoApagadoEvaluadores] = useState(false);

  const { data: configInconformidad, isLoading: cargandoInconformidad } = trpc.inconformidad.moduloConfig.useQuery();
  // Estado EFECTIVO (lo que el trabajador realmente ve ahora) -- NO es lo
  // mismo que config.habilitado: si hay ventana programada, esta manda por
  // encima del flag manual (ver moduloEstaHabilitadoAhora en db.ts). Pintar
  // el switch/texto con config.habilitado directo sería mentirle al admin
  // sobre lo que el trabajador ve mientras hay una ventana activa.
  const { data: habilitadoEfectivoInconformidad } = trpc.inconformidad.moduloHabilitado.useQuery();

  const { data: configPromocion, isLoading: cargandoPromocion } = trpc.promocion.moduloConfig.useQuery();
  const { data: habilitadoEfectivoPromocion } = trpc.promocion.moduloHabilitado.useQuery();

  const { data: configAutoevaluacion, isLoading: cargandoAutoevaluacion } = trpc.autoevaluacion.moduloConfig.useQuery();
  const { data: habilitadoEfectivoAutoevaluacion } = trpc.autoevaluacion.moduloHabilitado.useQuery();

  const { data: configEvaluadores, isLoading: cargandoEvaluadores } = trpc.evaluadores.moduloConfig.useQuery();
  const { data: habilitadoEfectivoEvaluadores } = trpc.evaluadores.moduloHabilitado.useQuery();

  const actualizarInconformidadMut = trpc.inconformidad.actualizarModulo.useMutation({
    onSuccess: (_data, variables) => {
      utils.inconformidad.moduloConfig.invalidate();
      utils.inconformidad.moduloHabilitado.invalidate();
      toast.success(`Módulo Inconformidad ${variables.habilitado ? "activado" : "desactivado"}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const programarInconformidadMut = trpc.inconformidad.programarVentanaModulo.useMutation({
    onSuccess: () => {
      utils.inconformidad.moduloConfig.invalidate();
      utils.inconformidad.moduloHabilitado.invalidate();
      toast.success("Ventana guardada");
    },
    onError: (err) => toast.error(err.message),
  });

  const actualizarPromocionMut = trpc.promocion.actualizarModulo.useMutation({
    onSuccess: (_data, variables) => {
      utils.promocion.moduloConfig.invalidate();
      utils.promocion.moduloHabilitado.invalidate();
      toast.success(`Módulo Promoción ${variables.habilitado ? "activado" : "desactivado"}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const programarPromocionMut = trpc.promocion.programarVentanaModulo.useMutation({
    onSuccess: () => {
      utils.promocion.moduloConfig.invalidate();
      utils.promocion.moduloHabilitado.invalidate();
      toast.success("Ventana guardada");
    },
    onError: (err) => toast.error(err.message),
  });

  const actualizarAutoevaluacionMut = trpc.autoevaluacion.actualizarModulo.useMutation({
    onSuccess: (_data, variables) => {
      utils.autoevaluacion.moduloConfig.invalidate();
      utils.autoevaluacion.moduloHabilitado.invalidate();
      toast.success(`Módulo Autoevaluación ${variables.habilitado ? "activado" : "desactivado"}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const programarAutoevaluacionMut = trpc.autoevaluacion.programarVentanaModulo.useMutation({
    onSuccess: () => {
      utils.autoevaluacion.moduloConfig.invalidate();
      utils.autoevaluacion.moduloHabilitado.invalidate();
      toast.success("Ventana guardada");
    },
    onError: (err) => toast.error(err.message),
  });

  const actualizarEvaluadoresMut = trpc.evaluadores.actualizarModulo.useMutation({
    onSuccess: (_data, variables) => {
      utils.evaluadores.moduloConfig.invalidate();
      utils.evaluadores.moduloHabilitado.invalidate();
      toast.success(`Módulo Evaluadores ${variables.habilitado ? "activado" : "desactivado"}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const programarEvaluadoresMut = trpc.evaluadores.programarVentanaModulo.useMutation({
    onSuccess: () => {
      utils.evaluadores.moduloConfig.invalidate();
      utils.evaluadores.moduloHabilitado.invalidate();
      toast.success("Ventana guardada");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleToggleInconformidad = () => {
    if (habilitadoEfectivoInconformidad) {
      setConfirmandoApagadoInconformidad(true);
    } else {
      actualizarInconformidadMut.mutate({ habilitado: true });
    }
  };

  const handleTogglePromocion = () => {
    if (habilitadoEfectivoPromocion) {
      setConfirmandoApagadoPromocion(true);
    } else {
      actualizarPromocionMut.mutate({ habilitado: true });
    }
  };

  const handleToggleAutoevaluacion = () => {
    if (habilitadoEfectivoAutoevaluacion) {
      setConfirmandoApagadoAutoevaluacion(true);
    } else {
      actualizarAutoevaluacionMut.mutate({ habilitado: true });
    }
  };

  const handleToggleEvaluadores = () => {
    if (habilitadoEfectivoEvaluadores) {
      setConfirmandoApagadoEvaluadores(true);
    } else {
      actualizarEvaluadoresMut.mutate({ habilitado: true });
    }
  };

  if (
    cargandoInconformidad || !configInconformidad ||
    cargandoPromocion || !configPromocion ||
    cargandoAutoevaluacion || !configAutoevaluacion ||
    cargandoEvaluadores || !configEvaluadores
  ) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  const tieneVentanaInconformidad = Boolean(configInconformidad.fechaDesde && configInconformidad.fechaHasta);
  const tieneVentanaPromocion = Boolean(configPromocion.fechaDesde && configPromocion.fechaHasta);
  const tieneVentanaAutoevaluacion = Boolean(configAutoevaluacion.fechaDesde && configAutoevaluacion.fechaHasta);
  const tieneVentanaEvaluadores = Boolean(configEvaluadores.fechaDesde && configEvaluadores.fechaHasta);

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={fadeUp}>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Centro de Módulos</h1>
        <p className="mt-0.5 text-sm text-slate-400">Activa o desactiva lo que un trabajador puede ver ahora mismo.</p>
      </motion.div>

      {!habilitadoEfectivoInconformidad && (
        <motion.div variants={fadeUp} role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
          El módulo Inconformidad está desactivado — los trabajadores no lo ven ni pueden iniciar un caso.
        </motion.div>
      )}
      {!habilitadoEfectivoPromocion && (
        <motion.div variants={fadeUp} role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
          El módulo Promoción está desactivado — los trabajadores no pueden confirmar inscripción nueva.
        </motion.div>
      )}
      {!habilitadoEfectivoAutoevaluacion && (
        <motion.div variants={fadeUp} role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
          El módulo Autoevaluación está desactivado — nadie puede iniciar una autoevaluación nueva, aunque ya tenga Promoción confirmada.
        </motion.div>
      )}
      {!habilitadoEfectivoEvaluadores && (
        <motion.div variants={fadeUp} role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
          El módulo Evaluadores está desactivado — ningún evaluador puede iniciar su evaluación, aunque ya haya sido seleccionado.
        </motion.div>
      )}

      <motion.div variants={fadeUp} className="space-y-3">
        <ModuloToggleCard
          titulo="Inconformidad"
          Icono={Flag}
          habilitadoEfectivo={habilitadoEfectivoInconformidad}
          textoHabilitado="Los trabajadores pueden ver la sección e iniciar su caso."
          textoDeshabilitado="Los trabajadores no ven la sección ni pueden iniciar un caso nuevo."
          config={configInconformidad}
          onIrAlPanel={() => navigate("/inconformidades")}
          linkLabel="Ir al panel de Inconformidad"
          onToggle={handleToggleInconformidad}
          toggleLoading={actualizarInconformidadMut.isPending}
          onGuardarVentana={(fechaDesde, fechaHasta) => programarInconformidadMut.mutate({ fechaDesde, fechaHasta })}
          guardandoVentana={programarInconformidadMut.isPending}
        />

        <ModuloToggleCard
          titulo="Promoción"
          Icono={Award}
          habilitadoEfectivo={habilitadoEfectivoPromocion}
          textoHabilitado="Los trabajadores elegibles pueden confirmar su inscripción."
          textoDeshabilitado="Los trabajadores no pueden confirmar inscripción nueva."
          config={configPromocion}
          onIrAlPanel={() => navigate("/promociones")}
          linkLabel="Ir al panel de Promoción"
          onToggle={handleTogglePromocion}
          toggleLoading={actualizarPromocionMut.isPending}
          onGuardarVentana={(fechaDesde, fechaHasta) => programarPromocionMut.mutate({ fechaDesde, fechaHasta })}
          guardandoVentana={programarPromocionMut.isPending}
        />

        <ModuloToggleCard
          titulo="Autoevaluación"
          Icono={ClipboardCheck}
          habilitadoEfectivo={habilitadoEfectivoAutoevaluacion}
          textoHabilitado="Los trabajadores con Promoción confirmada pueden iniciar su autoevaluación."
          textoDeshabilitado="Nadie puede iniciar una autoevaluación nueva, aunque ya tenga Promoción confirmada."
          config={configAutoevaluacion}
          onIrAlPanel={() => navigate("/autoevaluaciones")}
          linkLabel="Ir al panel de Autoevaluación"
          onToggle={handleToggleAutoevaluacion}
          toggleLoading={actualizarAutoevaluacionMut.isPending}
          onGuardarVentana={(fechaDesde, fechaHasta) => programarAutoevaluacionMut.mutate({ fechaDesde, fechaHasta })}
          guardandoVentana={programarAutoevaluacionMut.isPending}
        />

        <ModuloToggleCard
          titulo="Evaluadores"
          Icono={Users}
          habilitadoEfectivo={habilitadoEfectivoEvaluadores}
          textoHabilitado="Los evaluadores seleccionados (Jefe/Compañero) pueden iniciar su evaluación."
          textoDeshabilitado="Ningún evaluador puede iniciar su evaluación, aunque ya haya sido seleccionado."
          config={configEvaluadores}
          onIrAlPanel={() => navigate("/evaluadores")}
          linkLabel="Ir al panel de Evaluadores"
          onToggle={handleToggleEvaluadores}
          toggleLoading={actualizarEvaluadoresMut.isPending}
          onGuardarVentana={(fechaDesde, fechaHasta) => programarEvaluadoresMut.mutate({ fechaDesde, fechaHasta })}
          guardandoVentana={programarEvaluadoresMut.isPending}
        />
      </motion.div>

      <ConfirmModal
        open={confirmandoApagadoInconformidad}
        variant="warning"
        title="¿Desactivar Inconformidad?"
        message={
          tieneVentanaInconformidad
            ? "Los trabajadores dejarán de ver esta sección de inmediato y se cancela la ventana programada. Los casos ya guardados o enviados no se pierden."
            : "Los trabajadores dejarán de ver esta sección de inmediato. Los casos ya guardados o enviados no se pierden — solo se bloquean los envíos nuevos mientras esté desactivado."
        }
        confirmLabel="Sí, desactivar"
        loading={actualizarInconformidadMut.isPending}
        onCancel={() => setConfirmandoApagadoInconformidad(false)}
        onConfirm={() => {
          actualizarInconformidadMut.mutate({ habilitado: false }, { onSuccess: () => setConfirmandoApagadoInconformidad(false) });
        }}
      />

      <ConfirmModal
        open={confirmandoApagadoPromocion}
        variant="warning"
        title="¿Desactivar Promoción?"
        message={
          tieneVentanaPromocion
            ? "Los trabajadores dejarán de poder confirmar inscripción de inmediato y se cancela la ventana programada. Las inscripciones ya confirmadas no se pierden."
            : "Los trabajadores dejarán de poder confirmar inscripción de inmediato. Las inscripciones ya confirmadas no se pierden — solo se bloquean las confirmaciones nuevas mientras esté desactivado."
        }
        confirmLabel="Sí, desactivar"
        loading={actualizarPromocionMut.isPending}
        onCancel={() => setConfirmandoApagadoPromocion(false)}
        onConfirm={() => {
          actualizarPromocionMut.mutate({ habilitado: false }, { onSuccess: () => setConfirmandoApagadoPromocion(false) });
        }}
      />

      <ConfirmModal
        open={confirmandoApagadoAutoevaluacion}
        variant="warning"
        title="¿Desactivar Autoevaluación?"
        message={
          tieneVentanaAutoevaluacion
            ? "Nadie podrá iniciar una autoevaluación nueva de inmediato y se cancela la ventana programada. Las autoevaluaciones ya iniciadas o enviadas no se pierden."
            : "Nadie podrá iniciar una autoevaluación nueva de inmediato, aunque ya tenga Promoción confirmada. Las autoevaluaciones ya iniciadas o enviadas no se pierden."
        }
        confirmLabel="Sí, desactivar"
        loading={actualizarAutoevaluacionMut.isPending}
        onCancel={() => setConfirmandoApagadoAutoevaluacion(false)}
        onConfirm={() => {
          actualizarAutoevaluacionMut.mutate({ habilitado: false }, { onSuccess: () => setConfirmandoApagadoAutoevaluacion(false) });
        }}
      />

      <ConfirmModal
        open={confirmandoApagadoEvaluadores}
        variant="warning"
        title="¿Desactivar Evaluadores?"
        message={
          tieneVentanaEvaluadores
            ? "Ningún evaluador podrá iniciar su evaluación de inmediato y se cancela la ventana programada. Las evaluaciones ya iniciadas o enviadas no se pierden."
            : "Ningún evaluador podrá iniciar su evaluación de inmediato, aunque ya haya sido seleccionado. Las evaluaciones ya iniciadas o enviadas no se pierden."
        }
        confirmLabel="Sí, desactivar"
        loading={actualizarEvaluadoresMut.isPending}
        onCancel={() => setConfirmandoApagadoEvaluadores(false)}
        onConfirm={() => {
          actualizarEvaluadoresMut.mutate({ habilitado: false }, { onSuccess: () => setConfirmandoApagadoEvaluadores(false) });
        }}
      />
    </motion.div>
  );
}

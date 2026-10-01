import { useState } from "react";
import { motion } from "framer-motion";
import { stagger, fadeUp } from "@/lib/animations";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ListChecks, CheckCircle2 } from "lucide-react";
import ConfirmModal from "@/components/ConfirmModal";
import { PREGUNTAS_AUTOEVALUACION } from "@shared/const";

const LIKERT_LABELS: Record<string, string> = {
  siempre: "Siempre",
  frecuente: "Frecuente",
  algunas_veces: "Algunas veces",
  nunca: "Nunca",
};
const LIKERT_OPCIONES = ["siempre", "frecuente", "algunas_veces", "nunca"] as const;

export default function Autoevaluacion() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.autoevaluacion.miEstado.useQuery();
  const { data: habilitado } = trpc.autoevaluacion.moduloHabilitado.useQuery();
  const [respuestas, setRespuestas] = useState<Record<number, string>>({});
  const [confirmandoEnvio, setConfirmandoEnvio] = useState(false);
  // 1 pregunta a la vez -- ver todas juntas invita a contestar por patron
  // sin leer (decision 2026-09-21). Barra de progreso deliberadamente sin
  // numero "X/28": no dejar calcular cuanto falta para "aventar" las ultimas.
  const [indiceActual, setIndiceActual] = useState(0);

  const iniciarMut = trpc.autoevaluacion.iniciar.useMutation({
    onSuccess: () => { utils.autoevaluacion.miEstado.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const enviarMut = trpc.autoevaluacion.enviar.useMutation({
    onSuccess: () => {
      utils.autoevaluacion.miEstado.invalidate();
      toast.success("Tu autoevaluación fue enviada");
      setConfirmandoEnvio(false);
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  const handleEnviar = () => {
    if (data.estado !== "borrador") return;
    const faltantes = data.preguntas.filter((p) => !respuestas[p.preguntaId] && !p.respuestaElegida);
    if (faltantes.length > 0) {
      toast.error(`Faltan ${faltantes.length} preguntas por contestar`);
      return;
    }
    setConfirmandoEnvio(true);
  };

  const handleConfirmarEnvio = () => {
    if (data.estado !== "borrador") return;
    enviarMut.mutate({
      respuestas: data.preguntas.map((p) => ({
        preguntaId: p.preguntaId,
        respuestaElegida: (respuestas[p.preguntaId] ?? p.respuestaElegida) as typeof LIKERT_OPCIONES[number],
      })),
    });
  };

  const preguntaActual = data.estado === "borrador" ? data.preguntas[indiceActual] : undefined;
  const totalPreguntas = data.estado === "borrador" ? data.preguntas.length : 0;
  const esUltima = indiceActual === totalPreguntas - 1;
  const respuestaActual = preguntaActual ? respuestas[preguntaActual.preguntaId] ?? preguntaActual.respuestaElegida : undefined;
  const progreso = totalPreguntas > 0 ? ((indiceActual + 1) / totalPreguntas) * 100 : 0;

  const handleSiguiente = () => {
    if (!respuestaActual) return;
    if (esUltima) {
      handleEnviar();
    } else {
      setIndiceActual((i) => i + 1);
    }
  };

  const handleAtras = () => setIndiceActual((i) => Math.max(0, i - 1));

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={fadeUp}>
        <h1 className="text-2xl font-bold text-gray-900">Autoevaluación</h1>
      </motion.div>

      <motion.div variants={fadeUp} className="rounded-2xl bg-white p-8 shadow-card-rest border border-gray-100">
        {data.estado === "sin_promocion" && (
          <div className="text-center">
            <ListChecks className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-3 font-medium text-gray-700">Todavía no puedes hacer tu autoevaluación</p>
            <p className="mt-1 text-sm text-gray-500">Necesitas tener una inscripción a Promoción confirmada.</p>
          </div>
        )}

        {data.estado === "no_iniciada" && habilitado === false && (
          <div className="text-center">
            <ListChecks className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-3 font-medium text-gray-700">Esta sección no está disponible por ahora</p>
            <p className="mt-1 text-sm text-gray-500">Vuelve a intentarlo más tarde.</p>
          </div>
        )}

        {data.estado === "no_iniciada" && habilitado !== false && (
          <div className="text-center">
            <ListChecks className="mx-auto h-10 w-10 text-primary-300" />
            <p className="mt-3 font-medium text-gray-700">Tu autoevaluación está lista para empezar</p>
            <p className="mt-1 text-sm text-gray-500">Son {PREGUNTAS_AUTOEVALUACION} preguntas, una sola vez.</p>
            <button
              type="button"
              onClick={() => iniciarMut.mutate()}
              disabled={iniciarMut.isPending}
              className="mt-4 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {iniciarMut.isPending ? "Iniciando..." : "Iniciar autoevaluación"}
            </button>
          </div>
        )}

        {data.estado === "borrador" && preguntaActual && (
          <div className="space-y-6">
            <div className="h-[3px] w-full overflow-hidden rounded-full bg-gray-100">
              <motion.div
                className="h-full rounded-full bg-primary-500"
                initial={false}
                animate={{ width: `${progreso}%` }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              />
            </div>

            <motion.div
              key={preguntaActual.preguntaId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <p className="font-serif text-xl text-gray-900">{preguntaActual.texto}</p>
              <div className="mt-6 space-y-2">
                {LIKERT_OPCIONES.map((opcion) => {
                  const elegida = respuestaActual === opcion;
                  return (
                    <button
                      key={opcion}
                      type="button"
                      onClick={() => setRespuestas((prev) => ({ ...prev, [preguntaActual.preguntaId]: opcion }))}
                      className={`flex w-full items-center rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors ${
                        elegida
                          ? "border-accent-500 bg-primary-50 text-primary-700"
                          : "border-gray-200 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {LIKERT_LABELS[opcion]}
                    </button>
                  );
                })}
              </div>
            </motion.div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={handleAtras}
                disabled={indiceActual === 0}
                className="text-sm font-semibold text-gray-500 hover:text-gray-700 disabled:opacity-0"
              >
                Atrás
              </button>
              <button
                type="button"
                onClick={handleSiguiente}
                disabled={!respuestaActual || enviarMut.isPending}
                className="rounded-xl bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                {esUltima ? (enviarMut.isPending ? "Enviando..." : "Enviar") : "Siguiente"}
              </button>
            </div>
          </div>
        )}

        {data.estado === "enviado" && (
          <div className="text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <p className="mt-3 font-medium text-gray-700">Tu autoevaluación fue enviada</p>
            <p className="mt-1 text-sm text-gray-500">Gracias por completarla.</p>
          </div>
        )}
      </motion.div>

      <ConfirmModal
        open={confirmandoEnvio}
        title="¿Enviar tu autoevaluación?"
        message="No podrás editar tus respuestas después de enviarlas. ¿Confirmas?"
        confirmLabel="Sí, enviar"
        variant="warning"
        loading={enviarMut.isPending}
        onConfirm={handleConfirmarEnvio}
        onCancel={() => setConfirmandoEnvio(false)}
      />
    </motion.div>
  );
}

import { useState } from "react";
import { motion } from "framer-motion";
import { stagger, fadeUp } from "@/lib/animations";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ListChecks, Upload, Plus, Pencil, Trash2, X } from "lucide-react";
import ImportarCSVModal from "@/components/ImportarCSVModal";
import ConfirmModal from "@/components/ConfirmModal";
import { PREGUNTAS_AUTOEVALUACION } from "@shared/const";

const COLUMNAS_IMPORT = [
  { key: "texto", label: "Texto de la pregunta", ejemplo: "¿Llegas puntual a tu jornada laboral?" },
  { key: "respuesta_correcta", label: "Respuesta correcta", ejemplo: "siempre" },
];

const LIKERT_LABELS: Record<string, string> = {
  siempre: "Siempre",
  frecuente: "Frecuente",
  algunas_veces: "Algunas veces",
  nunca: "Nunca",
};
const LIKERT_OPCIONES = ["siempre", "frecuente", "algunas_veces", "nunca"] as const;

// id null = creando una pregunta nueva, id number = editando una existente
// -- mismo modal para los 2 casos, solo cambia el titulo/mutacion al guardar.
type FormPregunta = { id: number | null; texto: string; respuestaCorrecta: string; activo: boolean };

export default function GestionAutoevaluacion() {
  const utils = trpc.useUtils();
  const [importando, setImportando] = useState(false);
  const [form, setForm] = useState<FormPregunta | null>(null);
  const [eliminando, setEliminando] = useState<{ id: number; texto: string } | null>(null);

  const { data: activas, isLoading } = trpc.autoevaluacion.contarActivas.useQuery();
  const { data: preguntas, isLoading: cargandoPreguntas } = trpc.autoevaluacion.listarPreguntas.useQuery();
  const importarMut = trpc.autoevaluacion.importarPreguntas.useMutation();

  const invalidarBanco = () => {
    utils.autoevaluacion.listarPreguntas.invalidate();
    utils.autoevaluacion.contarActivas.invalidate();
  };

  const crearMut = trpc.autoevaluacion.crearPregunta.useMutation({
    onSuccess: () => {
      invalidarBanco();
      setForm(null);
      toast.success("Pregunta creada");
    },
    onError: (err) => toast.error(err.message),
  });
  const actualizarMut = trpc.autoevaluacion.actualizarPregunta.useMutation({
    onSuccess: () => {
      invalidarBanco();
      setForm(null);
      toast.success("Pregunta actualizada");
    },
    onError: (err) => toast.error(err.message),
  });
  const eliminarMut = trpc.autoevaluacion.eliminarPregunta.useMutation({
    onSuccess: () => {
      invalidarBanco();
      setEliminando(null);
      toast.success("Pregunta eliminada");
    },
    onError: (err) => {
      setEliminando(null);
      toast.error(err.message);
    },
  });

  const guardando = crearMut.isPending || actualizarMut.isPending;

  function guardarForm() {
    if (!form) return;
    if (form.id === null) {
      crearMut.mutate({ texto: form.texto, respuestaCorrecta: form.respuestaCorrecta as (typeof LIKERT_OPCIONES)[number] });
    } else {
      actualizarMut.mutate({
        id: form.id,
        texto: form.texto,
        respuestaCorrecta: form.respuestaCorrecta as (typeof LIKERT_OPCIONES)[number],
        activo: form.activo,
      });
    }
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={fadeUp}>
        <h1 className="text-2xl font-bold text-gray-900">Autoevaluación — Banco de preguntas</h1>
      </motion.div>

      <motion.div variants={fadeUp} className="rounded-2xl bg-white p-6 shadow-card-rest border border-gray-100">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
              <ListChecks className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-800">
                {isLoading ? "Cargando..." : `${activas ?? 0} preguntas activas en el banco`}
              </p>
              <p className="text-sm text-gray-500">Se sortean {PREGUNTAS_AUTOEVALUACION} por autoevaluación.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setForm({ id: null, texto: "", respuestaCorrecta: "siempre", activo: true })}
              className="flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Plus size={15} />
              Crear pregunta
            </button>
            <button
              type="button"
              onClick={() => setImportando(true)}
              className="flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 transition-colors"
            >
              <Upload size={15} />
              Importar CSV
            </button>
          </div>
        </div>
        {!isLoading && (activas ?? 0) < PREGUNTAS_AUTOEVALUACION && (
          <p className="mt-4 rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-700">
            ⚠️ Menos de {PREGUNTAS_AUTOEVALUACION} preguntas activas — nadie puede completar su autoevaluación hasta que se corrija
          </p>
        )}
      </motion.div>

      <motion.div variants={fadeUp} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card-rest">
        <div>
          {cargandoPreguntas ? (
            <div className="px-4 py-10 text-center text-sm text-gray-400">Cargando...</div>
          ) : preguntas?.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-400">Banco vacío — importa un CSV o crea una pregunta para empezar.</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 w-14">No</th>
                  <th className="px-4 py-2.5">Afirmación</th>
                  <th className="px-4 py-2.5 w-40">Respuesta correcta</th>
                  <th className="px-4 py-2.5 w-24">Estado</th>
                  <th className="px-4 py-2.5 w-40"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preguntas?.map((p, i) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-400 tabular-nums">{i + 1}</td>
                    <td className="px-4 py-2.5 text-gray-800">{p.texto}</td>
                    <td className="px-4 py-2.5 text-gray-600">{LIKERT_LABELS[p.respuestaCorrecta] ?? p.respuestaCorrecta}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${p.activo ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                        {p.activo ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setForm({ id: p.id, texto: p.texto, respuestaCorrecta: p.respuestaCorrecta, activo: p.activo })}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                        >
                          <Pencil size={12} />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => setEliminando({ id: p.id, texto: p.texto })}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 size={12} />
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </motion.div>

      {importando && (
        <ImportarCSVModal
          titulo="Banco de Autoevaluación"
          columnas={COLUMNAS_IMPORT}
          onImportar={(registros) => importarMut.mutateAsync({ registros })}
          onClose={() => setImportando(false)}
          onSuccess={invalidarBanco}
        />
      )}

      {form && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setForm(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">{form.id === null ? "Crear pregunta" : "Editar pregunta"}</h3>
              <button onClick={() => setForm(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <label className="block text-xs font-semibold text-gray-500">Texto de la afirmación</label>
            <textarea
              value={form.texto}
              onChange={(e) => setForm({ ...form, texto: e.target.value })}
              rows={3}
              maxLength={500}
              placeholder="Ej. Cumplo puntualmente con mi horario y funciones laborales"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />

            <label className="mt-3 block text-xs font-semibold text-gray-500">Respuesta correcta</label>
            <select
              value={form.respuestaCorrecta}
              onChange={(e) => setForm({ ...form, respuestaCorrecta: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            >
              {LIKERT_OPCIONES.map((op) => (
                <option key={op} value={op}>{LIKERT_LABELS[op]}</option>
              ))}
            </select>

            {form.id !== null && (
              <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.activo}
                  onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                Pregunta activa (se puede sortear)
              </label>
            )}

            <div className="mt-5 flex gap-3">
              <button onClick={() => setForm(null)} className="flex-1 rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <button
                onClick={guardarForm}
                disabled={!form.texto.trim() || guardando}
                className="flex-1 rounded-xl bg-primary-600 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {guardando ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!eliminando}
        variant="danger"
        title="¿Eliminar pregunta?"
        message={eliminando ? `"${eliminando.texto}" se borrará del banco. Si ya fue usada en alguna autoevaluación, no se podrá eliminar — desactívala en vez de borrarla.` : ""}
        confirmLabel="Sí, eliminar"
        loading={eliminarMut.isPending}
        onCancel={() => setEliminando(null)}
        onConfirm={() => eliminando && eliminarMut.mutate({ id: eliminando.id })}
      />
    </motion.div>
  );
}

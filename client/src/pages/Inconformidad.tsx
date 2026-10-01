import { useState } from "react";
import { motion } from "framer-motion";
import { stagger, fadeUp } from "@/lib/animations";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { CheckCircle2, FileWarning, Trash2 } from "lucide-react";
import ConfirmModal from "@/components/ConfirmModal";
import DismissibleAlert from "@/components/DismissibleAlert";
import SubidaPDF from "@/components/inconformidad/SubidaPDF";
import { FACTOR_INCONFORMIDAD_LABELS as FACTOR_LABELS } from "@shared/const";

export default function Inconformidad() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [textos, setTextos] = useState<Record<string, string>>({});
  // Estado real (no derivado) de qué factores tienen su panel abierto. Un
  // factor ya guardado se bloquea en "abierto" vía el prop `disabled` del
  // checkbox (ver más abajo) -- la única forma de cerrarlo/removerlo es el
  // botón "Quitar factor", que sí borra el registro en el servidor. Esto
  // evita el bug de la versión original del brief, donde el checkbox no
  // respondía visualmente a los clics.
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [confirmandoEnvio, setConfirmandoEnvio] = useState(false);
  const [factorAQuitar, setFactorAQuitar] = useState<{ id: number; label: string } | null>(null);
  // Banner inline (role="alert") para errores de mutacion que no sean
  // CONFLICT -- este formulario se edita muchas veces antes de enviarse, y
  // un toast se puede perder si el usuario esta escribiendo en otra parte
  // de la pantalla. Mismo patron visual que SubidaPDF.tsx.
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const { data: perfil, isLoading: perfilLoading } = trpc.perfil.obtener.useQuery();
  const { data: factoresConfig, isLoading: configLoading } = trpc.inconformidad.factoresDisponibles.useQuery();
  const { data: inconformidad, isLoading: incLoading } = trpc.inconformidad.miInconformidad.useQuery();
  const { data: moduloHabilitado, isLoading: moduloLoading } = trpc.inconformidad.moduloHabilitado.useQuery();

  const guardarMut = trpc.inconformidad.guardarFactor.useMutation({
    onSuccess: () => {
      utils.inconformidad.miInconformidad.invalidate();
      setErrorGeneral(null);
      toast.success("Factor guardado");
    },
    onError: (err) => {
      if (err.data?.code === "CONFLICT") {
        // La pantalla se refresca sola (spec §5), pero sin avisar nada el
        // texto que la persona estaba escribiendo desaparece sin
        // explicación visible (hallazgo real de QA). err.message ya trae el
        // mensaje pensado para esto ("Tu inconformidad ya fue enviada...").
        toast(err.message);
        utils.inconformidad.miInconformidad.invalidate();
        return;
      }
      setErrorGeneral(err.message);
      toast.error(err.message);
    },
  });

  const quitarMut = trpc.inconformidad.quitarFactor.useMutation({
    onSuccess: () => {
      utils.inconformidad.miInconformidad.invalidate();
      setErrorGeneral(null);
      toast.success("Factor eliminado");
      setFactorAQuitar(null);
    },
    onError: (err) => {
      setFactorAQuitar(null);
      if (err.data?.code === "CONFLICT") {
        // La pantalla se refresca sola (spec §5), pero sin avisar nada el
        // texto que la persona estaba escribiendo desaparece sin
        // explicación visible (hallazgo real de QA). err.message ya trae el
        // mensaje pensado para esto ("Tu inconformidad ya fue enviada...").
        toast(err.message);
        utils.inconformidad.miInconformidad.invalidate();
        return;
      }
      setErrorGeneral(err.message);
      toast.error(err.message);
    },
  });

  const enviarMut = trpc.inconformidad.enviar.useMutation({
    onSuccess: () => {
      utils.inconformidad.miInconformidad.invalidate();
      setErrorGeneral(null);
      setConfirmandoEnvio(false);
    },
    onError: (err) => {
      setConfirmandoEnvio(false);
      if (err.data?.code === "CONFLICT") {
        // La pantalla se refresca sola (spec §5), pero sin avisar nada el
        // texto que la persona estaba escribiendo desaparece sin
        // explicación visible (hallazgo real de QA). err.message ya trae el
        // mensaje pensado para esto ("Tu inconformidad ya fue enviada...").
        toast(err.message);
        utils.inconformidad.miInconformidad.invalidate();
        return;
      }
      setErrorGeneral(err.message);
      toast.error(err.message);
    },
  });

  if (!perfilLoading && perfil === null) {
    navigate("/onboarding");
    return null;
  }

  if (perfilLoading || configLoading || incLoading || moduloLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  if (inconformidad?.estado === "enviado") {
    return (
      <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">
        <motion.div variants={fadeUp}>
          <h1 className="text-2xl font-bold text-gray-900">Inconformidad</h1>
          <p className="mt-1 text-gray-500">Tu inconformidad ya fue enviada</p>
        </motion.div>
        <motion.div variants={fadeUp} className="rounded-2xl bg-white p-6 shadow-card-rest border border-gray-100">
          <div className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 size={20} />
            <p className="font-semibold">Enviada correctamente</p>
          </div>
          <ul className="mt-4 space-y-2">
            {inconformidad.factores.map((f) => (
              <li key={f.id} className="rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
                <p className="font-medium text-gray-800">{FACTOR_LABELS[f.factor]}</p>
                <p className="mt-1 whitespace-pre-wrap">{f.mensaje}</p>
              </li>
            ))}
          </ul>
        </motion.div>
      </motion.div>
    );
  }

  // Un caso YA enviado (bloque de arriba) siempre se puede seguir viendo --
  // esto solo bloquea a quien todavia no ha terminado/enviado el suyo
  // mientras el módulo está en pausa (decisión "pausa total" confirmada con
  // el cliente).
  if (!moduloHabilitado) {
    return (
      <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">
        <motion.div variants={fadeUp}>
          <h1 className="text-2xl font-bold text-gray-900">Inconformidad</h1>
        </motion.div>
        <motion.div variants={fadeUp} className="rounded-2xl bg-white p-8 text-center shadow-card-rest border border-gray-100">
          <FileWarning className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 font-medium text-gray-700">Esta sección no está disponible por ahora</p>
          <p className="mt-1 text-sm text-gray-500">Vuelve a intentarlo más tarde.</p>
        </motion.div>
      </motion.div>
    );
  }

  const factoresGuardados = inconformidad?.factores ?? [];
  const puedeEnviar = factoresGuardados.length > 0;

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={fadeUp}>
        <h1 className="text-2xl font-bold text-gray-900">Inconformidad</h1>
        <p className="mt-1 text-gray-500">Selecciona el factor o factores sobre los que te quieres inconformar</p>
      </motion.div>

      {errorGeneral && (
        <DismissibleAlert mensaje={errorGeneral} onCerrar={() => setErrorGeneral(null)} />
      )}

      <motion.div variants={stagger} className="space-y-4">
        {(factoresConfig ?? []).map((fc) => {
          const guardado = factoresGuardados.find((f) => f.factor === fc.factor);
          const noDisponible = !fc.habilitado && !guardado;
          // Una vez guardado en el servidor, el factor queda "abierto" de
          // forma permanente -- el checkbox se bloquea (no se puede
          // desmarcar) porque desmarcarlo no borraría nada en el servidor.
          // Para factores sin guardar, `abiertos` sí es libremente
          // controlado por el usuario.
          const seleccionado = guardado != null || abiertos.has(fc.factor);
          const texto = textos[fc.factor] ?? guardado?.mensaje ?? "";

          return (
            <motion.div key={fc.factor} variants={fadeUp} className="rounded-2xl bg-white p-5 shadow-card-rest border border-gray-100">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={seleccionado}
                  disabled={noDisponible || guardado != null}
                  onChange={(e) => {
                    setAbiertos((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(fc.factor);
                      else next.delete(fc.factor);
                      return next;
                    });
                  }}
                  className="mt-1 h-4 w-4 rounded border-gray-300"
                />
                <div className="flex-1">
                  <span className="font-semibold text-gray-900">{FACTOR_LABELS[fc.factor]}</span>
                  {noDisponible && (
                    <span className="ml-2 text-xs text-gray-400">No disponible por ahora</span>
                  )}
                </div>
              </label>

              {seleccionado && (
                <div className="mt-3 space-y-3 pl-7">
                  <div>
                    <textarea
                      value={texto}
                      onChange={(e) => setTextos((prev) => ({ ...prev, [fc.factor]: e.target.value.slice(0, 500) }))}
                      rows={4}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition-all focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                      placeholder="Describe tu inconformidad..."
                    />
                    <p className={`mt-1 text-xs ${texto.length >= 500 ? "text-rose-500" : "text-gray-400"}`}>
                      {texto.length}/500 caracteres
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <button
                      type="button"
                      disabled={texto.trim().length < 10 || guardarMut.isPending}
                      onClick={() => guardarMut.mutate({ factor: fc.factor as any, mensaje: texto.trim() })}
                      className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
                    >
                      {guardarMut.isPending ? "Guardando..." : guardado ? "Guardar cambios" : "Guardar"}
                    </button>

                    {guardado && (
                      <button
                        type="button"
                        onClick={() => setFactorAQuitar({ id: guardado.id, label: FACTOR_LABELS[fc.factor] })}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-rose-500 hover:text-rose-600"
                      >
                        <Trash2 size={14} />
                        Quitar factor
                      </button>
                    )}
                  </div>

                  {guardado && (
                    <SubidaPDF
                      factorId={guardado.id}
                      archivoActual={guardado.archivoId ? { nombreOriginal: guardado.nombreOriginal ?? "archivo.pdf" } : null}
                      onSubido={() => utils.inconformidad.miInconformidad.invalidate()}
                    />
                  )}
                </div>
              )}
            </motion.div>
          );
        })}
      </motion.div>

      {!puedeEnviar && (
        <motion.div variants={fadeUp} className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <FileWarning size={16} />
          Guarda al menos un factor antes de poder enviar.
        </motion.div>
      )}

      <motion.div variants={fadeUp}>
        <button
          type="button"
          disabled={!puedeEnviar}
          onClick={() => setConfirmandoEnvio(true)}
          className="w-full rounded-xl bg-primary-600 py-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 sm:w-auto sm:px-8"
        >
          Enviar / Finalizar
        </button>
      </motion.div>

      <ConfirmModal
        open={confirmandoEnvio}
        title="¿Enviar tu inconformidad?"
        message="No podrás editar tu inconformidad después de enviarla. ¿Confirmas?"
        confirmLabel="Sí, enviar"
        variant="warning"
        loading={enviarMut.isPending}
        onConfirm={() => enviarMut.mutate()}
        onCancel={() => setConfirmandoEnvio(false)}
      />

      <ConfirmModal
        open={factorAQuitar != null}
        title="¿Quitar este factor?"
        message={`Se eliminará "${factorAQuitar?.label ?? ""}" de tu inconformidad, junto con el PDF adjunto si subiste uno. Podrás agregarlo de nuevo antes de enviar.`}
        confirmLabel="Sí, quitar"
        variant="danger"
        loading={quitarMut.isPending}
        onConfirm={() => {
          if (factorAQuitar) quitarMut.mutate({ factorId: factorAQuitar.id });
        }}
        onCancel={() => setFactorAQuitar(null)}
      />
    </motion.div>
  );
}

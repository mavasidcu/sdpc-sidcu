import { motion } from "framer-motion";
import { stagger, fadeUp } from "@/lib/animations";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useState } from "react";
import { Award, CheckCircle2, AlertCircle } from "lucide-react";
import ConfirmModal from "@/components/ConfirmModal";
import BuscadorEvaluador from "@/components/BuscadorEvaluador";

type Seleccion = { curp: string; nombre: string; correo: string } | null;

// I4 (revision final de rama): antes, tras elegir, la unica forma de
// cambiar era recargar la pagina completa (perdiendo los otros 2 picks ya
// hechos) -- el spec (seccion 4) exige poder "regresar y cambiar libremente
// antes de confirmar". El boton "Cambiar" solo limpia ESTE slot.
function CampoEvaluador({
  etiqueta, rol, seleccion, onElegir, onCorreo, onCambiar,
}: {
  etiqueta: string;
  rol: "jefe" | "companero";
  seleccion: Seleccion;
  onElegir: (curp: string, nombre: string, correoPrellenado: string | null) => void;
  onCorreo: (correo: string) => void;
  onCambiar: () => void;
}) {
  return (
    <div>
      <label className="text-sm font-semibold text-gray-700">{etiqueta}</label>
      {!seleccion ? (
        <BuscadorEvaluador rol={rol} onElegir={onElegir} placeholder={`Buscar ${etiqueta.toLowerCase()}...`} />
      ) : (
        <div className="mt-1 space-y-2">
          <div className="flex items-center justify-between gap-2 rounded-lg bg-primary-50 px-3 py-2">
            <p className="text-sm text-primary-700">{seleccion.nombre}</p>
            <button
              type="button"
              onClick={onCambiar}
              className="shrink-0 text-xs font-semibold text-primary-600 hover:text-primary-800 hover:underline"
            >
              Cambiar
            </button>
          </div>
          <input
            type="email"
            value={seleccion.correo}
            onChange={(e) => onCorreo(e.target.value)}
            placeholder="Correo de contacto"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
        </div>
      )}
    </div>
  );
}

export default function Promocion() {
  const utils = trpc.useUtils();
  const [confirmando, setConfirmando] = useState(false);
  const [jefe, setJefe] = useState<Seleccion>(null);
  const [companero1, setCompanero1] = useState<Seleccion>(null);
  const [companero2, setCompanero2] = useState<Seleccion>(null);

  const { data, isLoading } = trpc.promocion.miElegibilidad.useQuery();
  const { data: moduloHabilitado } = trpc.promocion.moduloHabilitado.useQuery();

  // El backend ya rechaza (SELECCION_INVALIDA) si 2 de los 3 slots terminan
  // con el mismo curp -- este check es solo para no dejar que el
  // trabajador llegue hasta "Confirmar" y se entere del error hasta ahi.
  //
  // I2: correoPrellenado sigue la precedencia del spec (seccion 4) --
  // users.email -> correoSugerido -> "". Antes se hardcodeaba correo: ""
  // siempre, aunque el backend ya calculaba y regresaba las fuentes (nadie
  // del lado de lectura las leia).
  function elegirSiNoEstaRepetido(
    curp: string,
    nombre: string,
    correoPrellenado: string | null,
    yaElegidos: string[],
    setter: (s: Seleccion) => void,
  ) {
    if (yaElegidos.includes(curp)) {
      toast.error("Esa persona ya está elegida en otro lugar de esta inscripción.");
      return;
    }
    setter({ curp, nombre, correo: correoPrellenado ?? "" });
  }

  const confirmarMut = trpc.promocion.confirmarInscripcion.useMutation({
    onSuccess: () => {
      utils.promocion.miElegibilidad.invalidate();
      setConfirmando(false);
      toast.success("Tu inscripción fue registrada");
    },
    onError: (err) => {
      setConfirmando(false);
      toast.error(err.message);
    },
  });

  // Un solo return, header siempre presente desde el primer render -- antes
  // "cargando"/"pausado"/"formulario" eran 3 returns distintos, cada uno con
  // su propio header. El header no existia en el render de "cargando", asi
  // que montaba de cero (con su propio fadeUp) en cuanto los datos
  // llegaban -- ese es el "parpadeo" reportado en produccion. Con el header
  // unico, su fadeUp solo se reproduce UNA vez, al entrar a la pagina --
  // mismo criterio que Inconformidad.tsx.
  const dataLoading = isLoading || !data;
  const bloqueadoPorPausa = !dataLoading && moduloHabilitado === false && !data.yaInscrito;

  const listoParaConfirmar = jefe?.correo && companero1?.correo && companero2?.correo;

  // I4: el modal mostraba un texto generico -- el spec (seccion 4) pide un
  // "resumen de los 3 elegidos + correos" antes de confirmar, para que el
  // trabajador pueda revisar sin tener que recordar lo que ya elegio.
  const resumenSeleccion = jefe && companero1 && companero2
    ? `Jefe inmediato: ${jefe.nombre} (${jefe.correo}). Compañero 1: ${companero1.nombre} (${companero1.correo}). Compañero 2: ${companero2.nombre} (${companero2.correo}). No podrás cambiarla después salvo que el administrador reasigne un lugar por baja.`
    : "";

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={fadeUp}>
        <h1 className="text-2xl font-bold text-gray-900">Inscripción a Promoción</h1>
      </motion.div>

      {dataLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
        </div>
      ) : bloqueadoPorPausa ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-card-rest border border-gray-100">
          <Award className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 font-medium text-gray-700">Esta sección no está disponible por ahora</p>
          <p className="mt-1 text-sm text-gray-500">Vuelve a intentarlo más tarde.</p>
        </div>
      ) : (
      <div className="rounded-2xl bg-white p-8 shadow-card-rest border border-gray-100">
        {"calificacion1" in data && data.calificacion1 !== undefined && data.calificacion2 !== undefined ? (
          <div className={`overflow-hidden rounded-xl border ${data.elegible ? "border-emerald-200" : "border-rose-200"}`}>
            <div className={`flex items-center justify-between gap-3 border-b px-5 py-3 ${data.elegible ? "border-emerald-100 bg-emerald-50/70" : "border-rose-100 bg-rose-50/70"}`}>
              <div className="flex items-center gap-2.5 text-sm font-semibold text-gray-900">
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${data.elegible ? "bg-emerald-100" : "bg-rose-100"}`}>
                  <Award className={`h-3.5 w-3.5 ${data.elegible ? "text-emerald-600" : "text-rose-600"}`} aria-hidden="true" />
                </div>
                Resultado de cursos
              </div>
              <div className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${data.elegible ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                {data.elegible ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                {data.elegible ? "Cumple el requisito" : "No cumple el requisito"}
              </div>
            </div>
            <div className="divide-y divide-gray-100 bg-white px-5">
              <div className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0 truncate text-gray-600">{data.nombreCurso1}</span>
                <span className="shrink-0 tabular-nums font-medium text-gray-900">{data.calificacion1}</span>
              </div>
              <div className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0 truncate text-gray-600">{data.nombreCurso2}</span>
                <span className="shrink-0 tabular-nums font-medium text-gray-900">{data.calificacion2}</span>
              </div>
              <div className="flex items-baseline justify-between gap-3 py-3 text-sm">
                <span className="font-semibold text-gray-900">Promedio</span>
                <span className={`shrink-0 tabular-nums text-xl font-bold ${data.elegible ? "text-emerald-600" : "text-rose-600"}`}>
                  {((data.calificacion1 + data.calificacion2) / 2).toFixed(1)}
                </span>
              </div>
            </div>
            <p className="px-5 pb-3 text-xs text-gray-500">
              {data.elegible
                ? "Superaste el promedio mínimo de 70 para inscribirte a Promoción."
                : "Necesitas un promedio mínimo de 70 para inscribirte a Promoción."}
            </p>
          </div>
        ) : (
          <div className="text-center">
            <Award className="mx-auto h-10 w-10 text-primary-300" />
          </div>
        )}

        {data.yaInscrito ? (
          <p className="mt-4 text-center font-medium text-gray-700">Tu inscripción fue registrada</p>
        ) : data.elegible ? (
          <div className="mt-6 space-y-5">
            <CampoEvaluador etiqueta="Jefe Inmediato" rol="jefe" seleccion={jefe}
              onElegir={(curp, nombre, correoPrellenado) => elegirSiNoEstaRepetido(curp, nombre, correoPrellenado, [companero1?.curp, companero2?.curp].filter((x): x is string => !!x), setJefe)}
              onCorreo={(correo) => setJefe((s) => s && { ...s, correo })}
              onCambiar={() => setJefe(null)} />
            <CampoEvaluador etiqueta="Compañero 1" rol="companero" seleccion={companero1}
              onElegir={(curp, nombre, correoPrellenado) => elegirSiNoEstaRepetido(curp, nombre, correoPrellenado, [jefe?.curp, companero2?.curp].filter((x): x is string => !!x), setCompanero1)}
              onCorreo={(correo) => setCompanero1((s) => s && { ...s, correo })}
              onCambiar={() => setCompanero1(null)} />
            <CampoEvaluador etiqueta="Compañero 2" rol="companero" seleccion={companero2}
              onElegir={(curp, nombre, correoPrellenado) => elegirSiNoEstaRepetido(curp, nombre, correoPrellenado, [jefe?.curp, companero1?.curp].filter((x): x is string => !!x), setCompanero2)}
              onCorreo={(correo) => setCompanero2((s) => s && { ...s, correo })}
              onCambiar={() => setCompanero2(null)} />

            <button
              type="button"
              disabled={!listoParaConfirmar}
              onClick={() => setConfirmando(true)}
              className="w-full rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              Confirmar inscripción
            </button>
          </div>
        ) : "calificacion1" in data && data.calificacion1 !== undefined ? null : (
          <>
            <p className="mt-4 text-center font-medium text-gray-700">Todavía no cumples el requisito</p>
            <p className="mt-1 text-center text-sm text-gray-500">Necesitas completar 2 cursos cuyo promedio sea mínimo 70.</p>
          </>
        )}
      </div>
      )}

      <ConfirmModal
        open={confirmando}
        variant="warning"
        title="¿Confirmas esta selección?"
        message={resumenSeleccion}
        confirmLabel="Sí, confirmar"
        loading={confirmarMut.isPending}
        onCancel={() => setConfirmando(false)}
        onConfirm={() => {
          if (!jefe || !companero1 || !companero2) return;
          confirmarMut.mutate({
            jefe: { curp: jefe.curp, nombre: jefe.nombre, correo: jefe.correo },
            companero1: { curp: companero1.curp, nombre: companero1.nombre, correo: companero1.correo },
            companero2: { curp: companero2.curp, nombre: companero2.nombre, correo: companero2.correo },
          });
        }}
      />
    </motion.div>
  );
}

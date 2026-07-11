import { motion } from "framer-motion";
import { X, Building2 } from "lucide-react";
import { TIPO_PROGRAMA_LABELS, FINALIDAD_POR_TIPO_PROGRAMA, FINALIDADES_PAC } from "@shared/const";

// Todos los cursos son virtuales (decision de negocio). El selector de
// modalidad se oculta y se predetermina a "virtual"; si algun dia se
// necesita presencial/mixto de nuevo, se reactiva el <select> abajo
// (misma logica que se aplico a horario/cupo).
const MODALIDAD_DEFAULT = "virtual";
const TIPOS_PROGRAMA = ["PAC", "SPC", "SDPC"];

export type ModalState =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; id: number };

export interface CursoFormData {
  nombre: string;
  descripcion: string;
  nivelGobierno: string;
  duracionHoras: number;
  modalidad: string;
  tipoPrograma: string;
  bloque: string;
  finalidad: string;
}

export const emptyForm: CursoFormData = {
  nombre: "",
  descripcion: "",
  nivelGobierno: "federal",
  duracionHoras: 20,
  modalidad: MODALIDAD_DEFAULT,
  tipoPrograma: "SDPC",
  bloque: "",
  finalidad: "",
};

function formatFecha(date: string | Date) {
  const d = new Date(date);
  // timeZone: "UTC" -- fechaInicio/fechaFin son fechas de calendario puras
  // (sin hora real), guardadas como medianoche UTC. Sin forzar UTC aqui,
  // el navegador del admin las muestra en su timezone local y puede
  // desfasar un dia (ej. Mexico_City, UTC-6, muestra el dia anterior).
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function formatRangoFechas(fechaInicio: string | Date | null | undefined, fechaFin: string | Date | null | undefined) {
  if (!fechaInicio && !fechaFin) return null;
  if (fechaInicio && fechaFin) return `${formatFecha(fechaInicio)} - ${formatFecha(fechaFin)}`;
  if (fechaInicio) return `Desde ${formatFecha(fechaInicio)}`;
  return `Hasta ${formatFecha(fechaFin!)}`;
}

const tipoProgramaLabel = (t: string) => TIPO_PROGRAMA_LABELS[t] ?? t;

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 outline-none transition-all focus:border-primary-300 focus:ring-2 focus:ring-primary-100";

export default function CursoModal({
  modal,
  onClose,
  activeTab,
  onTabChange,
  form,
  onFormChange,
  onSubmit,
  guardando,
  guardarError,
  cursoDetalle,
  instituciones,
  assignForm,
  onAssignFormChange,
  onAssignSubmit,
  asignando,
  asignarError,
  onDesasignar,
}: {
  modal: ModalState;
  onClose: () => void;
  activeTab: "detalles" | "instituciones";
  onTabChange: (tab: "detalles" | "instituciones") => void;
  form: CursoFormData;
  onFormChange: (form: CursoFormData) => void;
  onSubmit: (e: React.FormEvent) => void;
  guardando: boolean;
  guardarError: string | null;
  cursoDetalle: { instituciones?: any[] } | undefined;
  instituciones: any[] | undefined;
  assignForm: { institucionId: number; cupoMaximo: number; fechaInicio: string; fechaFin: string };
  onAssignFormChange: (form: { institucionId: number; cupoMaximo: number; fechaInicio: string; fechaFin: string }) => void;
  onAssignSubmit: (e: React.FormEvent) => void;
  asignando: boolean;
  asignarError: string | null;
  onDesasignar: (id: number, nombre: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200/60 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-bold text-slate-800">
            {modal.type === "create" ? "Crear Curso" : "Editar Curso"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex border-b border-slate-100 px-5">
          <button
            type="button"
            onClick={() => onTabChange("detalles")}
            className={`border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
              activeTab === "detalles" ? "border-primary-600 text-primary-600" : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            Detalles del curso
          </button>
          <button
            type="button"
            onClick={() => modal.type === "edit" && onTabChange("instituciones")}
            disabled={modal.type !== "edit"}
            title={modal.type !== "edit" ? "Guarda el curso primero para asignar instituciones" : undefined}
            className={`border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              activeTab === "instituciones" ? "border-primary-600 text-primary-600" : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            Instituciones
          </button>
        </div>

        {activeTab === "detalles" && (
        <form onSubmit={onSubmit} className="space-y-4 p-5">
          {guardarError && (
            <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-600">
              {guardarError}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Nombre *</label>
            <input
              type="text"
              required
              value={form.nombre}
              onChange={(e) => onFormChange({ ...form, nombre: e.target.value })}
              className={inputClass}
              placeholder="Nombre del curso"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Descripcion</label>
            <textarea
              value={form.descripcion}
              onChange={(e) => onFormChange({ ...form, descripcion: e.target.value })}
              className={`${inputClass} min-h-20 resize-y`}
              placeholder="Descripcion del curso (opcional)"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Tipo de Programa</label>
              <select
                value={form.tipoPrograma}
                onChange={(e) => onFormChange({ ...form, tipoPrograma: e.target.value })}
                className={inputClass}
              >
                {TIPOS_PROGRAMA.map((t) => (
                  <option key={t} value={t}>{tipoProgramaLabel(t)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Bloque</label>
              <input
                type="number"
                min={1}
                value={form.bloque}
                onChange={(e) => onFormChange({ ...form, bloque: e.target.value })}
                className={inputClass}
                placeholder="Ej. 1"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Duración (horas) *</label>
            <input
              type="number"
              required
              min={1}
              value={form.duracionHoras}
              onChange={(e) => onFormChange({ ...form, duracionHoras: Number(e.target.value) })}
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Finalidad</label>
            {form.tipoPrograma === "PAC" ? (
              <select
                value={FINALIDADES_PAC.includes(form.finalidad as any) ? form.finalidad : FINALIDADES_PAC[0]}
                onChange={(e) => onFormChange({ ...form, finalidad: e.target.value })}
                className={inputClass}
              >
                {FINALIDADES_PAC.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            ) : (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
                {FINALIDAD_POR_TIPO_PROGRAMA[form.tipoPrograma] ?? "Sin finalidad predeterminada"}
              </p>
            )}
          </div>

          <div className="flex gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="flex-1 rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white shadow-sm shadow-primary-600/20 transition-colors hover:bg-primary-700 disabled:opacity-50"
            >
              {guardando
                ? "Guardando..."
                : modal.type === "create"
                ? "Crear"
                : "Actualizar"}
            </button>
          </div>
        </form>
        )}

        {activeTab === "instituciones" && modal.type === "edit" && (
        <div>
          {/* Already assigned */}
          {cursoDetalle?.instituciones && cursoDetalle.instituciones.length > 0 && (
            <div className="border-b border-slate-100 px-5 py-4 space-y-2">
              <p className="text-micro font-semibold uppercase tracking-widest text-slate-400">Asignaciones actuales</p>
              {cursoDetalle.instituciones.map((inst: any) => {
                const ci = inst.cursos_instituciones ?? inst;
                const instData = inst.instituciones ?? inst;
                return (
                  <div key={ci.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <Building2 size={12} className="text-slate-400" />
                    <span className="flex-1 font-medium">{instData.nombre ?? `Institución #${ci.institucionId}`}</span>
                    {formatRangoFechas(ci.fechaInicio, ci.fechaFin) && (
                      <span className="text-slate-400">· {formatRangoFechas(ci.fechaInicio, ci.fechaFin)}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => onDesasignar(ci.id, instData.nombre ?? `Institución #${ci.institucionId}`)}
                      className="ml-1 rounded-md p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-500 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

        <form onSubmit={onAssignSubmit} className="space-y-4 p-5">
          {asignarError && (
            <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-600">
              {asignarError}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Institucion *</label>
            <select
              required
              value={assignForm.institucionId}
              onChange={(e) => onAssignFormChange({ ...assignForm, institucionId: Number(e.target.value) })}
              className={inputClass}
            >
              <option value={0}>Seleccionar institucion...</option>
              {instituciones?.map((inst: any) => (
                <option key={inst.id} value={inst.id}>
                  {inst.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Fecha Inicio</label>
              <input
                type="date"
                value={assignForm.fechaInicio}
                onChange={(e) => onAssignFormChange({ ...assignForm, fechaInicio: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Fecha Fin</label>
              <input
                type="date"
                value={assignForm.fechaFin}
                onChange={(e) => onAssignFormChange({ ...assignForm, fechaFin: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200"
            >
              Cerrar
            </button>
            <button
              type="submit"
              disabled={asignando || !assignForm.institucionId}
              className="flex-1 rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white shadow-sm shadow-primary-600/20 transition-colors hover:bg-primary-700 disabled:opacity-50"
            >
              {asignando ? "Asignando..." : "Asignar"}
            </button>
          </div>
        </form>
        </div>
        )}
      </motion.div>
    </div>
  );
}

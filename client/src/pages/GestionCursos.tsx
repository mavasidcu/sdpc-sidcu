import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import ConfirmModal from "@/components/ConfirmModal";
import { SkeletonCard, SkeletonTable } from "@/components/Skeleton";
import {
  Plus,
  Pencil,
  Trash2,
  LayoutGrid,
  List,
  BookOpen,
  Clock,
  Upload,
} from "lucide-react";
import ImportarCSVModal from "@/components/ImportarCSVModal";
import CursoModal, { emptyForm, type ModalState, type CursoFormData } from "@/components/cursos/CursoModal";
import { TIPO_PROGRAMA_LABELS } from "@shared/const";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

// Cursos son 100% virtuales: no hay limite real de cupo. Se manda un valor
// alto fijo para satisfacer la columna NOT NULL sin exponer el concepto en UI.
const CUPO_SIN_LIMITE = 9999;


export default function GestionCursos() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [modal, setModal] = useState<ModalState>({ type: "closed" });
  const [form, setForm] = useState<CursoFormData>(emptyForm);
  const [showImport, setShowImport] = useState(false);
  const [tipoImportacion, setTipoImportacion] = useState<"PAC" | "SPC" | "SDPC">("SPC");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [confirmDelete, setConfirmDelete] = useState<{ type: "single"; id: number; nombre: string } | { type: "bulk" } | null>(null);
  const [confirmDesasignar, setConfirmDesasignar] = useState<{ id: number; nombre: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"detalles" | "instituciones">("detalles");

  // Assignment form state
  const [assignForm, setAssignForm] = useState({
    institucionId: 0,
    cupoMaximo: CUPO_SIN_LIMITE,
    fechaInicio: "",
    fechaFin: "",
  });

  const { data: cursos, isFetching } = trpc.cursos.listar.useQuery(undefined, {
    placeholderData: (prev) => prev,
    staleTime: 10_000,
  });
  // Ref to keep last known data — prevents grid from unmounting during refetch
  const cursosRef = useRef<typeof cursos>(undefined);
  if (cursos !== undefined) cursosRef.current = cursos;
  const displayCursos = cursosRef.current;

  // Filtro por programa -- puramente de navegación (admin/capturista/consultor
  // siguen viendo todos los cursos vía la query, esto solo acota lo que se
  // muestra en pantalla para no tener que scrollear los 3 programas mezclados).
  const [programaFiltro, setProgramaFiltro] = useState<"TODOS" | "PAC" | "SPC" | "SDPC">("TODOS");
  const cursosFiltrados = programaFiltro === "TODOS"
    ? displayCursos
    : displayCursos?.filter((c: any) => c.tipoPrograma === programaFiltro);

  // Agrupa cursos por bloque -- el bloque es la secuencia curricular real
  // (Bloque 1 antes que Bloque 2), por eso el numero encabeza cada seccion.
  const grupos = (() => {
    if (!cursosFiltrados) return [] as { key: string; label: string; cursos: any[] }[];
    const porBloque = new Map<number | null, any[]>();
    for (const curso of cursosFiltrados) {
      const key = curso.bloque ?? null;
      if (!porBloque.has(key)) porBloque.set(key, []);
      porBloque.get(key)!.push(curso);
    }
    return [...porBloque.entries()]
      .sort(([a], [b]) => {
        if (a === null) return 1;
        if (b === null) return -1;
        return a - b;
      })
      .map(([bloque, cursosDelBloque]) => ({
        key: bloque != null ? `bloque-${bloque}` : "sin-bloque",
        label: bloque != null ? `Bloque ${bloque}` : "Sin bloque",
        cursos: cursosDelBloque,
      }));
  })();

  const [bloqueSeleccionado, setBloqueSeleccionado] = useState<string | null>(null);
  const bloqueActivo = grupos.some((g) => g.key === bloqueSeleccionado)
    ? bloqueSeleccionado
    : grupos[0]?.key ?? null;
  const grupoActivo = grupos.find((g) => g.key === bloqueActivo);
  const cursosDelBloque = grupoActivo?.cursos ?? [];
  const { data: instituciones } = trpc.instituciones.listar.useQuery({ soloActivas: true });

  // Fetch course details when editing
  const { data: cursoDetalle } = trpc.cursos.obtener.useQuery(
    { id: modal.type === "edit" ? modal.id : 0 },
    { enabled: modal.type === "edit" }
  );

  const crearMut = trpc.cursos.crear.useMutation({
    onSuccess: () => {
      utils.cursos.listar.invalidate();
      setModal({ type: "closed" });
    },
  });

  const actualizarMut = trpc.cursos.actualizar.useMutation({
    onSuccess: () => {
      utils.cursos.listar.invalidate();
      utils.cursos.obtener.invalidate();
      setModal({ type: "closed" });
    },
  });

  const toggleActivoMut = trpc.cursos.toggleActivo.useMutation({
    onSuccess: () => {
      utils.cursos.listar.invalidate();
    },
  });

  const eliminarCursoMut = trpc.cursos.eliminar.useMutation({
    onSuccess: () => {
      utils.cursos.listar.invalidate();
    },
  });

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (!displayCursos) return;
    if (selected.size === displayCursos.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(displayCursos.map((c: any) => c.id)));
    }
  };

  const eliminarSeleccionados = async () => {
    for (const id of selected) {
      await eliminarCursoMut.mutateAsync({ id });
    }
    setSelected(new Set());
    setConfirmDelete(null);
  };

  const asignarMut = trpc.cursos.asignarInstitucion.useMutation({
    onSuccess: () => {
      utils.cursos.obtener.invalidate();
      setAssignForm({ institucionId: 0, cupoMaximo: CUPO_SIN_LIMITE, fechaInicio: "", fechaFin: "" });
    },
  });

  const importarCursosMut = trpc.cursos.importar.useMutation();

  const desasignarMut = trpc.cursos.desasignarInstitucion.useMutation({
    onSuccess: () => {
      utils.cursos.obtener.invalidate();
      utils.cursos.listar.invalidate();
    },
    onError: (err) => {
      alert("Error al desasignar: " + err.message);
    },
  });

  const openCreate = () => {
    setForm(emptyForm);
    setActiveTab("detalles");
    setModal({ type: "create" });
  };

  const openEdit = (curso: any) => {
    setForm({
      nombre: curso.nombre,
      descripcion: curso.descripcion ?? "",
      nivelGobierno: curso.nivelGobierno ?? "federal",
      duracionHoras: curso.duracionHoras,
      modalidad: curso.modalidad,
      tipoPrograma: curso.tipoPrograma ?? "SDPC",
      bloque: curso.bloque?.toString() ?? "",
      finalidad: curso.finalidad ?? "",
    });
    setActiveTab("detalles");
    setModal({ type: "edit", id: curso.id });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      nombre: form.nombre,
      descripcion: form.descripcion || undefined,
      nivelGobierno: "federal" as const,
      duracionHoras: Number(form.duracionHoras),
      modalidad: form.modalidad as "presencial" | "virtual" | "mixto",
      tipoPrograma: form.tipoPrograma as "PAC" | "SPC" | "SDPC",
      bloque: form.bloque ? Number(form.bloque) : undefined,
      // El backend resuelve/valida la finalidad final segun tipoPrograma
      // (fija para SPC/SDPC, una de las 4 opciones para PAC) -- aqui solo
      // se manda lo que el usuario eligio/ve en pantalla.
      finalidad: form.finalidad || undefined,
    };
    if (modal.type === "create") {
      await crearMut.mutateAsync(payload as any);
    } else if (modal.type === "edit") {
      await actualizarMut.mutateAsync({ id: modal.id!, ...payload } as any);
    }
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modal.type !== "edit" || !assignForm.institucionId) return;
    await asignarMut.mutateAsync({
      cursoId: modal.id,
      institucionId: assignForm.institucionId,
      cupoMaximo: assignForm.cupoMaximo,
      fechaInicio: assignForm.fechaInicio ? new Date(assignForm.fechaInicio) : undefined,
      fechaFin: assignForm.fechaFin ? new Date(assignForm.fechaFin) : undefined,
    } as any);
  };

  const modalidadLabel = (m: string) => {
    const map: Record<string, string> = { presencial: "Presencial", virtual: "Virtual", mixto: "Mixto" };
    return map[m] ?? m;
  };

  const modalidadColor = (m: string) => {
    const map: Record<string, string> = {
      presencial: "bg-blue-50 text-blue-700",
      virtual: "bg-violet-50 text-violet-700",
      mixto: "bg-amber-50 text-amber-700",
    };
    return map[m] ?? "bg-slate-50 text-slate-600";
  };

  const tipoProgramaLabel = (t: string) => TIPO_PROGRAMA_LABELS[t] ?? t;

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">
      {/* Header */}
      <motion.div variants={fadeUp} className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Gestion de Cursos
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Administra el catalogo de capacitaciones
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
            <button
              onClick={() => setViewMode("grid")}
              className={`rounded-md p-2 transition-colors ${viewMode === "grid" ? "bg-primary-500 text-white" : "text-slate-400 hover:text-slate-600"}`}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`rounded-md p-2 transition-colors ${viewMode === "list" ? "bg-primary-500 text-white" : "text-slate-400 hover:text-slate-600"}`}
            >
              <List size={15} />
            </button>
          </div>
          <button
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            <Upload size={16} />
            Importar CSV
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-primary-600/20 transition-colors hover:bg-primary-700"
          >
            <Plus size={16} />
            Crear Curso
          </button>
        </div>
      </motion.div>

      {/* Filtro por programa -- solo navegación, no restringe qué se puede ver */}
      <motion.div variants={fadeUp} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-0.5 w-fit">
        {(["TODOS", "PAC", "SPC", "SDPC"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setProgramaFiltro(p)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              programaFiltro === p ? "bg-primary-500 text-white" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {p === "TODOS" ? "Todos" : TIPO_PROGRAMA_LABELS[p]}
          </button>
        ))}
      </motion.div>

      {/* Selection bar */}
      {selected.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between rounded-xl border border-primary-200 bg-primary-50 px-4 py-2.5"
        >
          <div className="flex items-center gap-3">
            <button
              onClick={selectAll}
              className="text-caption font-semibold text-primary-600 hover:underline"
            >
              {selected.size === displayCursos?.length ? "Deseleccionar todos" : "Seleccionar todos"}
            </button>
            <span className="text-caption text-primary-500">
              {selected.size} seleccionado{selected.size > 1 ? "s" : ""}
            </span>
          </div>
          <button
            onClick={() => setConfirmDelete({ type: "bulk" })}
            disabled={eliminarCursoMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500 px-3 py-1.5 text-caption font-semibold text-white hover:bg-rose-600 disabled:opacity-50 transition-colors"
          >
            <Trash2 size={13} />
            Eliminar {selected.size}
          </button>
        </motion.div>
      )}

      {/* Block selector */}
      {grupos.length > 1 && (
        <motion.div variants={fadeUp} className="flex flex-wrap gap-2">
          {grupos.map((grupo) => (
            <button
              key={grupo.key}
              onClick={() => setBloqueSeleccionado(grupo.key)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                bloqueActivo === grupo.key
                  ? "bg-primary-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {grupo.label}
              <span className={`ml-1.5 ${bloqueActivo === grupo.key ? "text-white/70" : "text-slate-400"}`}>
                {grupo.cursos.length}
              </span>
            </button>
          ))}
        </motion.div>
      )}

      {/* Course list */}
      {(!displayCursos && isFetching) ? (
        viewMode === "grid" ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <SkeletonTable rows={8} cols={8} />
        )
      ) : !displayCursos?.length ? (
        <motion.div variants={fadeUp} className="flex flex-col items-center py-16 text-center">
          <div className="rounded-2xl bg-slate-50 p-5">
            <BookOpen size={28} className="text-slate-300" />
          </div>
          <p className="mt-4 text-sm font-medium text-slate-400">No hay cursos registrados</p>
        </motion.div>
      ) : (
        viewMode === "grid" ? (
          <motion.div key={bloqueActivo ?? "sin-bloque"} variants={stagger} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cursosDelBloque.map((curso: any) => (
              <motion.div
                key={curso.id}
                variants={fadeUp}
                className="group rounded-2xl border border-slate-200/60 bg-white p-5 shadow-card-rest transition-all hover:shadow-card-hover hover:border-slate-200"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={selected.has(curso.id)}
                      onChange={() => toggleSelect(curso.id)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-500 focus:ring-primary-500/20 cursor-pointer"
                    />
                    <h3 className="text-sm font-bold text-slate-800 leading-snug">
                      {curso.nombre}
                    </h3>
                  </div>
                  <span className={`shrink-0 rounded-lg px-2 py-0.5 text-micro font-bold uppercase tracking-wider ${modalidadColor(curso.modalidad)}`}>
                    {modalidadLabel(curso.modalidad)}
                  </span>
                </div>

                {curso.descripcion && (
                  <p className="mt-2 line-clamp-2 text-xs text-slate-400">
                    {curso.descripcion}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    {curso.duracionHoras}h
                  </span>
                  <span className="rounded-md bg-slate-50 px-1.5 py-0.5 text-micro font-semibold text-slate-500">
                    {tipoProgramaLabel(curso.tipoPrograma)}
                  </span>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <button
                    onClick={() => toggleActivoMut.mutate({ id: curso.id })}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      curso.activo ? "bg-emerald-500" : "bg-slate-200"
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${curso.activo ? "translate-x-5" : "translate-x-0"}`} />
                  </button>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(curso)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-primary-500" title="Editar">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => setConfirmDelete({ type: "single", id: curso.id, nombre: curso.nombre })} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500" title="Eliminar">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200/60 bg-white shadow-card-rest">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={cursosDelBloque.length > 0 && cursosDelBloque.every((c: any) => selected.has(c.id))}
                      onChange={() => {
                        const ids = cursosDelBloque.map((c: any) => c.id);
                        const todosSeleccionados = ids.every((id: number) => selected.has(id));
                        setSelected((prev) => {
                          const next = new Set(prev);
                          for (const id of ids) {
                            if (todosSeleccionados) next.delete(id);
                            else next.add(id);
                          }
                          return next;
                        });
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-primary-500 focus:ring-primary-500/20 cursor-pointer"
                    />
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500">Nombre</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500">Categoría</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500">Modalidad</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500">Duración</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500">Estado</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-slate-500">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cursosDelBloque.map((curso: any) => (
                  <tr key={curso.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(curso.id)}
                        onChange={() => toggleSelect(curso.id)}
                        className="h-4 w-4 rounded border-slate-300 text-primary-500 focus:ring-primary-500/20 cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-800 max-w-62.5 truncate">{curso.nombre}</td>
                    <td className="px-3 py-2.5">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{tipoProgramaLabel(curso.tipoPrograma)}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${modalidadColor(curso.modalidad)}`}>{modalidadLabel(curso.modalidad)}</span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-500">{curso.duracionHoras}h</td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => toggleActivoMut.mutate({ id: curso.id })}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${curso.activo ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"}`}
                      >
                        {curso.activo ? "Activo" : "Inactivo"}
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-0.5">
                        <button onClick={() => openEdit(curso)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-primary-500" title="Editar">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => setConfirmDelete({ type: "single", id: curso.id, nombre: curso.nombre })} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500" title="Eliminar">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}


      {/* Create/Edit Modal */}
      {(modal.type === "create" || modal.type === "edit") && (
        <CursoModal
          modal={modal}
          onClose={() => setModal({ type: "closed" })}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          form={form}
          onFormChange={setForm}
          onSubmit={handleSubmit}
          guardando={crearMut.isPending || actualizarMut.isPending}
          guardarError={(crearMut.error || actualizarMut.error)?.message ?? null}
          cursoDetalle={cursoDetalle}
          instituciones={instituciones}
          assignForm={assignForm}
          onAssignFormChange={setAssignForm}
          onAssignSubmit={handleAssign}
          asignando={asignarMut.isPending}
          asignarError={asignarMut.error?.message ?? null}
          onDesasignar={(id, nombre) => setConfirmDesasignar({ id, nombre })}
        />
      )}
      {/* Import CSV Modal */}
      {showImport && (
        <ImportarCSVModal
          titulo={`Cursos — ${tipoProgramaLabel(tipoImportacion)}`}
          camposHeredables={[
            "bloque",
            "institucionResponsable",
            ...(tipoImportacion === "PAC" ? ["finalidad"] : []),
            "fechaInicio",
            "fechaTermino",
            "horarioTexto",
            "duracionHoras",
            "fechaEvaluacion",
            "horarioEvaluacion",
            "duracionEvaluacion",
          ]}
          columnas={[
            { key: "bloque", label: "Bloque", ejemplo: "1" },
            { key: "numero", label: "No.", ejemplo: "1" },
            { key: "nombre", label: "Nombre del Curso", ejemplo: "Ética en el servicio público" },
            { key: "institucionResponsable", label: "Institución Responsable", ejemplo: "INAP" },
            ...(tipoImportacion === "PAC"
              ? [{ key: "finalidad", label: "Finalidad (Actualizar/Desarrollar/Sensibilizar/Fortalecer)", ejemplo: "Fortalecer" }]
              : []),
            { key: "fechaInicio", label: "Fecha de Inicio", ejemplo: "2026-03-01" },
            { key: "fechaTermino", label: "Fecha de Término", ejemplo: "2026-03-15" },
            { key: "horarioTexto", label: "Horario", ejemplo: "09:00 - 13:00" },
            { key: "duracionHoras", label: "Duración (Horas)", ejemplo: "20" },
            { key: "fechaEvaluacion", label: "Fecha de Evaluación", ejemplo: "2026-03-20" },
            { key: "horarioEvaluacion", label: "Horario de Evaluación", ejemplo: "10:00 - 12:00" },
            { key: "duracionEvaluacion", label: "Duración de Evaluación", ejemplo: "2" },
          ]}
          onImportar={(registros) => importarCursosMut.mutateAsync({ registros, tipoPrograma: tipoImportacion })}
          onClose={() => setShowImport(false)}
          onSuccess={() => utils.cursos.listar.invalidate()}
          extraControls={
            <div className="flex items-center gap-3">
              <label className="text-sm font-semibold text-slate-600">Programa de este archivo:</label>
              <select
                value={tipoImportacion}
                onChange={(e) => setTipoImportacion(e.target.value as "PAC" | "SPC" | "SDPC")}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700"
              >
                <option value="PAC">PAC</option>
                <option value="SPC">SPC</option>
                <option value="SDPC">SDPC</option>
              </select>
            </div>
          }
        />
      )}

      {/* Confirm Delete Modal */}
      <ConfirmModal
        open={!!confirmDelete}
        title={confirmDelete?.type === "bulk" ? `Eliminar ${selected.size} cursos` : "Eliminar curso"}
        message={
          confirmDelete?.type === "bulk"
            ? `¿Eliminar ${selected.size} curso${selected.size > 1 ? "s" : ""} seleccionado${selected.size > 1 ? "s" : ""}? Esta acción no se puede deshacer.`
            : `¿Eliminar "${confirmDelete?.type === "single" ? confirmDelete.nombre : ""}"? Esta acción no se puede deshacer.`
        }
        confirmLabel="Eliminar"
        variant="danger"
        loading={eliminarCursoMut.isPending}
        onConfirm={() => {
          if (confirmDelete?.type === "single") {
            eliminarCursoMut.mutate({ id: confirmDelete.id }, {
              onSuccess: () => setConfirmDelete(null),
            });
          } else {
            eliminarSeleccionados();
          }
        }}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* Confirm Desasignar Modal */}
      <ConfirmModal
        open={!!confirmDesasignar}
        title="Eliminar asignación"
        message={`¿Eliminar asignación de "${confirmDesasignar?.nombre ?? ""}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
        loading={desasignarMut.isPending}
        onConfirm={() => {
          if (!confirmDesasignar) return;
          desasignarMut.mutate({ id: confirmDesasignar.id }, {
            onSuccess: () => setConfirmDesasignar(null),
          });
        }}
        onCancel={() => setConfirmDesasignar(null)}
      />
    </motion.div>
  );
}

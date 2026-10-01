import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Building2,
  MapPin,
  Phone,
  Mail,
  User,
  Upload,
} from "lucide-react";
import ImportarCSVModal from "@/components/ImportarCSVModal";
import ConfirmModal from "@/components/ConfirmModal";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

type ModalState =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; id: number };

interface InstFormData {
  nombre: string;
  direccion: string;
  contacto: string;
  telefono: string;
  email: string;
}

const emptyForm: InstFormData = {
  nombre: "",
  direccion: "",
  contacto: "",
  telefono: "",
  email: "",
};

export default function Instituciones() {
  const utils = trpc.useUtils();
  const [modal, setModal] = useState<ModalState>({ type: "closed" });
  const [form, setForm] = useState<InstFormData>(emptyForm);
  const [showImport, setShowImport] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<{ type: "single"; id: number; nombre: string } | { type: "bulk" } | null>(null);

  const { data: instituciones, isFetching } = trpc.instituciones.listar.useQuery(
    { soloActivas: false },
    { placeholderData: (prev) => prev },
  );

  // Ref to keep last known data — previene que la lista se vea vacia durante refetch
  const institucionesRef = useRef<typeof instituciones>(undefined);
  if (instituciones !== undefined) institucionesRef.current = instituciones;
  const displayInstituciones = institucionesRef.current;

  const crearMut = trpc.instituciones.crear.useMutation({
    onSuccess: () => {
      utils.instituciones.listar.invalidate();
      setModal({ type: "closed" });
    },
  });

  const actualizarMut = trpc.instituciones.actualizar.useMutation({
    onSuccess: () => {
      utils.instituciones.listar.invalidate();
      setModal({ type: "closed" });
    },
  });

  const toggleActivoMut = trpc.instituciones.toggleActivo.useMutation({
    onSuccess: () => {
      utils.instituciones.listar.invalidate();
    },
  });

  const importarMut = trpc.instituciones.importar.useMutation();

  const eliminarMut = trpc.instituciones.eliminar.useMutation({
    onSuccess: () => {
      utils.instituciones.listar.invalidate();
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
    if (!displayInstituciones) return;
    if (selected.size === displayInstituciones.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(displayInstituciones.map((i: any) => i.id)));
    }
  };

  const eliminarSeleccionadas = async () => {
    for (const id of selected) {
      await eliminarMut.mutateAsync({ id });
    }
    setSelected(new Set());
    setConfirmDelete(null);
  };

  const openCreate = () => {
    setForm(emptyForm);
    setModal({ type: "create" });
  };

  const openEdit = (inst: any) => {
    setForm({
      nombre: inst.nombre,
      direccion: inst.direccion ?? "",
      contacto: inst.contacto ?? "",
      telefono: inst.telefono ?? "",
      email: inst.email ?? "",
    });
    setModal({ type: "edit", id: inst.id });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      nombre: form.nombre,
      direccion: form.direccion || undefined,
      contacto: form.contacto || undefined,
      telefono: form.telefono || undefined,
      email: form.email || undefined,
    };
    if (modal.type === "create") {
      await crearMut.mutateAsync(payload as any);
    } else if (modal.type === "edit") {
      await actualizarMut.mutateAsync({ id: modal.id, ...payload } as any);
    }
  };

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 outline-none transition-all focus:border-primary-300 focus:ring-2 focus:ring-primary-100";

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">
      {/* Header */}
      <motion.div variants={fadeUp} className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Instituciones
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Gestiona las instituciones de capacitacion
          </p>
        </div>
        <div className="flex gap-2">
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
            Crear Institución
          </button>
        </div>
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
              {selected.size === displayInstituciones?.length ? "Deseleccionar todos" : "Seleccionar todos"}
            </button>
            <span className="text-caption text-primary-500">
              {selected.size} seleccionado{selected.size > 1 ? "s" : ""}
            </span>
          </div>
          <button
            onClick={() => setConfirmDelete({ type: "bulk" })}
            disabled={eliminarMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500 px-3 py-1.5 text-caption font-semibold text-white hover:bg-rose-600 disabled:opacity-50 transition-colors"
          >
            <Trash2 size={13} />
            Eliminar {selected.size}
          </button>
        </motion.div>
      )}

      {/* Institution list */}
      {!displayInstituciones && isFetching ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-slate-200 border-t-primary-500" />
        </div>
      ) : !displayInstituciones?.length ? (
        <motion.div variants={fadeUp} className="flex flex-col items-center py-16 text-center">
          <div className="rounded-2xl bg-slate-50 p-5">
            <Building2 size={28} className="text-slate-300" />
          </div>
          <p className="mt-4 text-sm font-medium text-slate-400">No hay instituciones registradas</p>
        </motion.div>
      ) : (
        <motion.div variants={stagger} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayInstituciones.map((inst: any) => (
            <motion.div
              key={inst.id}
              variants={fadeUp}
              className="group rounded-2xl border border-slate-200/60 bg-white p-5 shadow-card-rest transition-all hover:shadow-card-hover hover:border-slate-200"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(inst.id)}
                    onChange={() => toggleSelect(inst.id)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-500 focus:ring-primary-500/20 cursor-pointer"
                  />
                  <h3 className="text-sm font-bold text-slate-800 leading-snug">
                    {inst.nombre}
                  </h3>
                </div>
                <div className="flex shrink-0 gap-0.5 opacity-0 transition-all group-hover:opacity-100">
                  <button
                    onClick={() => openEdit(inst)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-primary-500"
                    title="Editar"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setConfirmDelete({ type: "single", id: inst.id, nombre: inst.nombre })}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                    title="Eliminar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="mt-3 space-y-1.5">
                {inst.direccion && (
                  <p className="flex items-start gap-2 text-xs text-slate-400">
                    <MapPin size={12} className="mt-0.5 shrink-0" />
                    <span className="line-clamp-2">{inst.direccion}</span>
                  </p>
                )}
                {inst.contacto && (
                  <p className="flex items-center gap-2 text-xs text-slate-400">
                    <User size={12} className="shrink-0" />
                    {inst.contacto}
                  </p>
                )}
                {inst.telefono && (
                  <p className="flex items-center gap-2 text-xs text-slate-400">
                    <Phone size={12} className="shrink-0" />
                    {inst.telefono}
                  </p>
                )}
                {inst.email && (
                  <p className="flex items-center gap-2 text-xs text-slate-400">
                    <Mail size={12} className="shrink-0" />
                    {inst.email}
                  </p>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <button
                  onClick={() => toggleActivoMut.mutate({ id: inst.id })}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    inst.activo ? "bg-emerald-500" : "bg-slate-200"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                      inst.activo ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${inst.activo ? "text-emerald-500" : "text-slate-400"}`}>
                  {inst.activo ? "Activa" : "Inactiva"}
                </span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Create/Edit Modal */}
      {modal.type !== "closed" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200/60 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-bold text-slate-800">
                {modal.type === "create" ? "Crear Institucion" : "Editar Institucion"}
              </h2>
              <button
                onClick={() => setModal({ type: "closed" })}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 p-5">
              {(crearMut.error || actualizarMut.error) && (
                <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-600">
                  {(crearMut.error || actualizarMut.error)?.message}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Nombre *</label>
                <input
                  type="text"
                  required
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  className={inputClass}
                  placeholder="Nombre de la institucion"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Direccion</label>
                <textarea
                  value={form.direccion}
                  onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                  className={`${inputClass} min-h-[70px] resize-y`}
                  placeholder="Direccion completa"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Contacto</label>
                <input
                  type="text"
                  value={form.contacto}
                  onChange={(e) => setForm({ ...form, contacto: e.target.value })}
                  className={inputClass}
                  placeholder="Persona de contacto"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Telefono</label>
                  <input
                    type="tel"
                    value={form.telefono}
                    onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                    className={inputClass}
                    placeholder="(000) 000-0000"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className={inputClass}
                    placeholder="correo@ejemplo.com"
                  />
                </div>
              </div>

              <div className="flex gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setModal({ type: "closed" })}
                  className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={crearMut.isPending || actualizarMut.isPending}
                  className="flex-1 rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white shadow-sm shadow-primary-600/20 transition-colors hover:bg-primary-700 disabled:opacity-50"
                >
                  {crearMut.isPending || actualizarMut.isPending
                    ? "Guardando..."
                    : modal.type === "create"
                    ? "Crear"
                    : "Actualizar"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
      {/* Import CSV Modal */}
      {showImport && (
        <ImportarCSVModal
          titulo="Instituciones"
          columnas={[
            { key: "nombre", label: "Nombre", ejemplo: "Universidad Autónoma" },
            { key: "direccion", label: "Dirección", ejemplo: "Av. Principal #123" },
            { key: "contacto", label: "Contacto", ejemplo: "Juan Pérez" },
            { key: "telefono", label: "Teléfono", ejemplo: "6141234567" },
            { key: "email", label: "Email", ejemplo: "contacto@universidad.edu.mx" },
          ]}
          onImportar={(registros) => importarMut.mutateAsync({ registros })}
          onClose={() => setShowImport(false)}
          onSuccess={() => utils.instituciones.listar.invalidate()}
        />
      )}

      <ConfirmModal
        open={!!confirmDelete}
        title={confirmDelete?.type === "bulk" ? `Eliminar ${selected.size} instituciones` : "Eliminar institución"}
        message={
          confirmDelete?.type === "bulk"
            ? `¿Eliminar ${selected.size} institución${selected.size > 1 ? "es" : ""} seleccionada${selected.size > 1 ? "s" : ""}? Esta acción no se puede deshacer.`
            : `¿Eliminar "${confirmDelete?.type === "single" ? confirmDelete.nombre : ""}"? Esta acción no se puede deshacer.`
        }
        confirmLabel="Eliminar"
        variant="danger"
        loading={eliminarMut.isPending}
        onConfirm={() => {
          if (confirmDelete?.type === "single") {
            eliminarMut.mutate({ id: confirmDelete.id }, {
              onSuccess: () => setConfirmDelete(null),
            });
          } else {
            eliminarSeleccionadas();
          }
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </motion.div>
  );
}

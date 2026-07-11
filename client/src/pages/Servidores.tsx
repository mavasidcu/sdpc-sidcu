import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import { ServidorForm, type ServidorFormData } from "@/components/ServidorForm";
import ConfirmModal from "@/components/ConfirmModal";
import { capitalizarNombre } from "@shared/utils";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  Download,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import { exportarExcel, exportarPDF } from "@/lib/exportar";

type ModalState =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; id: number; data: Partial<ServidorFormData> };

const NIVELES = ["", "federal", "estatal", "municipal", "otro"];
const ESTATUS = ["", "activo", "inactivo"];
const GRUPOS = ["", "ADMO", "TECN", "SERV", "COMUN", "PROFE", "EDU"];

export default function Servidores() {
  const { user } = useAuth();
  const role = user?.role ?? "user";
  const utils = trpc.useUtils();

  const [search, setSearch] = useState("");
  const [dependencia, setDependencia] = useState("");
  const [estatus, setEstatus] = useState("");
  const [grupoFuncion, setGrupoFuncion] = useState("");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<ModalState>({ type: "closed" });
  const [confirmDelete, setConfirmDelete] = useState<{ type: "single"; id: number; nombre: string } | { type: "bulk" } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [allDbSelected, setAllDbSelected] = useState(false);

  const { data: upas } = trpc.servidores.listarUpas.useQuery();
  const { data: uas } = trpc.servidores.listarUas.useQuery();

  const { data, isLoading } = trpc.servidores.listar.useQuery({
    search: search || undefined,
    dependencia: dependencia || undefined,
    nivel: "federal",
    estatus: estatus || undefined,
    grupoFuncion: grupoFuncion || undefined,
    page,
    limit: 20,
  });

  const crearMut = trpc.servidores.crear.useMutation({
    onSuccess: () => {
      utils.servidores.listar.invalidate();
      setModal({ type: "closed" });
    },
  });

  const actualizarMut = trpc.servidores.actualizar.useMutation({
    onSuccess: () => {
      utils.servidores.listar.invalidate();
      setModal({ type: "closed" });
    },
  });

  const eliminarMut = trpc.servidores.eliminar.useMutation({
    onSuccess: () => {
      utils.servidores.listar.invalidate();
    },
  });

  const eliminarBulkMut = trpc.servidores.eliminarBulk.useMutation({
    onSuccess: () => {
      utils.servidores.listar.invalidate();
      setSelected(new Set());
      setAllDbSelected(false);
      setConfirmDelete(null);
    },
  });

  const canCreate = role === "admin" || role === "capturista";
  const canEdit = role === "admin";
  const canDelete = role === "admin";
  const canExport = role === "admin" || role === "consultor";

  const [exportando, setExportando] = useState<"excel" | "pdf" | null>(null);

  const handleExport = async (tipo: "excel" | "pdf") => {
    setExportando(tipo);
    try {
      const { items, total, truncado } = await utils.servidores.exportarTodos.fetch({
        search: search || undefined,
        dependencia: dependencia || undefined,
        nivel: "federal",
        estatus: estatus || undefined,
        grupoFuncion: grupoFuncion || undefined,
      });
      if (truncado) {
        alert(
          `Hay ${total} servidores que cumplen el filtro, pero solo se exportarán los primeros ${items.length}. Reduce el filtro para exportar el resto.`,
        );
      }
      if (items.length > 0) {
        if (tipo === "excel") {
          exportarExcel(items as any);
        } else {
          exportarPDF(items as any);
        }
      } else {
        alert("No hay datos para exportar");
      }
    } catch (err: any) {
      alert("Error al exportar: " + (err.message ?? "desconocido"));
    } finally {
      setExportando(null);
    }
  };

  const handleCreate = async (formData: ServidorFormData) => {
    await crearMut.mutateAsync({
      ...formData,
      fechaIngreso: new Date(formData.fechaIngreso),
      datosContacto: formData.datosContacto || null,
      observaciones: formData.observaciones || null,
    });
  };

  const handleEdit = async (formData: ServidorFormData) => {
    if (modal.type !== "edit") return;
    await actualizarMut.mutateAsync({
      id: modal.id,
      ...formData,
      fechaIngreso: new Date(formData.fechaIngreso),
      datosContacto: formData.datosContacto || null,
      observaciones: formData.observaciones || null,
    });
  };

  const handleDelete = async (id: number) => {
    await eliminarMut.mutateAsync({ id });
    setConfirmDelete(null);
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [seleccionandoTodos, setSeleccionandoTodos] = useState(false);

  const selectAll = async () => {
    if (!data?.items?.length) return;
    // Si "todos en BD" o ya todos seleccionados → deseleccionar todo
    if (allDbSelected || (selected.size > 0 && selected.size >= (data.total ?? data.items.length))) {
      setSelected(new Set());
      setAllDbSelected(false);
      return;
    }
    // Página completa y hay más en BD → cargar todos los IDs
    if (selected.size === data.items.length && data.total && data.total > data.items.length) {
      setSeleccionandoTodos(true);
      const ids = await utils.servidores.listarTodosIds.fetch({ search: search || undefined });
      setSelected(new Set(ids));
      setAllDbSelected(true);
      setSeleccionandoTodos(false);
      return;
    }
    // Toggle página actual
    if (selected.size === data.items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.items.map((s: any) => s.id)));
    }
    setAllDbSelected(false);
  };

  const eliminarSeleccionados = async () => {
    await eliminarBulkMut.mutateAsync({ ids: Array.from(selected) });
  };

  const openEdit = (srv: any) => {
    setModal({
      type: "edit",
      id: srv.id,
      data: {
        nombreCompleto: srv.nombreCompleto,
        rfc: srv.rfc,
        curp: srv.curp,
        cargo: srv.cargo,
        dependencia: srv.dependencia,
        nivel: srv.nivel,
        fechaIngreso: srv.fechaIngreso
          ? new Date(srv.fechaIngreso).toISOString().split("T")[0]
          : "",
        datosContacto: srv.datosContacto ?? "",
        grupoFuncion: srv.grupoFuncion,
        programa: srv.programa,
        upa: srv.upa ?? "",
        cmao: srv.cmao ?? "",
        email: srv.email ?? "",
        ua: srv.ua ?? "",
        nivelProgresion: String(srv.nivelProgresion ?? 0),
        estatus: srv.estatus,
        observaciones: srv.observaciones ?? "",
      },
    });
  };

  const inputClass =
    "rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20";

  return (
    <div className="min-w-0 w-full">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Servidores Públicos
        </h1>
        <div className="flex gap-2">
          {canExport && (
            <>
              <button
                onClick={() => handleExport("excel")}
                disabled={exportando !== null}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
              >
                <FileSpreadsheet size={16} />
                {exportando === "excel" ? "Exportando..." : "Excel"}
              </button>
              <button
                onClick={() => handleExport("pdf")}
                disabled={exportando !== null}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
              >
                <FileText size={16} />
                {exportando === "pdf" ? "Exportando..." : "PDF"}
              </button>
            </>
          )}
          {canCreate && (
            <button
              onClick={() => setModal({ type: "create" })}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              <Plus size={16} />
              Nuevo Servidor
            </button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg bg-white p-4 shadow-card-rest sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className={`${inputClass} pl-9 w-full`}
          />
        </div>
        <input
          type="text"
          placeholder="Dependencia"
          value={dependencia}
          onChange={(e) => {
            setDependencia(e.target.value);
            setPage(1);
          }}
          className={`${inputClass} w-full`}
        />
        <select
          value={estatus}
          onChange={(e) => {
            setEstatus(e.target.value);
            setPage(1);
          }}
          className={`${inputClass} w-full`}
        >
          <option value="">Todos los estatus</option>
          {ESTATUS.filter(Boolean).map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        <select
          value={grupoFuncion}
          onChange={(e) => {
            setGrupoFuncion(e.target.value);
            setPage(1);
          }}
          className={`${inputClass} w-full`}
        >
          <option value="">Todos los grupos</option>
          {GRUPOS.filter(Boolean).map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>

      {/* Selection bar */}
      {selected.size > 0 && canDelete && (
        <div className="flex items-center justify-between rounded-xl border border-primary-200 bg-primary-50 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <button onClick={selectAll} disabled={seleccionandoTodos} className="text-xs font-semibold text-primary-600 hover:underline disabled:opacity-50">
              {seleccionandoTodos
                ? "Cargando..."
                : allDbSelected || selected.size >= (data?.total ?? 0)
                ? "Deseleccionar todos"
                : selected.size === data?.items?.length && data?.total && data.total > data.items.length
                ? `Seleccionar los ${data.total} en BD`
                : "Deseleccionar todos"}
            </button>
            <span className="text-xs text-primary-500">{selected.size} seleccionado{selected.size > 1 ? "s" : ""}{(allDbSelected || (data?.total && selected.size >= data.total)) ? " (todos)" : ""}</span>
          </div>
          <button
            onClick={() => setConfirmDelete({ type: "bulk" })}
            disabled={eliminarBulkMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-600 disabled:opacity-50 transition-colors"
          >
            Eliminar {selected.size}
          </button>
        </div>
      )}

      {/* Tabla */}
      <div className="overflow-x-auto rounded-lg bg-white shadow-card-rest">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              {canDelete && (
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={(data?.items?.length ?? 0) > 0 && (data?.items?.every((s: any) => selected.has(s.id)) ?? false)}
                    onChange={selectAll}
                    className="h-4 w-4 rounded border-slate-300 text-primary-500 focus:ring-primary-500/20 cursor-pointer"
                  />
                </th>
              )}
              <th className="px-4 py-3">Nombre</th>
              <th className="hidden px-4 py-3 lg:table-cell">RFC</th>
              <th className="hidden px-4 py-3 xl:table-cell">CURP</th>
              <th className="hidden px-4 py-3 xl:table-cell">Cargo</th>
              <th className="hidden px-4 py-3 xl:table-cell">Dependencia</th>
              <th className="px-4 py-3">Estatus</th>
              {(canEdit || canDelete) && (
                <th className="px-4 py-3">Acciones</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  Cargando...
                </td>
              </tr>
            ) : !data?.items.length ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  No se encontraron servidores públicos.
                </td>
              </tr>
            ) : (
              data.items.map((srv) => (
                <tr key={srv.id} className="hover:bg-gray-50">
                  {canDelete && (
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(srv.id)}
                        onChange={() => toggleSelect(srv.id)}
                        className="h-4 w-4 rounded border-slate-300 text-primary-500 focus:ring-primary-500/20 cursor-pointer"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <div className="flex items-center gap-2">
                      {srv.nombreCompleto}
                      {srv.registroCompletado ? (
                        <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-500">Registrado</span>
                      ) : (
                        <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-500">Pendiente</span>
                      )}
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 font-mono text-xs lg:table-cell">
                    {srv.rfc}
                  </td>
                  <td className="hidden px-4 py-3 font-mono text-xs xl:table-cell">
                    {srv.curp}
                  </td>
                  <td className="hidden px-4 py-3 xl:table-cell">
                    {capitalizarNombre(srv.cargo)}
                  </td>
                  <td className="hidden px-4 py-3 xl:table-cell max-w-55">
                    <span className="block truncate" title={capitalizarNombre(srv.dependencia)}>
                      {capitalizarNombre(srv.dependencia)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        srv.estatus === "activo"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {srv.estatus}
                    </span>
                  </td>
                  {(canEdit || canDelete) && (
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {canEdit && (
                          <button
                            onClick={() => openEdit(srv)}
                            className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-primary-600"
                            title="Editar"
                          >
                            <Pencil size={15} />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() =>
                              setConfirmDelete({ type: "single", id: srv.id, nombre: srv.nombreCompleto })
                            }
                            className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                            title="Eliminar"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Paginación */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-gray-600">
            <span>
              Mostrando página {data.page} de {data.totalPages} ({data.total}{" "}
              resultados)
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded p-1.5 hover:bg-gray-100 disabled:opacity-30"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page >= data.totalPages}
                className="rounded p-1.5 hover:bg-gray-100 disabled:opacity-30"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal.type !== "closed" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {modal.type === "create"
                  ? "Nuevo Servidor Público"
                  : "Editar Servidor Público"}
              </h2>
              <button
                onClick={() => setModal({ type: "closed" })}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            {crearMut.error && (
              <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                {crearMut.error.message}
              </div>
            )}
            {actualizarMut.error && (
              <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                {actualizarMut.error.message}
              </div>
            )}

            <ServidorForm
              initialData={modal.type === "edit" ? modal.data : undefined}
              onSubmit={modal.type === "create" ? handleCreate : handleEdit}
              onCancel={() => setModal({ type: "closed" })}
              loading={crearMut.isPending || actualizarMut.isPending}
              submitLabel={modal.type === "create" ? "Crear" : "Actualizar"}
              upas={upas ?? []}
              uas={uas ?? []}
            />
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirmDelete}
        title={confirmDelete?.type === "bulk" ? `Eliminar ${selected.size} servidores` : "Eliminar servidor"}
        message={
          confirmDelete?.type === "bulk"
            ? `¿Eliminar ${selected.size} servidor${selected.size > 1 ? "es" : ""} seleccionado${selected.size > 1 ? "s" : ""}? Esta acción no se puede deshacer.`
            : `¿Eliminar a "${confirmDelete?.type === "single" ? confirmDelete.nombre : ""}"? Esta acción no se puede deshacer.`
        }
        confirmLabel="Eliminar"
        variant="danger"
        loading={eliminarMut.isPending}
        onConfirm={() => {
          if (confirmDelete?.type === "single") {
            handleDelete(confirmDelete.id);
          } else {
            eliminarSeleccionados();
          }
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

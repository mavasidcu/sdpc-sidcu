import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { stagger, fadeUp } from "@/lib/animations";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Search, ChevronRight, RefreshCw, Briefcase, Users, AlertCircle, ArrowLeftRight, Trash2, X, FileSpreadsheet, FileText } from "lucide-react";
import ImportarCSVModal from "@/components/ImportarCSVModal";
import BuscadorEvaluador from "@/components/BuscadorEvaluador";
import ConfirmModal from "@/components/ConfirmModal";
import { exportarInscripcionesPromocionExcel, exportarInscripcionesPromocionPDF } from "@/lib/exportar";
import { Skeleton } from "@/components/Skeleton";

type RolPool = "jefe" | "companero";

type Rol = "jefe" | "companero1" | "companero2";

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase();
}

// Encabezados sin acentos/mayúsculas para matchear el roster real del
// cliente (CURP, NOMBRE, RFC, UP, No, TIPO DE EVAL) sin exigirle editar el
// archivo -- procesarFilas de ImportarCSVModal corre esto antes del preview.
function normalizarHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function mapearFilasEvaluadorPool(registros: Record<string, string>[]): Record<string, string>[] {
  return registros.map((row) => {
    const headers = Object.keys(row);
    const buscar = (target: string) => headers.find((h) => normalizarHeader(h) === target);
    const hCurp = buscar("CURP");
    const hNombre = buscar("NOMBRE");
    const hRfc = buscar("RFC");
    const hCorreo = buscar("CORREO") ?? buscar("EMAIL");
    return {
      curp: hCurp ? row[hCurp] : "",
      nombre: hNombre ? row[hNombre] : "",
      rfc: hRfc ? row[hRfc] : "",
      correo: hCorreo ? row[hCorreo] : "",
    };
  });
}

export default function GestionPromocion() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expandido, setExpandido] = useState<number | null>(null);
  const [modalImport, setModalImport] = useState<RolPool | null>(null);
  // M4: trabajadorUserId es a quien hay que EXCLUIR del pool al buscar
  // reemplazo (la propia persona de esta inscripcion), no al admin que esta
  // haciendo la reasignacion -- antes BuscadorEvaluador excluia
  // implicitamente a ctx.user.id (el admin) porque buscarEnPool no recibia
  // ningun override.
  const [reasignando, setReasignando] = useState<{ promocionId: number; rol: Rol; trabajadorUserId: number; nuevoCurp: string; nuevoNombre: string; correo?: string } | null>(null);

  // Catalogo de evaluadores: ver y corregir lo que ya se subio por CSV a
  // cada pool (antes no habia ninguna pantalla para esto, solo se podia
  // re-subir el CSV completo o buscar indirectamente dentro de "Reasignar").
  const [catalogoAbierto, setCatalogoAbierto] = useState(false);
  const [tabPool, setTabPool] = useState<RolPool>("jefe");
  const [searchPool, setSearchPool] = useState("");
  const [pagePool, setPagePool] = useState(1);
  const [quitando, setQuitando] = useState<{ curp: string; rol: RolPool; nombre: string } | null>(null);
  const [exportando, setExportando] = useState<"excel" | "pdf" | null>(null);

  const { data, isLoading } = trpc.promocion.listarInscripciones.useQuery(
    { search: search || undefined, page, limit: 20 },
    { placeholderData: (prev) => prev },
  );
  const { data: correosFallidos } = trpc.promocion.listarCorreosFallidos.useQuery();
  const { data: pool, isLoading: poolCargando } = trpc.promocion.listarPool.useQuery(
    { rol: tabPool, search: searchPool || undefined, page: pagePool, limit: 20 },
    { enabled: catalogoAbierto },
  );

  const importarEvaluadoresMut = trpc.promocion.importarEvaluadores.useMutation();
  const moverRolMut = trpc.promocion.moverRolPool.useMutation({
    onSuccess: () => {
      utils.promocion.listarPool.invalidate();
      toast.success("Movido al otro pool");
    },
    onError: (err) => toast.error(err.message),
  });
  const quitarDelPoolMut = trpc.promocion.quitarDelPool.useMutation({
    onSuccess: () => {
      utils.promocion.listarPool.invalidate();
      setQuitando(null);
      toast.success("Quitado del pool");
    },
    onError: (err) => {
      setQuitando(null);
      toast.error(err.message);
    },
  });
  const reintentarMut = trpc.promocion.reintentarCorreo.useMutation({
    onSuccess: () => {
      utils.promocion.listarCorreosFallidos.invalidate();
      toast.success("Correo regresado a la cola de envío");
    },
    onError: (err) => toast.error(err.message),
  });
  const reasignarMut = trpc.promocion.reasignarEvaluador.useMutation({
    onSuccess: () => {
      utils.promocion.listarInscripciones.invalidate();
      setReasignando(null);
      toast.success("Evaluador reasignado");
    },
    onError: (err) => {
      setReasignando(null);
      toast.error(err.message);
    },
  });

  useEffect(() => {
    if (!reasignando) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setReasignando(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [reasignando]);

  const inputClass = "rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20";

  // Export sin paginar en la UI -- listarInscripciones tiene `limit` topado
  // en 100 via Zod (adminProcedure), mismo patron que
  // PromocionResultados.tsx: se recorren paginas de 100 en 100 hasta cubrir
  // totalPages en vez de pedir un limit alto de un solo golpe.
  const handleExport = async (tipo: "excel" | "pdf") => {
    setExportando(tipo);
    try {
      const limitePorPagina = 100;
      const primera = await utils.promocion.listarInscripciones.fetch({ search: search || undefined, page: 1, limit: limitePorPagina });
      let todos = primera.items;
      for (let p = 2; p <= primera.totalPages; p++) {
        const siguiente = await utils.promocion.listarInscripciones.fetch({ search: search || undefined, page: p, limit: limitePorPagina });
        todos = todos.concat(siguiente.items);
      }
      const datos = todos.map((item) => ({
        trabajadorNombre: item.trabajadorNombre,
        trabajadorCurp: item.trabajadorCurp,
        jefeNombre: item.jefeNombre,
        jefePuntaje: item.jefePuntaje,
        companero1Nombre: item.companero1Nombre,
        companero1Puntaje: item.companero1Puntaje,
        companero2Nombre: item.companero2Nombre,
        companero2Puntaje: item.companero2Puntaje,
        enviadoAt: item.enviadoAt,
      }));
      if (tipo === "excel") exportarInscripcionesPromocionExcel(datos);
      else exportarInscripcionesPromocionPDF(datos);
    } catch (err: any) {
      toast.error("No se pudo exportar", { description: err.message ?? "Intenta de nuevo." });
    } finally {
      setExportando(null);
    }
  };

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inscripciones a Promoción</h1>
          <p className="mt-0.5 text-sm text-gray-500">Catálogos y evaluadores asignados.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleExport("excel")}
            disabled={exportando !== null || !data || data.total === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
          >
            <FileSpreadsheet size={16} />
            {exportando === "excel" ? "Exportando..." : "Excel"}
          </button>
          <button
            onClick={() => handleExport("pdf")}
            disabled={exportando !== null || !data || data.total === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
          >
            <FileText size={16} />
            {exportando === "pdf" ? "Exportando..." : "PDF"}
          </button>
          <button
            onClick={() => setCatalogoAbierto((v) => !v)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${catalogoAbierto ? "border-primary-300 bg-primary-50 text-primary-700" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}
          >
            Catálogo de evaluadores
          </button>
          <button onClick={() => setModalImport("jefe")} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Importar Jefes
          </button>
          <button onClick={() => setModalImport("companero")} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Importar Compañeros
          </button>
        </div>
      </motion.div>

      <AnimatePresence>
        {catalogoAbierto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setCatalogoAbierto(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div className="flex items-center gap-2">
                  <Users size={18} className="text-primary-500" />
                  <h2 className="text-base font-bold text-slate-800">Catálogo de evaluadores</h2>
                </div>
                <button onClick={() => setCatalogoAbierto(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors">
                  <X size={16} />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 p-4">
                <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
                  {(["jefe", "companero"] as const).map((rol) => (
                    <button
                      key={rol}
                      onClick={() => { setTabPool(rol); setPagePool(1); }}
                      className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${tabPool === rol ? "bg-white text-primary-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                    >
                      {rol === "jefe" ? "Jefes" : "Compañeros"}
                    </button>
                  ))}
                </div>
                <div className="relative min-w-0 flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar por nombre o CURP..."
                    value={searchPool}
                    onChange={(e) => { setSearchPool(e.target.value); setPagePool(1); }}
                    className={`${inputClass} pl-8 w-full`}
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {poolCargando ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-400">Cargando...</div>
                ) : pool?.items.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-400">
                    {searchPool ? "Sin resultados" : `Sin nadie en el pool de ${tabPool === "jefe" ? "Jefes" : "Compañeros"} todavía`}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {pool?.items.map((p) => (
                      <div key={p.curp} className="flex items-center justify-between gap-3 px-5 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-gray-800">{p.nombre}</p>
                          <p className="text-[11.5px] text-gray-400 tabular-nums">{p.curp}</p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button
                            onClick={() => moverRolMut.mutate({ curp: p.curp, rolActual: tabPool, rolNuevo: tabPool === "jefe" ? "companero" : "jefe" })}
                            disabled={moverRolMut.isPending}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[11.5px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                          >
                            <ArrowLeftRight size={12} />
                            Mover a {tabPool === "jefe" ? "Compañeros" : "Jefes"}
                          </button>
                          <button
                            onClick={() => setQuitando({ curp: p.curp, rol: tabPool, nombre: p.nombre })}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1 text-[11.5px] font-semibold text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 size={12} />
                            Quitar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {pool && pool.totalPages > 1 && (
                <div className="flex items-center justify-between border-t px-5 py-3 text-sm text-gray-600">
                  <span>Página {pool.page} de {pool.totalPages} ({pool.total} en el pool)</span>
                  <div className="flex gap-1">
                    <button onClick={() => setPagePool((p) => Math.max(1, p - 1))} disabled={pagePool <= 1} className="rounded p-1.5 hover:bg-gray-100 disabled:opacity-30">
                      <ChevronRight size={16} className="rotate-180" />
                    </button>
                    <button onClick={() => setPagePool((p) => Math.min(pool.totalPages, p + 1))} disabled={pagePool >= pool.totalPages} className="rounded p-1.5 hover:bg-gray-100 disabled:opacity-30">
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {correosFallidos && correosFallidos.length > 0 && (
        <motion.div variants={fadeUp} className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-semibold text-rose-700">{correosFallidos.length} correo(s) sin poder enviarse</p>
          {correosFallidos.map((c) => (
            <div key={c.id} className="mt-2 flex items-center justify-between text-sm">
              <span className="text-rose-600">{c.destinatarioNombre} ({c.rol}) — {c.ultimoError}</span>
              <button
                onClick={() => reintentarMut.mutate({ id: c.id })}
                disabled={reintentarMut.isPending}
                className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                Reintentar
              </button>
            </div>
          ))}
        </motion.div>
      )}

      {/* Panorama antes del detalle -- para no tener que escanear miles de
          filas para saber si algo necesita atencion */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card-rest">
          <p className="text-[22px] font-extrabold leading-none text-gray-900 tabular-nums">{data?.total ?? "—"}</p>
          <p className="mt-1 text-xs text-gray-500">Inscripciones totales</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card-rest">
          <p className="text-[22px] font-extrabold leading-none text-gray-900 tabular-nums">
            {data ? data.total - data.conReferenciaRota : "—"}
          </p>
          <p className="mt-1 text-xs text-gray-500">Con los 3 evaluadores completos</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card-rest">
          <p className={`text-[22px] font-extrabold leading-none tabular-nums ${data && data.conReferenciaRota > 0 ? "text-amber-700" : "text-gray-900"}`}>
            {data?.conReferenciaRota ?? "—"}
          </p>
          <p className="mt-1 text-xs text-gray-500">Con una referencia por revisar</p>
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar trabajador por nombre o CURP..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className={`${inputClass} pl-9 w-full`}
          />
        </div>
        <span className="text-xs text-gray-400">Clic en una fila para ver a los 3 evaluadores</span>
      </motion.div>

      <motion.div variants={fadeUp} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card-rest">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[34px_1.7fr_1fr_88px_18px] items-center gap-3.5 border-t border-gray-100 px-4.5 py-2.5 first:border-t-0">
              <Skeleton className="h-8 w-8 rounded-[9px]" />
              <div className="min-w-0 space-y-1.5">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-2.5 w-24" />
              </div>
              <Skeleton className="h-2.5 w-28" />
              <Skeleton className="h-2.5 w-16 justify-self-end" />
              <span />
            </div>
          ))
        ) : data?.items.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-400">Sin inscripciones</div>
        ) : (
          data?.items.map((item) => {
            const evaluadores: { rol: Rol; label: string; nombre: string | null; icon: typeof Briefcase; evaluacionEnviada: boolean }[] = [
              { rol: "jefe", label: "Jefe inmediato", nombre: item.jefeNombre, icon: Briefcase, evaluacionEnviada: item.jefeEvaluacionEstado === "enviado" },
              { rol: "companero1", label: "Compañero 1", nombre: item.companero1Nombre, icon: Users, evaluacionEnviada: item.companero1EvaluacionEstado === "enviado" },
              { rol: "companero2", label: "Compañero 2", nombre: item.companero2Nombre, icon: Users, evaluacionEnviada: item.companero2EvaluacionEstado === "enviado" },
            ];
            const completos = evaluadores.filter((e) => e.nombre).length;
            const abierto = expandido === item.id;

            return (
              <div key={item.id} className="border-t border-gray-100 first:border-t-0">
                <button
                  type="button"
                  onClick={() => setExpandido(abierto ? null : item.id)}
                  aria-expanded={abierto}
                  className="grid w-full grid-cols-[34px_1.7fr_1fr_88px_18px] items-center gap-3.5 px-4.5 py-2.5 text-left hover:bg-gray-50"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-gradient-to-br from-primary-500 to-accent-500 text-[11px] font-bold text-white">
                    {iniciales(item.trabajadorNombre)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-semibold text-gray-800">{item.trabajadorNombre}</span>
                    <span className="block text-[11.5px] text-gray-400 tabular-nums">{item.trabajadorCurp}</span>
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="flex shrink-0 gap-0.5">
                      {evaluadores.map((e) => (
                        <span key={e.rol} className={`h-1.5 w-1.5 rounded-full ${e.nombre ? "bg-emerald-600" : "bg-gray-200"}`} />
                      ))}
                    </span>
                    <span className={`truncate text-xs ${completos < 3 ? "font-semibold text-amber-700" : "text-gray-500"}`}>
                      {completos < 3 ? `${3 - completos} referencia${3 - completos > 1 ? "s" : ""} por revisar` : "3 evaluadores asignados"}
                    </span>
                  </span>
                  <span className="text-right text-xs text-gray-400 tabular-nums">{new Date(item.enviadoAt).toLocaleDateString("es-MX")}</span>
                  <ChevronRight size={16} className={`justify-self-end text-gray-300 transition-transform ${abierto ? "rotate-90" : ""}`} />
                </button>

                <AnimatePresence initial={false}>
                  {abierto && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden bg-gray-50/60"
                    >
                      <div className="grid grid-cols-1 gap-2.5 px-4.5 pb-4.5 pt-1 sm:grid-cols-3">
                        {evaluadores.map((e) => {
                          const roto = !e.nombre;
                          const Icon = e.icon;
                          return (
                            <div
                              key={e.rol}
                              className={`flex items-start gap-2.5 rounded-xl border p-3 ${roto ? "border-amber-200 bg-amber-50" : "border-gray-100 bg-white"}`}
                            >
                              <span className={`flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-lg ${roto ? "bg-amber-100 text-amber-700" : "bg-primary-50 text-primary-600"}`}>
                                {roto ? <AlertCircle size={14} /> : <Icon size={14} />}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-[10.5px] font-bold uppercase tracking-wide text-gray-400">{e.label}</span>
                                <span className={`mt-0.5 block truncate text-[12.5px] font-semibold ${roto ? "text-amber-700" : "text-gray-800"}`}>
                                  {e.nombre ?? "— cuenta no encontrada"}
                                </span>
                                {e.evaluacionEnviada ? (
                                  <span
                                    className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-semibold text-gray-400"
                                    title="Ese evaluador ya envió su evaluación; no se puede reasignar."
                                  >
                                    <RefreshCw size={11} />
                                    Ya evaluó — no se puede reasignar
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setReasignando({ promocionId: item.id, rol: e.rol, trabajadorUserId: item.trabajadorUserId, nuevoCurp: "", nuevoNombre: "" })}
                                    className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary-500 hover:text-primary-600 hover:underline"
                                  >
                                    <RefreshCw size={11} />
                                    Reasignar
                                  </button>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-gray-600">
            <span>Mostrando página {data.page} de {data.totalPages} ({data.total} resultados)</span>
            <div className="flex gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded p-1.5 hover:bg-gray-100 disabled:opacity-30">
                <ChevronRight size={16} className="rotate-180" />
              </button>
              <button onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))} disabled={page >= data.totalPages} className="rounded p-1.5 hover:bg-gray-100 disabled:opacity-30">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </motion.div>

      {modalImport && (
        <ImportarCSVModal
          titulo={modalImport === "jefe" ? "Jefes" : "Compañeros"}
          columnas={[
            { key: "curp", label: "CURP", ejemplo: "AAAA000101HDFXXX01" },
            { key: "nombre", label: "Nombre", ejemplo: "Juan Pérez López" },
            { key: "rfc", label: "RFC (opcional)", ejemplo: "AAAA000101AB1" },
            { key: "correo", label: "Correo (opcional)", ejemplo: "juan.perez@example.com" },
          ]}
          procesarFilas={mapearFilasEvaluadorPool}
          onImportar={async (registros) => {
            const resultado = await importarEvaluadoresMut.mutateAsync({ rol: modalImport, registros });
            // M7: antes el toast siempre decia "revisa el nombre capturado"
            // sin importar la causa real -- importarFilaEvaluador tambien
            // genera advertencia cuando el correo del CSV es invalido (formato
            // o dominio sin MX), que no tiene nada que ver con el nombre.
            // Mostrar el texto real de cada advertencia en vez de adivinar.
            if (resultado.advertencias.length > 0) {
              const MAX_MOSTRADAS = 3;
              const detalle = resultado.advertencias
                .slice(0, MAX_MOSTRADAS)
                .map((a) => a.advertencia)
                .join(" — ");
              const resto = resultado.advertencias.length - MAX_MOSTRADAS;
              toast.warning(`${detalle}${resto > 0 ? ` (y ${resto} más)` : ""}`);
            }
            return resultado;
          }}
          onClose={() => setModalImport(null)}
          onSuccess={() => utils.promocion.listarInscripciones.invalidate()}
        />
      )}

      <ConfirmModal
        open={!!quitando}
        variant="danger"
        title="¿Quitar del pool?"
        message={quitando ? `${quitando.nombre} ya no aparecerá como opción elegible de ${quitando.rol === "jefe" ? "Jefe" : "Compañero"}. No afecta inscripciones ya confirmadas.` : ""}
        confirmLabel="Sí, quitar"
        loading={quitarDelPoolMut.isPending}
        onCancel={() => setQuitando(null)}
        onConfirm={() => quitando && quitarDelPoolMut.mutate({ curp: quitando.curp, rol: quitando.rol })}
      />

      {reasignando && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setReasignando(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-sm font-bold text-slate-900">Reasignar {reasignando.rol}</h3>
            <BuscadorEvaluador
              rol={reasignando.rol === "jefe" ? "jefe" : "companero"}
              excluirUserId={reasignando.trabajadorUserId}
              onElegir={(curp, nombre, correoPrellenado) => setReasignando({ ...reasignando, nuevoCurp: curp, nuevoNombre: nombre, correo: correoPrellenado ?? reasignando.correo })}
            />
            {reasignando.nuevoCurp && (
              <>
                <p className="mt-2 text-xs text-slate-500">Elegido: {reasignando.nuevoNombre}</p>
                <input
                  type="email"
                  value={reasignando.correo ?? ""}
                  onChange={(e) => setReasignando({ ...reasignando, correo: e.target.value })}
                  placeholder="Correo de contacto"
                  className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </>
            )}
            <div className="mt-4 flex gap-3">
              <button onClick={() => setReasignando(null)} className="flex-1 rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <button
                onClick={() => reasignarMut.mutate({
                  promocionId: reasignando.promocionId,
                  rol: reasignando.rol,
                  nuevoCurp: reasignando.nuevoCurp,
                  nuevoNombre: reasignando.nuevoNombre,
                  correo: reasignando.correo ?? "",
                })}
                disabled={!reasignando.nuevoCurp || !reasignando.correo || reasignarMut.isPending}
                className="flex-1 rounded-xl bg-primary-600 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { stagger, fadeUp } from "@/lib/animations";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Search, ChevronRight, FileSpreadsheet, FileText } from "lucide-react";
import { exportarResultadosPromocionExcel, exportarResultadosPromocionPDF } from "@/lib/exportar";
import { formatearPuntaje } from "@shared/utils";

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase();
}

// Decimales segun la precision real de storage de cada componente (ver
// drizzle/schema.ts): Autoevaluacion decimal(4,1), Jefe entero,
// Compañero decimal(5,3) (fraccion 6/14 no-terminante) -- mostrar los 4
// siempre a 3 decimales sugeria falsa precision en los que no la tienen.
function Badge({ label, valor, decimales }: { label: string; valor: number | null; decimales: number }) {
  const pendiente = valor === null;
  return (
    <div className={`rounded-xl border p-2.5 ${pendiente ? "border-gray-100 bg-gray-50" : "border-emerald-100 bg-emerald-50"}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-0.5 text-sm font-bold tabular-nums ${pendiente ? "text-gray-400" : "text-emerald-700"}`}>
        {pendiente ? "Pendiente" : valor.toFixed(decimales)}
      </p>
    </div>
  );
}

export default function PromocionResultados() {
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState<"" | "completo" | "pendiente">("");
  const [ordenTotal, setOrdenTotal] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [exportando, setExportando] = useState<"excel" | "pdf" | null>(null);
  const [expandido, setExpandido] = useState<number | null>(null);

  const { data, isLoading } = trpc.promocion.listarResultados.useQuery({
    search: search || undefined,
    estado: estado || undefined,
    ordenTotal,
    page,
    limit: 20,
  });

  const utils = trpc.useUtils();
  const inputClass = "rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20";

  function mapExport(items: NonNullable<typeof data>["items"]) {
    return items.map((r) => ({
      trabajadorNombre: r.trabajadorNombre,
      trabajadorCurp: r.trabajadorCurp,
      autoevaluacion: (r.autoevaluacion?.estado === "enviado" ? r.autoevaluacion.puntaje ?? 0 : "pendiente") as number | "pendiente",
      jefe: (r.jefe?.estado === "enviado" ? r.jefe.puntaje ?? 0 : "pendiente") as number | "pendiente",
      companero1: (r.companero1?.estado === "enviado" ? r.companero1.puntaje ?? 0 : "pendiente") as number | "pendiente",
      companero2: (r.companero2?.estado === "enviado" ? r.companero2.puntaje ?? 0 : "pendiente") as number | "pendiente",
      total: r.total,
      completo: r.completo,
    }));
  }

  // Export sin paginar en la UI -- pero `listarResultados` es adminProcedure
  // con `limit` topado en 100 (server/routers/promocion.ts), a diferencia de
  // exportarTodos en otras paginas del sistema que no tiene tope de input.
  // Pedir limit:10000 de un solo golpe truena la validacion Zod, asi que
  // aqui se junta el export recorriendo paginas de 100 en 100 hasta cubrir
  // totalPages -- mismo resultado (export completo, no solo la pagina 1 de
  // 20 visible), sin tocar el router.
  async function handleExport(tipo: "excel" | "pdf") {
    setExportando(tipo);
    try {
      const limitePorPagina = 100;
      const primera = await utils.promocion.listarResultados.fetch({
        search: search || undefined,
        estado: estado || undefined,
        ordenTotal,
        page: 1,
        limit: limitePorPagina,
      });
      let todos = primera.items;
      for (let p = 2; p <= primera.totalPages; p++) {
        const siguiente = await utils.promocion.listarResultados.fetch({
          search: search || undefined,
          estado: estado || undefined,
          ordenTotal,
          page: p,
          limit: limitePorPagina,
        });
        todos = todos.concat(siguiente.items);
      }
      const datos = mapExport(todos);
      if (tipo === "excel") exportarResultadosPromocionExcel(datos);
      else exportarResultadosPromocionPDF(datos);
    } catch (err: any) {
      toast.error("No se pudo exportar", { description: err.message ?? "Intenta de nuevo." });
    } finally {
      setExportando(null);
    }
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Resultados de Promoción</h1>
          <p className="mt-0.5 text-sm text-gray-500">Puntaje agregado (40 pts) por trabajador — solo lectura.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleExport("excel")}
            disabled={exportando !== null || !data || data.total === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
          >
            <FileSpreadsheet size={16} /> {exportando === "excel" ? "Exportando..." : "Excel"}
          </button>
          <button
            onClick={() => handleExport("pdf")}
            disabled={exportando !== null || !data || data.total === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
          >
            <FileText size={16} /> {exportando === "pdf" ? "Exportando..." : "PDF"}
          </button>
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o CURP..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className={`${inputClass} pl-9 w-full`}
          />
        </div>
        <select value={estado} onChange={(e) => { setEstado(e.target.value as any); setPage(1); }} className={inputClass}>
          <option value="">Todos los estados</option>
          <option value="completo">Completos</option>
          <option value="pendiente">Pendientes</option>
        </select>
        <select value={ordenTotal} onChange={(e) => { setOrdenTotal(e.target.value as any); setPage(1); }} className={inputClass}>
          <option value="desc">Total: mayor a menor</option>
          <option value="asc">Total: menor a mayor</option>
        </select>
      </motion.div>

      <motion.div variants={fadeUp} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card-rest">
        {isLoading ? (
          <div className="px-4 py-10 text-center text-sm text-gray-400">Cargando...</div>
        ) : data?.items.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-400">Sin resultados</div>
        ) : (
          data?.items.map((item) => {
            const componentes = [
              { rol: "auto", enviado: item.autoevaluacion?.estado === "enviado" },
              { rol: "jefe", enviado: item.jefe?.estado === "enviado" },
              { rol: "c1", enviado: item.companero1?.estado === "enviado" },
              { rol: "c2", enviado: item.companero2?.estado === "enviado" },
            ];
            const completados = componentes.filter((c) => c.enviado).length;
            const abierto = expandido === item.promocionId;

            return (
              <div key={item.promocionId} className="border-t border-gray-100 first:border-t-0">
                <button
                  type="button"
                  onClick={() => setExpandido(abierto ? null : item.promocionId)}
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
                      {componentes.map((c) => (
                        <span key={c.rol} className={`h-1.5 w-1.5 rounded-full ${c.enviado ? "bg-emerald-600" : "bg-gray-200"}`} />
                      ))}
                    </span>
                    <span className={`truncate text-xs ${item.completo ? "text-gray-500" : "font-semibold text-amber-700"}`}>
                      {item.completo ? "Completo" : `${4 - completados} pendiente${4 - completados > 1 ? "s" : ""}`}
                    </span>
                  </span>
                  <span className="text-right text-xs font-bold tabular-nums text-gray-900">{formatearPuntaje(item.total)}<span className="ml-0.5 font-normal text-gray-400">/40</span></span>
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
                      <div className="grid grid-cols-2 gap-2.5 px-4.5 pb-4.5 pt-1 sm:grid-cols-4">
                        <Badge label="Autoevaluación (14)" decimales={1} valor={item.autoevaluacion?.estado === "enviado" ? item.autoevaluacion.puntaje : null} />
                        <Badge label="Jefe (14)" decimales={0} valor={item.jefe?.estado === "enviado" ? item.jefe.puntaje : null} />
                        <Badge label="Compañero 1 (6)" decimales={3} valor={item.companero1?.estado === "enviado" ? item.companero1.puntaje : null} />
                        <Badge label="Compañero 2 (6)" decimales={3} valor={item.companero2?.estado === "enviado" ? item.companero2.puntaje : null} />
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
    </motion.div>
  );
}

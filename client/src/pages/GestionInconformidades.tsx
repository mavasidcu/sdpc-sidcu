import { useState } from "react";
import { motion } from "framer-motion";
import { stagger, fadeUp } from "@/lib/animations";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Archive, Download, FileSpreadsheet, FileText } from "lucide-react";
import JSZip from "jszip";
import { exportarInconformidadesExcel, exportarInconformidadesPDF, fechaLocalISO } from "@/lib/exportar";
import { FACTOR_INCONFORMIDAD_LABELS as FACTOR_LABELS } from "@shared/const";
import { Skeleton } from "@/components/Skeleton";

// Filesystem-unsafe en Windows/macOS/Linux -- un nombreOriginal es texto libre
// capturado por el trabajador al subir, no validado contra esto.
function sanitizarNombreArchivo(nombre: string): string {
  return nombre.replace(/[\\/:*?"<>|]/g, "_").trim() || "archivo.pdf";
}

// Corre `tareas` con a lo mucho `limite` en vuelo a la vez -- sin esto, un
// filtro con cientos de PDFs dispararia todos los fetch al mismo tiempo
// (satura el navegador y golpea S3 con un burst innecesario).
async function conConcurrenciaLimitada<T>(items: T[], limite: number, tarea: (item: T) => Promise<void>): Promise<void> {
  let indice = 0;
  async function trabajador() {
    while (indice < items.length) {
      const actual = items[indice++];
      await tarea(actual);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, trabajador));
}

export default function GestionInconformidades() {
  const utils = trpc.useUtils();
  const [filtroFactor, setFiltroFactor] = useState<string | undefined>(undefined);
  const [exportando, setExportando] = useState<"excel" | "pdf" | null>(null);
  const [descargandoZip, setDescargandoZip] = useState<{ hecho: number; total: number } | null>(null);
  const [verDetalle, setVerDetalle] = useState<number | null>(null);

  const { data: casos, isLoading } = trpc.inconformidad.listarAdmin.useQuery(
    { factor: filtroFactor as any },
    { placeholderData: (prev) => prev },
  );
  const { data: config } = trpc.inconformidad.factoresDisponibles.useQuery();

  const toggleMut = trpc.inconformidad.actualizarConfigFactor.useMutation({
    onSuccess: () => utils.inconformidad.factoresDisponibles.invalidate(),
  });

  const descargaUtil = utils.inconformidad.presignarDescarga;

  const handleDescargar = async (archivoId: number) => {
    try {
      const { url } = await descargaUtil.fetch({ archivoId });
      window.open(url, "_blank");
    } catch (err: any) {
      // err.message ya viene saneado por el errorFormatter global de tRPC
      // (server/trpc.ts) -- nunca trae detalle crudo de infra.
      toast.error("No se pudo descargar el archivo", { description: err.message ?? "Intenta de nuevo." });
    }
  };

  const filasExport = (casos ?? []).flatMap((c) =>
    c.factores.map((f) => ({
      nombreCompleto: c.nombreCompleto,
      curp: c.curp,
      factor: f.factor,
      mensaje: f.mensaje,
      archivoId: f.archivoId,
      enviadoAt: c.enviadoAt,
    })),
  );

  const handleExport = async (tipo: "excel" | "pdf") => {
    setExportando(tipo);
    try {
      if (tipo === "excel") exportarInconformidadesExcel(filasExport);
      else exportarInconformidadesPDF(filasExport);
    } catch (err: any) {
      toast.error("No se pudo exportar", { description: err.message ?? "Intenta de nuevo." });
    } finally {
      setExportando(null);
    }
  };

  // Respeta filtroFactor igual que Excel/PDF (casos ya viene filtrado por el
  // query de listarAdmin) -- factores sin PDF (archivoId null) se excluyen.
  const archivosParaZip = (casos ?? []).flatMap((c) =>
    c.factores
      .filter((f): f is typeof f & { archivoId: number; nombreOriginal: string } => f.archivoId !== null && f.nombreOriginal !== null)
      .map((f) => ({ archivoId: f.archivoId, curp: c.curp, factor: f.factor, nombreOriginal: f.nombreOriginal })),
  );

  const handleDescargarTodos = async () => {
    const total = archivosParaZip.length;
    setDescargandoZip({ hecho: 0, total });
    const zip = new JSZip();
    let omitidos = 0;
    let hecho = 0;

    await conConcurrenciaLimitada(archivosParaZip, 5, async (item) => {
      try {
        const { url } = await utils.inconformidad.presignarDescarga.fetch({ archivoId: item.archivoId });
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const nombreZip = `${item.curp}_${item.factor}_${sanitizarNombreArchivo(item.nombreOriginal)}`;
        zip.file(nombreZip, blob);
      } catch {
        omitidos++;
      } finally {
        hecho++;
        setDescargandoZip({ hecho, total });
      }
    });

    if (total - omitidos === 0) {
      toast.error("No se pudo descargar ningún PDF", { description: "Intenta de nuevo." });
      setDescargandoZip(null);
      return;
    }

    const contenido = await zip.generateAsync({ type: "blob" });
    const enlaceUrl = URL.createObjectURL(contenido);
    const a = document.createElement("a");
    a.href = enlaceUrl;
    a.download = `inconformidades_pdfs_${fechaLocalISO()}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(enlaceUrl);

    if (omitidos > 0) {
      toast.warning(`Se descargaron ${total - omitidos} de ${total} PDFs`, { description: `${omitidos} no se pudieron descargar.` });
    } else {
      toast.success(`Se descargaron ${total} PDFs`);
    }
    setDescargandoZip(null);
  };

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={fadeUp} className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Inconformidades</h1>
          <p className="mt-0.5 text-sm text-slate-400">Casos enviados por los servidores públicos</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleExport("excel")}
            disabled={exportando !== null || filasExport.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
          >
            <FileSpreadsheet size={16} />
            {exportando === "excel" ? "Exportando..." : "Excel"}
          </button>
          <button
            onClick={() => handleExport("pdf")}
            disabled={exportando !== null || filasExport.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
          >
            <FileText size={16} />
            {exportando === "pdf" ? "Exportando..." : "PDF"}
          </button>
          <button
            onClick={handleDescargarTodos}
            disabled={descargandoZip !== null || archivosParaZip.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-100 disabled:opacity-50"
          >
            <Archive size={16} />
            {descargandoZip ? `Descargando ${descargandoZip.hecho}/${descargandoZip.total}...` : "Descargar todos los PDF"}
          </button>
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className="rounded-2xl bg-white p-5 shadow-card-rest border border-slate-200/60">
        <p className="text-micro font-semibold uppercase tracking-widest text-slate-400">Factores disponibles</p>
        <div className="mt-3 flex flex-wrap gap-4">
          {(config ?? []).map((fc) => (
            <div key={fc.factor} className="flex items-center gap-2">
              <button
                role="switch"
                aria-checked={fc.habilitado}
                aria-label={`Habilitar factor ${FACTOR_LABELS[fc.factor]}`}
                onClick={() => toggleMut.mutate({ factor: fc.factor as any, habilitado: !fc.habilitado })}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  fc.habilitado ? "bg-emerald-500" : "bg-slate-200"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                    fc.habilitado ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
              <span className="text-sm text-slate-600">{FACTOR_LABELS[fc.factor]}</span>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className="flex flex-wrap gap-2">
        <button
          onClick={() => setFiltroFactor(undefined)}
          className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${!filtroFactor ? "bg-primary-500 text-white" : "border border-slate-200 bg-white text-slate-600"}`}
        >
          Todos
        </button>
        {Object.entries(FACTOR_LABELS).map(([valor, label]) => (
          <button
            key={valor}
            onClick={() => setFiltroFactor(valor)}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${filtroFactor === valor ? "bg-primary-500 text-white" : "border border-slate-200 bg-white text-slate-600"}`}
          >
            {label}
          </button>
        ))}
      </motion.div>

      <motion.div variants={stagger} className="space-y-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-white p-5 shadow-card-rest border border-gray-100">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="mt-2 h-2.5 w-28" />
                </div>
                <Skeleton className="h-5 w-24 rounded-lg" />
              </div>
            </div>
          ))
        ) : (casos ?? []).length === 0 ? (
          <div className="rounded-2xl bg-white p-12 text-center shadow-card-rest border border-gray-100">
            <FileText className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-3 font-medium text-gray-600">No hay inconformidades enviadas</p>
          </div>
        ) : (
          casos!.map((caso) => (
            <div key={caso.id} className="rounded-2xl bg-white p-5 shadow-card-rest border border-gray-100">
              <button
                type="button"
                onClick={() => setVerDetalle(verDetalle === caso.id ? null : caso.id)}
                className="flex w-full items-center justify-between text-left"
              >
                <div>
                  <p className="font-semibold text-gray-900">{caso.nombreCompleto}</p>
                  <p className="text-xs text-gray-400">{caso.curp}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {caso.factores.map((f) => (
                    <span key={f.id} className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-600">
                      {FACTOR_LABELS[f.factor]}
                    </span>
                  ))}
                </div>
              </button>

              {verDetalle === caso.id && (
                <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                  {caso.factores.map((f) => (
                    <div key={f.id} className="rounded-xl bg-gray-50 p-3">
                      <p className="text-sm font-medium text-gray-800">{FACTOR_LABELS[f.factor]}</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{f.mensaje}</p>
                      {f.archivoId && (
                        <button
                          type="button"
                          onClick={() => handleDescargar(f.archivoId!)}
                          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 underline"
                        >
                          <Download size={12} /> Descargar PDF
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </motion.div>
    </motion.div>
  );
}

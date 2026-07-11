import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, FileSpreadsheet, Download, AlertTriangle, CheckCircle2 } from "lucide-react";
import { parseCSV } from "@/lib/csv";

interface ImportarCSVModalProps {
  titulo: string;
  columnas: { key: string; label: string; ejemplo: string }[];
  onImportar: (registros: Record<string, any>[]) => Promise<{ totalProcesados: number; creados: number; errores: { fila: number; error: string }[] }>;
  onClose: () => void;
  onSuccess: () => void;
  /** Campos que heredan el valor de la fila anterior cuando vienen vacíos
   *  (celdas combinadas de Excel exportadas a CSV dejan vacías las filas siguientes). */
  camposHeredables?: string[];
  /** Slot opcional para controles extra (ej. selector de programa) que
   *  aparecen junto al preview, después de subir el archivo -- un solo
   *  lugar para elegir configuración del import, no un selector aparte
   *  antes de abrir el modal. */
  extraControls?: React.ReactNode;
}

function aplicarFillDown(registros: Record<string, string>[], campos: string[]): Record<string, string>[] {
  const ultimoValor: Record<string, string> = {};
  return registros.map((row) => {
    const nuevo = { ...row };
    for (const campo of campos) {
      const valor = nuevo[campo];
      const vacio = valor === undefined || valor === null || valor.toString().trim() === "";
      if (vacio && ultimoValor[campo] !== undefined) {
        nuevo[campo] = ultimoValor[campo];
      } else if (!vacio) {
        ultimoValor[campo] = valor;
      }
    }
    return nuevo;
  });
}

export default function ImportarCSVModal({ titulo, columnas, onImportar, onClose, onSuccess, camposHeredables, extraControls }: ImportarCSVModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Record<string, any>[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ creados: number; errores: { fila: number; error: string }[] } | null>(null);

  const procesarPreview = (registros: Record<string, string>[]) =>
    camposHeredables?.length ? aplicarFillDown(registros, camposHeredables) : registros;

  const handleFile = (file: File) => {
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      let text = e.target?.result as string;
      if (text.includes("�") || text.includes("Ã¡") || text.includes("Ã©")) {
        const readerLatin = new FileReader();
        readerLatin.onload = (e2) => {
          const textLatin = e2.target?.result as string;
          setPreview(procesarPreview(parseCSV(textLatin)));
        };
        readerLatin.readAsText(file, "latin1");
        return;
      }
      setPreview(procesarPreview(parseCSV(text)));
    };
    reader.readAsText(file, "UTF-8");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".csv")) handleFile(file);
  };

  const handleImport = async () => {
    if (!preview?.length) return;
    setImporting(true);
    try {
      const res = await onImportar(preview);
      setResult({ creados: res.creados, errores: res.errores });
      if (res.creados > 0) {
        onSuccess();
        if (res.errores.length === 0) {
          setTimeout(onClose, 1000);
        }
      }
    } catch (err: any) {
      setResult({ creados: 0, errores: [{ fila: 0, error: err.message }] });
    } finally {
      setImporting(false);
    }
  };

  const descargarPlantilla = () => {
    const header = columnas.map((c) => c.key).join(",");
    const ejemplo = columnas.map((c) => c.ejemplo).join(",");
    const blob = new Blob([header + "\n" + ejemplo + "\n"], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plantilla_${titulo.toLowerCase().replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={importing ? undefined : onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-primary-500" />
            <h2 className="text-base font-bold text-slate-800">Importar {titulo}</h2>
          </div>
          <button onClick={onClose} disabled={importing} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 relative">
          {/* Importing overlay */}
          {importing && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/90 backdrop-blur-sm">
              <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary-200 border-t-primary-600" />
              <p className="text-sm font-semibold text-slate-600">
                Importando {preview?.length} registro{preview?.length !== 1 ? "s" : ""}...
              </p>
              <p className="text-xs text-slate-400">No cierres esta ventana</p>
            </div>
          )}

          {/* Download template */}
          <button
            onClick={descargarPlantilla}
            className="flex items-center gap-2 rounded-xl border border-dashed border-primary-300 bg-primary-50/50 px-4 py-2.5 text-sm font-medium text-primary-600 hover:bg-primary-50 transition-colors w-full justify-center"
          >
            <Download size={14} />
            Descargar plantilla CSV
          </button>

          {/* Drop zone */}
          {!preview && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 py-12 text-center hover:border-primary-300 hover:bg-primary-50/30 transition-all"
            >
              <Upload size={28} className="text-slate-300" />
              <div>
                <p className="text-sm font-semibold text-slate-600">Arrastra tu archivo CSV aquí</p>
                <p className="text-xs text-slate-400 mt-1">o haz clic para seleccionar</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </div>
          )}

          {/* Column reference */}
          {!preview && (
            <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-4">
              <p className="text-micro font-semibold uppercase tracking-widest text-slate-400 mb-2">Columnas esperadas</p>
              <div className="grid grid-cols-2 gap-1.5">
                {columnas.map((c) => (
                  <div key={c.key} className="text-xs text-slate-600">
                    <span className="font-mono font-semibold text-slate-800">{c.key}</span>
                    <span className="text-slate-400"> — {c.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview */}
          {preview && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">
                  {fileName} — {preview.length} registro{preview.length !== 1 ? "s" : ""}
                </p>
                <button
                  onClick={() => { setPreview(null); setFileName(""); setResult(null); }}
                  className="text-xs font-medium text-slate-400 hover:text-slate-600"
                >
                  Cambiar archivo
                </button>
              </div>

              {extraControls && !result && (
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  {extraControls}
                </div>
              )}

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-3 py-2 text-left font-semibold text-slate-500">#</th>
                      {columnas.map((c) => (
                        <th key={c.key} className="px-3 py-2 text-left font-semibold text-slate-500">{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                        {columnas.map((c) => (
                          <td key={c.key} className="px-3 py-2 text-slate-700 max-w-37.5 truncate">
                            {row[c.key] ?? <span className="text-slate-300">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 10 && (
                  <p className="border-t border-slate-100 px-3 py-2 text-center text-micro text-slate-400">
                    ...y {preview.length - 10} más
                  </p>
                )}
              </div>
            </>
          )}

          {/* Result */}
          <AnimatePresence>
            {result && (() => {
              const omitidos = result.errores.filter((e) => e.error.includes("ya registrado") || e.error.includes("ya existe") || e.error.includes("duplicado") || e.error.includes("se omitió"));
              const erroresReales = result.errores.filter((e) => !omitidos.includes(e));
              return (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                  {/* Resumen */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-emerald-50 p-2.5">
                      <p className="text-lg font-extrabold text-emerald-600">{result.creados}</p>
                      <p className="text-micro font-medium text-emerald-500">Importados</p>
                    </div>
                    <div className="rounded-xl bg-amber-50 p-2.5">
                      <p className="text-lg font-extrabold text-amber-600">{omitidos.length}</p>
                      <p className="text-micro font-medium text-amber-500">Omitidos</p>
                    </div>
                    <div className="rounded-xl bg-rose-50 p-2.5">
                      <p className="text-lg font-extrabold text-rose-600">{erroresReales.length}</p>
                      <p className="text-micro font-medium text-rose-500">Errores</p>
                    </div>
                  </div>

                  {/* Omitidos (duplicados) */}
                  {omitidos.length > 0 && (
                    <div className="rounded-xl bg-amber-50 p-3 space-y-1">
                      <p className="text-sm font-semibold text-amber-700">Registros omitidos (ya existían)</p>
                      {omitidos.slice(0, 5).map((err, i) => (
                        <p key={i} className="text-xs text-amber-600">
                          Fila {err.fila}: {err.error}
                        </p>
                      ))}
                      {omitidos.length > 5 && (
                        <p className="text-xs text-amber-400">...y {omitidos.length - 5} más</p>
                      )}
                    </div>
                  )}

                  {/* Errores reales */}
                  {erroresReales.length > 0 && (
                    <div className="rounded-xl bg-rose-50 p-3 space-y-1">
                      <div className="flex items-center gap-2 text-sm font-semibold text-rose-700">
                        <AlertTriangle size={14} />
                        {erroresReales.length} error{erroresReales.length !== 1 ? "es" : ""}
                      </div>
                      {erroresReales.slice(0, 5).map((err, i) => (
                        <p key={i} className="text-xs text-rose-600">
                          Fila {err.fila}: {err.error}
                        </p>
                      ))}
                      {erroresReales.length > 5 && (
                        <p className="text-xs text-rose-400">...y {erroresReales.length - 5} más</p>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })()}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-slate-100 px-5 py-4">
          <button
            onClick={onClose}
            disabled={importing}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Cerrar
          </button>
          {preview && !result?.creados && (
            <button
              onClick={handleImport}
              disabled={importing || !preview.length}
              className="flex-1 rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white shadow-sm shadow-primary-600/20 hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {importing ? "Importando..." : `Importar ${preview.length} registros`}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

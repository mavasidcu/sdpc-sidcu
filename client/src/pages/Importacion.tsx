import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { parseCSV } from "@/lib/csv";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  RotateCcw,
  Download,
  Info,
} from "lucide-react";

const CAMPOS_REQUERIDOS = ["curp", "nombreCompleto"];

const CAMPOS_OPCIONALES = [
  "upa",
  "fechaIngreso",
  "preparacionAcademica",
  "cmao",
  "ua",
  "cargo",
  "nivelProgresion",
  "rfc",
  "dependencia",
  "grupoFuncion",
  "datosContacto",
  "email",
  "estatus",
  "observaciones",
];

const CAMPO_LABELS: Record<string, string> = {
  nombreCompleto: "Nombre (NOMBRE)",
  rfc: "RFC",
  curp: "CURP",
  cargo: "Cargo (PUESTO)",
  dependencia: "Dependencia",
  fechaIngreso: "Fecha Ingreso (ANTIGÜEDAD)",
  datosContacto: "Datos Contacto",
  email: "Correo Electrónico",
  grupoFuncion: "Grupo Función",
  upa: "UPA (UP)",
  cmao: "CMAO",
  ua: "UA",
  nivelProgresion: "Nivel Progresión (NIVEL: 0,N1-N5)",
  preparacionAcademica: "Preparación Académica",
  estatus: "Estatus",
  observaciones: "Observaciones",
};

type Paso = "subir" | "preview" | "resultado";

interface ValidacionResult {
  total: number;
  validos: number;
  invalidos: number;
  resultados: Array<{
    fila: number;
    valido: boolean;
    data: Record<string, any>;
    errores: string[];
  }>;
}

interface ImportResult {
  totalProcesados: number;
  creados: number;
  errores: Array<{ fila: number; error: string }>;
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

export default function Importacion() {
  const [paso, setPaso] = useState<Paso>("subir");
  const [registros, setRegistros] = useState<Record<string, string>[]>([]);
  const [validacion, setValidacion] = useState<ValidacionResult | null>(null);
  const [resultado, setResultado] = useState<ImportResult | null>(null);
  const [archivo, setArchivo] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const [programa, setPrograma] = useState<"PAC" | "SPC" | "SDPC">("SDPC");
  const fileRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const validarMut = trpc.importacion.validar.useMutation({
    onSuccess: (data) => {
      setValidacion(data);
      setPaso("preview");
    },
  });

  const importarMut = trpc.importacion.importar.useMutation({
    onSuccess: (data) => {
      setResultado(data);
      setPaso("resultado");
      utils.servidores.listar.invalidate();
      utils.servidores.estadisticas.invalidate();
    },
  });

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) {
      alert("Solo archivos .csv");
      return;
    }
    setArchivo(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        alert("Archivo vacío o formato inválido");
        return;
      }
      setRegistros(parsed);
      // Validacion real contra el server (curp/nombre reconocibles) -- antes
      // esto marcaba todas las filas como validas sin checar nada.
      validarMut.mutate({ registros: parsed });
    };
    reader.readAsText(file, "UTF-8");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validarMut]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleImportar = () => {
    if (!registros.length) return;
    importarMut.mutate({ registros, programa });
  };

  const resetear = () => {
    setPaso("subir");
    setRegistros([]);
    setValidacion(null);
    setResultado(null);
    setArchivo("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const descargarPlantilla = () => {
    const headers = [...CAMPOS_REQUERIDOS, ...CAMPOS_OPCIONALES].join(",");
    const ejemplo = [
      "PELJ900101HDFRPN01",
      "Juan Pérez López",
      "CULTURA",
      "2024-01-15",
      "Licenciatura en Administración",
      "CMAO1",
      "Dirección de Vinculación",
      "Director General",
      "0",
      "PELJ900101ABC",
      "Secretaría de Cultura",
      "ADMO",
      "5512345678",
      "contacto@cultura.gob.mx",
      "activo",
      "Sin observaciones",
    ].join(",");
    const csv = `${headers}\n${ejemplo}`;
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla_servidores.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.08 } } }}
      className="mx-auto max-w-4xl space-y-6"
    >
      {/* Header */}
      <motion.div variants={fadeUp} className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Importar CSV
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Carga masiva de servidores públicos
          </p>
        </div>
        <button
          onClick={descargarPlantilla}
          className="hidden items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-600 transition-colors hover:bg-primary-100 sm:flex"
        >
          <Download size={14} />
          Descargar plantilla
        </button>
      </motion.div>

      {/* Steps indicator */}
      <motion.div variants={fadeUp} className="flex items-center gap-3">
        {[
          { key: "subir", label: "Subir archivo", num: 1 },
          { key: "preview", label: "Revisar datos", num: 2 },
          { key: "resultado", label: "Resultado", num: 3 },
        ].map((step, i) => {
          const current = paso === step.key;
          const done =
            (paso === "preview" && i === 0) ||
            (paso === "resultado" && i <= 1);
          return (
            <div key={step.key} className="flex items-center gap-2">
              {i > 0 && (
                <div
                  className={`h-px w-8 ${done ? "bg-primary-400" : "bg-slate-200"}`}
                />
              )}
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                  current
                    ? "bg-primary-500 text-white"
                    : done
                      ? "bg-emerald-100 text-emerald-600"
                      : "bg-slate-100 text-slate-400"
                }`}
              >
                {done ? <CheckCircle2 size={14} /> : step.num}
              </div>
              <span
                className={`text-xs font-medium ${
                  current ? "text-slate-700" : "text-slate-400"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </motion.div>

      {/* Step 1: Upload */}
      {paso === "subir" && (
        <motion.div variants={fadeUp}>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-all ${
              dragOver
                ? "border-primary-400 bg-primary-50"
                : "border-slate-200 bg-white hover:border-primary-300 hover:bg-slate-50"
            }`}
          >
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
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50">
              <Upload size={28} className="text-primary-500" />
            </div>
            <p className="text-sm font-semibold text-slate-700">
              Arrastra tu archivo CSV aquí
            </p>
            <p className="mt-1 text-xs text-slate-400">
              o haz clic para seleccionar
            </p>
            {validarMut.isPending && (
              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-primary-500">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-200 border-t-primary-500" />
                Validando...
              </div>
            )}
          </div>

          {/* Format help */}
          <div className="mt-4 rounded-2xl border border-slate-200/60 bg-white p-4 shadow-card-rest">
            <div className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-600">
              <Info size={14} className="text-primary-400" />
              Formato requerido
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CAMPOS_REQUERIDOS.map((c) => (
                <div key={c} className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary-400" />
                  <span className="text-xs text-slate-600">
                    {CAMPO_LABELS[c] ?? c}
                  </span>
                </div>
              ))}
              {CAMPOS_OPCIONALES.map((c) => (
                <div key={c} className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                  <span className="text-xs text-slate-400">
                    {CAMPO_LABELS[c] ?? c}{" "}
                    <span className="text-[10px]">(opcional)</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Step 2: Preview */}
      {paso === "preview" && validacion && (
        <motion.div variants={fadeUp} className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <p className="text-2xl font-extrabold text-slate-800">
                {validacion.total}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Total filas
              </p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-center">
              <p className="text-2xl font-extrabold text-emerald-600">
                {validacion.validos}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
                Válidos
              </p>
            </div>
            <div className="rounded-xl bg-rose-50 p-3 text-center">
              <p className="text-2xl font-extrabold text-rose-600">
                {validacion.invalidos}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-rose-400">
                Con errores
              </p>
            </div>
          </div>

          {/* File info */}
          <div className="flex items-center gap-3 rounded-xl bg-white border border-slate-200/60 px-4 py-3 shadow-card-rest">
            <FileSpreadsheet size={18} className="text-emerald-500" />
            <span className="text-sm font-medium text-slate-700">{archivo}</span>
            <span className="ml-auto text-xs text-slate-400">
              {validacion.total} registros
            </span>
          </div>

          {/* Preview table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200/60 bg-white shadow-card-rest">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-3 py-2.5">#</th>
                  <th className="px-3 py-2.5">Estado</th>
                  <th className="px-3 py-2.5">Nombre</th>
                  <th className="px-3 py-2.5">RFC</th>
                  <th className="px-3 py-2.5">CURP</th>
                  <th className="px-3 py-2.5">Cargo</th>
                  <th className="px-3 py-2.5">Errores</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {validacion.resultados.slice(0, 50).map((r) => (
                  <tr
                    key={r.fila}
                    className={r.valido ? "" : "bg-rose-50/50"}
                  >
                    <td className="px-3 py-2 text-slate-400">{r.fila}</td>
                    <td className="px-3 py-2">
                      {r.valido ? (
                        <CheckCircle2 size={14} className="text-emerald-500" />
                      ) : (
                        <XCircle size={14} className="text-rose-500" />
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-700">
                      {r.data.nombreCompleto ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-mono">{r.data.rfc ?? "—"}</td>
                    <td className="px-3 py-2 font-mono">{r.data.curp ?? "—"}</td>
                    <td className="px-3 py-2">{r.data.cargo ?? "—"}</td>
                    <td className="max-w-[200px] px-3 py-2">
                      {r.errores.length > 0 && (
                        <div className="space-y-0.5">
                          {r.errores.map((err, i) => (
                            <p key={i} className="text-[10px] text-rose-500">
                              {err}
                            </p>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {validacion.total > 50 && (
              <div className="border-t border-slate-100 px-3 py-2 text-center text-[11px] text-slate-400">
                Mostrando 50 de {validacion.total} registros
              </div>
            )}
          </div>

          {/* Programa -- todo el archivo pertenece a un solo programa, se elige antes de importar */}
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <label className="text-sm font-semibold text-slate-600">Programa de este archivo:</label>
            <select
              value={programa}
              onChange={(e) => setPrograma(e.target.value as "PAC" | "SPC" | "SDPC")}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700"
            >
              <option value="PAC">PAC</option>
              <option value="SPC">SPC</option>
              <option value="SDPC">SDPC</option>
            </select>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={resetear}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
            >
              <RotateCcw size={14} />
              Cancelar
            </button>
            <button
              onClick={handleImportar}
              disabled={validacion.validos === 0 || importarMut.isPending}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-primary-500/25 transition-colors hover:bg-primary-600 disabled:opacity-50"
            >
              {importarMut.isPending ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Importando...
                </>
              ) : (
                <>
                  <ArrowRight size={14} />
                  Importar {validacion.validos} registros válidos
                </>
              )}
            </button>
          </div>

          {validacion.invalidos > 0 && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" />
              <p className="text-xs text-amber-700">
                {validacion.invalidos} registros con errores serán omitidos.
                Solo se importarán los {validacion.validos} válidos.
              </p>
            </div>
          )}
        </motion.div>
      )}

      {/* Step 3: Result */}
      {paso === "resultado" && resultado && (
        <motion.div variants={fadeUp} className="space-y-4">
          <div className="rounded-2xl border border-slate-200/60 bg-white p-8 text-center shadow-card-rest">
            {resultado.creados > 0 ? (
              <>
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50">
                  <CheckCircle2 size={32} className="text-emerald-500" />
                </div>
                <h2 className="text-xl font-extrabold text-slate-900">
                  Importación completada
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  Se crearon{" "}
                  <span className="font-bold text-emerald-600">
                    {resultado.creados}
                  </span>{" "}
                  servidores públicos de{" "}
                  <span className="font-bold">{resultado.totalProcesados}</span>{" "}
                  procesados
                </p>
              </>
            ) : (
              <>
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50">
                  <XCircle size={32} className="text-rose-500" />
                </div>
                <h2 className="text-xl font-extrabold text-slate-900">
                  No se importaron registros
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  Todos los registros tuvieron errores
                </p>
              </>
            )}
          </div>

          {resultado.errores.length > 0 && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <h3 className="mb-2 text-xs font-bold text-rose-600">
                Errores ({resultado.errores.length})
              </h3>
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {resultado.errores.map((e, i) => (
                  <p key={i} className="text-xs text-rose-600">
                    Fila {e.fila}: {e.error}
                  </p>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={resetear}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-primary-500/25 transition-colors hover:bg-primary-600"
          >
            <RotateCcw size={14} />
            Importar otro archivo
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}

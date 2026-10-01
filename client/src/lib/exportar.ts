import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { FACTOR_INCONFORMIDAD_LABELS } from "@shared/const";
import { formatearPuntaje } from "@shared/utils";

const NIVEL_LABELS: Record<string, string> = {
  federal: "Federal",
  estatal: "Estatal",
  municipal: "Municipal",
  otro: "Otro",
};

const GRUPO_LABELS: Record<string, string> = {
  ADMO: "Administrativo",
  TECN: "Técnico",
  SERV: "Servicios",
  COMUN: "Comunicación",
  PROFE: "Profesional",
  EDU: "Educación",
};

interface ServidorExport {
  nombreCompleto: string;
  rfc: string;
  curp: string;
  cargo: string;
  dependencia: string;
  nivel: string;
  fechaIngreso: string | Date;
  datosContacto?: string | null;
  email?: string | null;
  grupoFuncion: string;
  upa?: string | null;
  cmao?: string | null;
  ua?: string | null;
  nivelProgresion?: number | null;
  preparacionAcademica?: string | null;
  estatus: string;
  observaciones?: string | null;
}

function formatFecha(date: string | Date): string {
  const d = new Date(date);
  // timeZone: "UTC" -- fechaIngreso es fecha de calendario pura guardada
  // como medianoche UTC, sin esto se desfasa un dia segun la timezone del
  // navegador (mismo bug que fechaInicio/fechaFin de cursos, ver server/db.ts).
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Para timestamps reales (createdAt) -- a diferencia de fechaIngreso, estos no
// son "medianoche UTC" sino el momento exacto en que paso algo. Forzar UTC aqui
// corre la fecha un dia adelante para cualquiera que actuo de noche en Mexico
// (UTC-6): su timestamp real ya cruzo a la madrugada UTC del dia siguiente.
function formatFechaHora(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const NIVEL_PROG_LABELS: Record<number, string> = { 0: "Nuevo ingreso", 1: "N1", 2: "N2", 3: "N3", 4: "N4", 5: "N5" };

// Fecha LOCAL (no UTC) para nombre de archivo y texto "Generado:" -- deben
// coincidir entre si. Antes el nombre de archivo usaba toISOString() (UTC)
// y el texto interno usaba toLocaleDateString() (hora local del navegador),
// dos bases distintas para el mismo momento: en Mexico (UTC-6), ya entrada
// la noche local UTC ya rodo al dia siguiente, y el archivo salia fechado
// un dia adelante del texto "Generado:" que mostraba el dia local real.
export function fechaLocalISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Excel/Sheets tratan una celda que empieza con =, +, -, @ (o tab/CR) como
// formula al abrirla -- si ese texto viene de un campo cargado por CSV u
// onboarding (nombre, cargo, observaciones, etc.), es una via de inyeccion de
// formulas. Anteponer una comilla simple fuerza texto plano sin cambiar lo
// que se ve en la celda.
const CSV_FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];
function sanitizeCell(value: string): string {
  if (!value) return value;
  return CSV_FORMULA_PREFIXES.includes(value[0]) ? `'${value}` : value;
}

function prepararDatos(items: ServidorExport[]) {
  return items.map((s) => ({
    "Nombre Completo": sanitizeCell(s.nombreCompleto),
    RFC: sanitizeCell(s.rfc),
    CURP: sanitizeCell(s.curp),
    Cargo: sanitizeCell(s.cargo),
    Dependencia: sanitizeCell(s.dependencia),
    "UPA (Sector)": sanitizeCell(s.upa ?? ""),
    CMAO: sanitizeCell(s.cmao ?? ""),
    "UA (Dirección)": sanitizeCell(s.ua ?? ""),
    "Preparación Académica": sanitizeCell(s.preparacionAcademica ?? ""),
    "Nivel Progresión": NIVEL_PROG_LABELS[s.nivelProgresion ?? 0] ?? `N${s.nivelProgresion}`,
    "Fecha de Ingreso": formatFecha(s.fechaIngreso),
    "Datos de Contacto": sanitizeCell(s.datosContacto ?? ""),
    Email: sanitizeCell(s.email ?? ""),
    "Grupo de Función": GRUPO_LABELS[s.grupoFuncion] ?? s.grupoFuncion,
    Estatus: s.estatus === "activo" ? "Activo" : "Inactivo",
    Observaciones: sanitizeCell(s.observaciones ?? ""),
  }));
}

export function exportarExcel(items: ServidorExport[], filename = "servidores_publicos") {
  const datos = prepararDatos(items);
  const ws = XLSX.utils.json_to_sheet(datos);

  const colWidths = [
    { wch: 30 }, // Nombre
    { wch: 15 }, // RFC
    { wch: 20 }, // CURP
    { wch: 25 }, // Cargo
    { wch: 25 }, // Dependencia
    { wch: 15 }, // UPA
    { wch: 10 }, // CMAO
    { wch: 30 }, // UA
    { wch: 30 }, // Preparación Académica
    { wch: 15 }, // Nivel Progresión
    { wch: 15 }, // Fecha
    { wch: 25 }, // Contacto
    { wch: 25 }, // Email
    { wch: 18 }, // Grupo
    { wch: 10 }, // Estatus
    { wch: 30 }, // Observaciones
  ];
  ws["!cols"] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Servidores Públicos");
  XLSX.writeFile(wb, `${filename}_${fechaLocalISO()}.xlsx`);
}

export function exportarPDF(items: ServidorExport[], filename = "servidores_publicos") {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });

  doc.setFontSize(16);
  doc.setTextColor(97, 18, 50);
  doc.text("Secretaría de Cultura", 14, 15);

  doc.setFontSize(11);
  doc.setTextColor(100, 116, 139);
  doc.text("Registro de Servidores Públicos", 14, 22);

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Generado: ${new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })} · ${items.length} registros`,
    14,
    28,
  );

  const headers = [
    "Nombre",
    "RFC",
    "CURP",
    "Cargo",
    "Dependencia",
    "UPA",
    "CMAO",
    "UA",
    "Nivel",
    "Fecha Ingreso",
    "Email",
    "Grupo",
    "Estatus",
  ];

  const rows = items.map((s) => [
    s.nombreCompleto,
    s.rfc,
    s.curp,
    s.cargo,
    s.dependencia,
    s.upa ?? "",
    s.cmao ?? "",
    s.ua ?? "",
    NIVEL_PROG_LABELS[s.nivelProgresion ?? 0] ?? `N${s.nivelProgresion}`,
    formatFecha(s.fechaIngreso),
    s.email ?? "",
    GRUPO_LABELS[s.grupoFuncion] ?? s.grupoFuncion,
    s.estatus === "activo" ? "Activo" : "Inactivo",
  ]);

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 33,
    styles: {
      fontSize: 6,
      cellPadding: 1.5,
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [97, 18, 50],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 6.5,
    },
    alternateRowStyles: {
      fillColor: [253, 242, 245],
    },
    margin: { left: 10, right: 10 },
  });

  doc.save(`${filename}_${fechaLocalISO()}.pdf`);
}

interface SolicitudExport {
  nombreUsuario: string;
  curp: string;
  curso: string;
  institucion?: string | null;
  bloque?: number | null;
  estado: string;
  calificacion?: number | null;
  fechaSolicitud: string | Date;
}

const ESTADO_SOLICITUD_LABELS: Record<string, string> = {
  aprobada: "Aprobada",
  completada: "Completada",
  pendiente: "Pendiente",
  rechazada: "Rechazada",
};

function prepararDatosSolicitudes(items: SolicitudExport[]) {
  return items.map((s) => ({
    Servidor: sanitizeCell(s.nombreUsuario),
    CURP: sanitizeCell(s.curp),
    Curso: sanitizeCell(s.curso),
    Institución: sanitizeCell(s.institucion ?? ""),
    Bloque: s.bloque ?? "",
    Estado: ESTADO_SOLICITUD_LABELS[s.estado] ?? s.estado,
    Calificación: s.calificacion ?? "",
    "Fecha de Inscripción": formatFechaHora(s.fechaSolicitud),
  }));
}

export function exportarSolicitudesExcel(items: SolicitudExport[], filename = "cursos_inscritos") {
  const datos = prepararDatosSolicitudes(items);
  const ws = XLSX.utils.json_to_sheet(datos);

  ws["!cols"] = [
    { wch: 30 }, // Servidor
    { wch: 20 }, // CURP
    { wch: 35 }, // Curso
    { wch: 25 }, // Institución
    { wch: 10 }, // Bloque
    { wch: 14 }, // Estado
    { wch: 12 }, // Calificación
    { wch: 16 }, // Fecha
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Cursos Inscritos");
  XLSX.writeFile(wb, `${filename}_${fechaLocalISO()}.xlsx`);
}

export function exportarSolicitudesPDF(items: SolicitudExport[], filename = "cursos_inscritos") {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });

  doc.setFontSize(16);
  doc.setTextColor(97, 18, 50);
  doc.text("Secretaría de Cultura", 14, 15);

  doc.setFontSize(11);
  doc.setTextColor(100, 116, 139);
  doc.text("Cursos Inscritos por Servidores Públicos", 14, 22);

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Generado: ${new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })} · ${items.length} registros`,
    14,
    28,
  );

  const headers = ["Servidor", "CURP", "Curso", "Institución", "Bloque", "Estado", "Calificación", "Fecha"];

  const rows = items.map((s) => [
    s.nombreUsuario,
    s.curp,
    s.curso,
    s.institucion ?? "",
    s.bloque != null ? String(s.bloque) : "",
    ESTADO_SOLICITUD_LABELS[s.estado] ?? s.estado,
    s.calificacion != null ? String(s.calificacion) : "",
    formatFechaHora(s.fechaSolicitud),
  ]);

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 33,
    styles: {
      fontSize: 7,
      cellPadding: 1.5,
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [97, 18, 50],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7.5,
    },
    alternateRowStyles: {
      fillColor: [253, 242, 245],
    },
    margin: { left: 10, right: 10 },
  });

  doc.save(`${filename}_${fechaLocalISO()}.pdf`);
}


interface CursoInscritosExport {
  nombre: string;
  bloque?: number | null;
  total: number;
}

function prepararDatosCursosPorInscritos(items: CursoInscritosExport[]) {
  return items.map((c) => ({
    Curso: sanitizeCell(c.nombre),
    Bloque: c.bloque ?? "",
    "Total Inscritos": c.total,
  }));
}

export function exportarCursosPorInscritosExcel(items: CursoInscritosExport[], filename = "cursos_por_inscritos") {
  const datos = prepararDatosCursosPorInscritos(items);
  const ws = XLSX.utils.json_to_sheet(datos);

  ws["!cols"] = [
    { wch: 40 }, // Curso
    { wch: 10 }, // Bloque
    { wch: 16 }, // Total Inscritos
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Cursos por Inscritos");
  XLSX.writeFile(wb, `${filename}_${fechaLocalISO()}.xlsx`);
}

export function exportarCursosPorInscritosPDF(items: CursoInscritosExport[], filename = "cursos_por_inscritos") {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });

  doc.setFontSize(16);
  doc.setTextColor(97, 18, 50);
  doc.text("Secretaría de Cultura", 14, 15);

  doc.setFontSize(11);
  doc.setTextColor(100, 116, 139);
  doc.text("Cursos por Número de Inscritos", 14, 22);

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Generado: ${new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })} · ${items.length} cursos`,
    14,
    28,
  );

  const headers = ["Curso", "Bloque", "Total Inscritos"];

  const rows = items.map((c) => [c.nombre, c.bloque != null ? String(c.bloque) : "", String(c.total)]);

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 33,
    styles: {
      fontSize: 8,
      cellPadding: 2,
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [97, 18, 50],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
    },
    alternateRowStyles: {
      fillColor: [253, 242, 245],
    },
    margin: { left: 10, right: 10 },
  });

  doc.save(`${filename}_${fechaLocalISO()}.pdf`);
}

interface InconformidadExport {
  nombreCompleto: string;
  curp: string;
  factor: string;
  mensaje: string;
  archivoId: number | null;
  enviadoAt: Date | string;
}

function prepararDatosInconformidades(items: InconformidadExport[]) {
  return items.map((f) => ({
    "Nombre Completo": sanitizeCell(f.nombreCompleto),
    CURP: sanitizeCell(f.curp),
    Factor: FACTOR_INCONFORMIDAD_LABELS[f.factor] ?? f.factor,
    Mensaje: sanitizeCell(f.mensaje),
    PDF: f.archivoId ? "Sí" : "No",
    "Fecha de Envío": formatFechaHora(f.enviadoAt),
  }));
}

export function exportarInconformidadesExcel(items: InconformidadExport[], filename = "inconformidades") {
  const datos = prepararDatosInconformidades(items);
  const ws = XLSX.utils.json_to_sheet(datos);
  ws["!cols"] = [
    { wch: 30 }, // Nombre
    { wch: 20 }, // CURP
    { wch: 25 }, // Factor
    { wch: 60 }, // Mensaje
    { wch: 6 },  // PDF
    { wch: 18 }, // Fecha
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Inconformidades");
  XLSX.writeFile(wb, `${filename}_${fechaLocalISO()}.xlsx`);
}

export function exportarInconformidadesPDF(items: InconformidadExport[], filename = "inconformidades") {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });

  doc.setFontSize(16);
  doc.setTextColor(97, 18, 50);
  doc.text("Secretaría de Cultura", 14, 15);

  doc.setFontSize(11);
  doc.setTextColor(100, 116, 139);
  doc.text("Inconformidades", 14, 22);

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Generado: ${new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })} · ${items.length} registros`,
    14, 28,
  );

  const headers = ["Nombre", "CURP", "Factor", "Mensaje", "PDF", "Fecha"];
  const rows = items.map((f) => [
    f.nombreCompleto,
    f.curp,
    FACTOR_INCONFORMIDAD_LABELS[f.factor] ?? f.factor,
    f.mensaje,
    f.archivoId ? "Sí" : "No",
    formatFechaHora(f.enviadoAt),
  ]);

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 33,
    columnStyles: { 3: { cellWidth: 90 } },
    styles: { fontSize: 7, cellPadding: 1.5, lineColor: [226, 232, 240], lineWidth: 0.1 },
    headStyles: {
      fillColor: [97, 18, 50],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7.5,
    },
    alternateRowStyles: {
      fillColor: [253, 242, 245],
    },
  });

  doc.save(`${filename}_${fechaLocalISO()}.pdf`);
}

interface ResultadoPromocionExport {
  trabajadorNombre: string;
  trabajadorCurp: string;
  autoevaluacion: number | "pendiente";
  jefe: number | "pendiente";
  companero1: number | "pendiente";
  companero2: number | "pendiente";
  total: number;
  completo: boolean;
}

// Decimales por componente segun su precision real de storage (ver
// drizzle/schema.ts): Autoevaluacion es decimal(4,1) (0.5pt/acierto),
// Jefe es entero (1pt/acierto), Compañero es decimal(5,3) (fraccion
// 6/14 no-terminante, ej. 2.571) -- mostrar los 4 siempre a 3 decimales
// sugiere falsa precision en Autoevaluacion/Jefe, que nunca la tienen.
function fmtResultado(v: number | "pendiente", decimales: number): string {
  return v === "pendiente" ? "Pendiente" : v.toFixed(decimales);
}

function prepararDatosResultadosPromocion(items: ResultadoPromocionExport[]) {
  return items.map((r) => ({
    "Nombre Completo": sanitizeCell(r.trabajadorNombre),
    CURP: sanitizeCell(r.trabajadorCurp),
    "Autoevaluación (14)": fmtResultado(r.autoevaluacion, 1),
    "Jefe (14)": fmtResultado(r.jefe, 0),
    "Compañero 1 (6)": fmtResultado(r.companero1, 3),
    "Compañero 2 (6)": fmtResultado(r.companero2, 3),
    "Total (40)": formatearPuntaje(r.total),
    Estado: r.completo ? "Completo" : "Pendiente",
  }));
}

export function exportarResultadosPromocionExcel(items: ResultadoPromocionExport[], filename = "resultados_promocion") {
  const datos = prepararDatosResultadosPromocion(items);
  const ws = XLSX.utils.json_to_sheet(datos);
  ws["!cols"] = [
    { wch: 30 }, // Nombre
    { wch: 20 }, // CURP
    { wch: 18 }, // Autoevaluación
    { wch: 12 }, // Jefe
    { wch: 15 }, // Compañero 1
    { wch: 15 }, // Compañero 2
    { wch: 12 }, // Total
    { wch: 12 }, // Estado
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Resultados Promoción");
  XLSX.writeFile(wb, `${filename}_${fechaLocalISO()}.xlsx`);
}

export function exportarResultadosPromocionPDF(items: ResultadoPromocionExport[], filename = "resultados_promocion") {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });

  doc.setFontSize(16);
  doc.setTextColor(97, 18, 50);
  doc.text("Secretaría de Cultura", 14, 15);

  doc.setFontSize(11);
  doc.setTextColor(100, 116, 139);
  doc.text("Resultados de Promoción", 14, 22);

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Generado: ${new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })} · ${items.length} registros`,
    14, 28,
  );

  const headers = ["Nombre", "CURP", "Autoeval. (14)", "Jefe (14)", "Comp. 1 (6)", "Comp. 2 (6)", "Total (40)", "Estado"];
  const rows = items.map((r) => [
    r.trabajadorNombre,
    r.trabajadorCurp,
    fmtResultado(r.autoevaluacion, 1),
    fmtResultado(r.jefe, 0),
    fmtResultado(r.companero1, 3),
    fmtResultado(r.companero2, 3),
    formatearPuntaje(r.total),
    r.completo ? "Completo" : "Pendiente",
  ]);

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 33,
    styles: { fontSize: 7, cellPadding: 1.5, lineColor: [226, 232, 240], lineWidth: 0.1 },
    headStyles: {
      fillColor: [97, 18, 50],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7.5,
    },
    alternateRowStyles: {
      fillColor: [253, 242, 245],
    },
  });

  doc.save(`${filename}_${fechaLocalISO()}.pdf`);
}

interface InscripcionPromocionExport {
  trabajadorNombre: string;
  trabajadorCurp: string;
  jefeNombre: string | null;
  jefePuntaje: number | null;
  companero1Nombre: string | null;
  companero1Puntaje: number | null;
  companero2Nombre: string | null;
  companero2Puntaje: number | null;
  enviadoAt: Date | string;
}

// null (no enviado) -> "Pendiente"; con puntaje real -> formatearPuntaje
// (quita ceros de cola, ej. 5.000 -> "5"), mismo criterio que Resultados
// de Promoción -- un evaluador que no ha calificado nunca se lee como "0".
function fmtCalificacion(puntaje: number | null): string {
  return puntaje === null ? "Pendiente" : formatearPuntaje(puntaje);
}

function prepararDatosInscripcionesPromocion(items: InscripcionPromocionExport[]) {
  return items.map((i) => ({
    Servidor: sanitizeCell(i.trabajadorNombre),
    CURP: sanitizeCell(i.trabajadorCurp),
    Jefe: sanitizeCell(i.jefeNombre ?? "— cuenta no encontrada"),
    "Jefe Evaluó (0-14)": fmtCalificacion(i.jefePuntaje),
    "Compañero 1": sanitizeCell(i.companero1Nombre ?? "— cuenta no encontrada"),
    "Compañero 1 Evaluó (0-6)": fmtCalificacion(i.companero1Puntaje),
    "Compañero 2": sanitizeCell(i.companero2Nombre ?? "— cuenta no encontrada"),
    "Compañero 2 Evaluó (0-6)": fmtCalificacion(i.companero2Puntaje),
    "Fecha de Inscripción": formatFechaHora(i.enviadoAt),
  }));
}

export function exportarInscripcionesPromocionExcel(items: InscripcionPromocionExport[], filename = "inscripciones_promocion") {
  const datos = prepararDatosInscripcionesPromocion(items);
  const ws = XLSX.utils.json_to_sheet(datos);
  ws["!cols"] = [
    { wch: 28 }, // Servidor
    { wch: 20 }, // CURP
    { wch: 26 }, // Jefe
    { wch: 16 }, // Jefe Evaluó (0-14)
    { wch: 26 }, // Compañero 1
    { wch: 18 }, // Compañero 1 Evaluó (0-6)
    { wch: 26 }, // Compañero 2
    { wch: 18 }, // Compañero 2 Evaluó (0-6)
    { wch: 18 }, // Fecha
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Inscripciones Promoción");
  XLSX.writeFile(wb, `${filename}_${fechaLocalISO()}.xlsx`);
}

export function exportarInscripcionesPromocionPDF(items: InscripcionPromocionExport[], filename = "inscripciones_promocion") {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });

  doc.setFontSize(16);
  doc.setTextColor(97, 18, 50);
  doc.text("Secretaría de Cultura", 14, 15);

  doc.setFontSize(11);
  doc.setTextColor(100, 116, 139);
  doc.text("Inscripciones a Promoción", 14, 22);

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Generado: ${new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })} · ${items.length} registros`,
    14, 28,
  );

  const headers = ["Servidor", "CURP", "Jefe", "Evaluó (0-14)", "Compañero 1", "Evaluó (0-6)", "Compañero 2", "Evaluó (0-6)", "Fecha"];
  const rows = items.map((i) => [
    i.trabajadorNombre,
    i.trabajadorCurp,
    i.jefeNombre ?? "— cuenta no encontrada",
    fmtCalificacion(i.jefePuntaje),
    i.companero1Nombre ?? "— cuenta no encontrada",
    fmtCalificacion(i.companero1Puntaje),
    i.companero2Nombre ?? "— cuenta no encontrada",
    fmtCalificacion(i.companero2Puntaje),
    formatFechaHora(i.enviadoAt),
  ]);

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 33,
    styles: { fontSize: 7, cellPadding: 1.5, lineColor: [226, 232, 240], lineWidth: 0.1 },
    headStyles: {
      fillColor: [97, 18, 50],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7.5,
    },
    alternateRowStyles: {
      fillColor: [253, 242, 245],
    },
  });

  doc.save(`${filename}_${fechaLocalISO()}.pdf`);
}

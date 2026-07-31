import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

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
function fechaLocalISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function prepararDatos(items: ServidorExport[]) {
  return items.map((s) => ({
    "Nombre Completo": s.nombreCompleto,
    RFC: s.rfc,
    CURP: s.curp,
    Cargo: s.cargo,
    Dependencia: s.dependencia,
    "UPA (Sector)": s.upa ?? "",
    CMAO: s.cmao ?? "",
    "UA (Dirección)": s.ua ?? "",
    "Preparación Académica": s.preparacionAcademica ?? "",
    "Nivel Progresión": NIVEL_PROG_LABELS[s.nivelProgresion ?? 0] ?? `N${s.nivelProgresion}`,
    "Fecha de Ingreso": formatFecha(s.fechaIngreso),
    "Datos de Contacto": s.datosContacto ?? "",
    "Grupo de Función": GRUPO_LABELS[s.grupoFuncion] ?? s.grupoFuncion,
    Estatus: s.estatus === "activo" ? "Activo" : "Inactivo",
    Observaciones: s.observaciones ?? "",
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
    Servidor: s.nombreUsuario,
    CURP: s.curp,
    Curso: s.curso,
    Institución: s.institucion ?? "",
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
    Curso: c.nombre,
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

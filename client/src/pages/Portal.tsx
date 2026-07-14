import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { BookOpen, ClipboardList, ArrowRight, Clock, CheckCircle2, Award, LogOut, AlertTriangle, X, Download } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const NIVEL_LABELS_PROG: Record<number, string> = { 0: "Nuevo ingreso", 1: "N1", 2: "N2", 3: "N3", 4: "N4", 5: "N5" };

interface CursoCedula {
  nombre: string;
  periodo: string;
  calificacion: number;
}

interface DatosCedula {
  nombre: string;
  curp: string;
  email: string;
  cargo: string;
  grupoFuncion: string;
  nivelProgresion: number;
  upa: string;
  cmao: string;
  ua: string;
  cursos: CursoCedula[]; // 0-2 entradas -- vacio hasta que el usuario seleccione cursos
}

function formatFechaCedula(date: string | Date) {
  const d = new Date(date);
  // timeZone: "UTC" -- fechaInicio/fechaFin son fechas de calendario puras
  // guardadas como medianoche UTC, sin esto se desfasan un dia segun la
  // timezone del navegador (ver server/db.ts, mismo bug del lado servidor).
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function loadImageBase64(url: string, trim = false): Promise<{ data: string; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const px = imageData.data;
      const threshold = 235;

      // Limpiar fondo gris claro → blanco puro (no se puede usar CSS blend-mode en PDF)
      for (let i = 0; i < px.length; i += 4) {
        if (px[i] >= threshold && px[i + 1] >= threshold && px[i + 2] >= threshold) {
          px[i] = 255;
          px[i + 1] = 255;
          px[i + 2] = 255;
        }
      }
      ctx.putImageData(imageData, 0, 0);

      if (!trim) {
        resolve({ data: canvas.toDataURL("image/jpeg", 0.95), w: canvas.width, h: canvas.height });
        return;
      }

      // Recortar el margen blanco — encontrar bounding box del contenido real
      let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const idx = (y * canvas.width + x) * 4;
          const isWhite = px[idx] >= threshold && px[idx + 1] >= threshold && px[idx + 2] >= threshold;
          if (!isWhite) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (maxX <= minX || maxY <= minY) {
        resolve({ data: canvas.toDataURL("image/jpeg", 0.95), w: canvas.width, h: canvas.height });
        return;
      }

      const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.04);
      minX = Math.max(0, minX - pad);
      minY = Math.max(0, minY - pad);
      maxX = Math.min(canvas.width, maxX + pad);
      maxY = Math.min(canvas.height, maxY + pad);

      const trimW = maxX - minX;
      const trimH = maxY - minY;
      const trimCanvas = document.createElement("canvas");
      trimCanvas.width = trimW;
      trimCanvas.height = trimH;
      const trimCtx = trimCanvas.getContext("2d")!;
      trimCtx.fillStyle = "#ffffff";
      trimCtx.fillRect(0, 0, trimW, trimH);
      trimCtx.drawImage(canvas, minX, minY, trimW, trimH, 0, 0, trimW, trimH);

      resolve({ data: trimCanvas.toDataURL("image/jpeg", 0.95), w: trimW, h: trimH });
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function generarCedula(datos: DatosCedula) {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const w = doc.internal.pageSize.getWidth();
  const margin = 14;

  const [logoCultura, sndtsc, sinac, sntsc, sintca] = await Promise.all([
    loadImageBase64("/logo-secretaria-cultura.jpeg"),
    loadImageBase64("/logo-sndtsc.jpg", true),
    loadImageBase64("/logo-sinac.jpg", true),
    loadImageBase64("/logo-sntsc.jpg", true),
    loadImageBase64("/logo-sintca.jpg", true),
  ]);

  const cultureW = 45;
  const cultureH = (logoCultura.h / logoCultura.w) * cultureW;
  doc.addImage(logoCultura.data, "JPEG", margin, 10, cultureW, cultureH);

  const boxSize = 11;
  const unionGap = 3;
  const unionLogos = [sndtsc, sinac, sntsc, sintca];
  let unionX = w - margin - boxSize * 4 - unionGap * 3;
  unionLogos.forEach((img) => {
    const ratio = img.w / img.h;
    let drawW = boxSize, drawH = boxSize;
    if (ratio > 1) drawH = boxSize / ratio;
    else drawW = boxSize * ratio;
    const offsetX = (boxSize - drawW) / 2;
    const offsetY = (boxSize - drawH) / 2;
    doc.addImage(img.data, "JPEG", unionX + offsetX, 10 + offsetY, drawW, drawH);
    unionX += boxSize + unionGap;
  });

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 20, 20);
  doc.text(
    "SISTEMA DE DESARROLLO PROFESIONAL DE CARRERA PARA EL",
    w / 2, 36, { align: "center" }
  );
  doc.text(
    "PERSONAL OPERATIVO DE BASE DE LA SECRETARÍA DE CULTURA (SDPC)",
    w / 2, 41, { align: "center" }
  );

  doc.setFillColor(97, 18, 50);
  doc.rect(margin, 46, w - margin * 2, 7, "F");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(
    "CÉDULA DE INSCRIPCIÓN A CAPACITACIÓN",
    w / 2, 51, { align: "center" }
  );

  let y = 58;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.2, textColor: [20, 20, 20] },
    head: [[{ content: "DATOS PERSONALES", colSpan: 4, styles: { fillColor: [97, 18, 50], textColor: 255, halign: "center", fontStyle: "bold" } }]],
    body: [
      [{ content: "NOMBRE:", styles: { fontStyle: "bold" } }, datos.nombre, { content: "CORREO ELECTRÓNICO:", styles: { fontStyle: "bold" } }, datos.email || "—"],
      [{ content: "CURP:", styles: { fontStyle: "bold" } }, datos.curp, { content: "CARGO:", styles: { fontStyle: "bold" } }, datos.cargo || "—"],
      [{ content: "GRUPO/FUNCIÓN:", styles: { fontStyle: "bold" } }, datos.grupoFuncion, { content: "NIVEL ACTUAL:", styles: { fontStyle: "bold" } }, NIVEL_LABELS_PROG[datos.nivelProgresion] ?? `N${datos.nivelProgresion}`],
    ],
    columnStyles: { 0: { cellWidth: 42 }, 1: { cellWidth: 75 }, 2: { cellWidth: 38 }, 3: { cellWidth: "auto" } },
  });

  y = (doc as any).lastAutoTable.finalY + 4;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.2, textColor: [20, 20, 20] },
    head: [[{ content: "DATOS DE ADSCRIPCIÓN", colSpan: 2, styles: { fillColor: [97, 18, 50], textColor: 255, halign: "center", fontStyle: "bold" } }]],
    body: [
      [{ content: "UNIDAD DE PAGO:", styles: { fontStyle: "bold", cellWidth: 50 } }, datos.upa || "—"],
      [{ content: "CLAVE DE LA CMAO:", styles: { fontStyle: "bold" } }, datos.cmao || "—"],
      [{ content: "UNIDAD ADMINISTRATIVA:", styles: { fontStyle: "bold" } }, datos.ua || "—"],
    ],
  });

  y = (doc as any).lastAutoTable.finalY + 4;

  const curso1 = datos.cursos[0];
  const curso2 = datos.cursos[1];

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.2, textColor: [20, 20, 20] },
    head: [[{ content: "DATOS DE CURSO", colSpan: 4, styles: { fillColor: [97, 18, 50], textColor: 255, halign: "center", fontStyle: "bold" } }]],
    body: [
      [{ content: "CURSO 1", styles: { fontStyle: "bold" } }, { content: curso1?.nombre ?? "", colSpan: 3 }],
      [{ content: "PERIODO DE REALIZACIÓN", styles: { fontStyle: "bold" } }, curso1?.periodo ?? "", { content: "CALIF.", styles: { fontStyle: "bold", cellWidth: 22 } }, curso1 ? String(curso1.calificacion) : ""],
      [{ content: "CURSO 2", styles: { fontStyle: "bold" } }, { content: curso2?.nombre ?? "", colSpan: 3 }],
      [{ content: "PERIODO DE REALIZACIÓN", styles: { fontStyle: "bold" } }, curso2?.periodo ?? "", { content: "CALIF.", styles: { fontStyle: "bold", cellWidth: 22 } }, curso2 ? String(curso2.calificacion) : ""],
    ],
    columnStyles: { 0: { cellWidth: 42 }, 1: { cellWidth: 75 }, 2: { cellWidth: 30 }, 3: { cellWidth: "auto" } },
  });

  doc.save(`cedula_inscripcion_${datos.curp}.pdf`);
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

const NIVEL_LABELS: Record<string, string> = {
  federal: "Federal",
  estatal: "Estatal",
  municipal: "Municipal",
  otro: "Otro",
};

export default function Portal() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [showBajaModal, setShowBajaModal] = useState(false);
  const [motivoBaja, setMotivoBaja] = useState("");
  const [bajaMsg, setBajaMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const { data: perfil, isLoading: perfilLoading } = trpc.perfil.obtener.useQuery();
  const { data: servidor } = trpc.servidores.miServidor.useQuery();
  const { data: solicitudes } = trpc.solicitudes.misSolicitudes.useQuery();
  const { data: progresoAcreditacion } = trpc.solicitudes.progresoAcreditacion.useQuery();
  const utils = trpc.useUtils();

  // Para la cedula: periodo de realizacion viene de la institucion asignada
  // al CURSO (fechaInicio/fechaFin), no de la solicitud -- esa solo se liga a
  // una institucion especifica hasta que el admin la aprueba, y la cedula debe
  // mostrar el periodo aunque la solicitud siga pendiente.
  const solicitudesOrdenadas = [...(solicitudes ?? [])].sort((a: any, b: any) => {
    const solA = a.solicitudes_curso ?? a;
    const solB = b.solicitudes_curso ?? b;
    return new Date(solA.createdAt).getTime() - new Date(solB.createdAt).getTime();
  });
  const cursoIdCedula1 = solicitudesOrdenadas[0]?.cursos?.id;
  const cursoIdCedula2 = solicitudesOrdenadas[1]?.cursos?.id;
  const { data: cursoDetalleCedula1 } = trpc.cursos.obtener.useQuery(
    { id: cursoIdCedula1! },
    { enabled: !!cursoIdCedula1 }
  );
  const { data: cursoDetalleCedula2 } = trpc.cursos.obtener.useQuery(
    { id: cursoIdCedula2! },
    { enabled: !!cursoIdCedula2 }
  );

  const solicitarBajaMut = trpc.perfil.solicitarBaja.useMutation({
    onSuccess: () => {
      setBajaMsg({ type: "success", text: "Solicitud de baja enviada. El administrador la revisará." });
      setShowBajaModal(false);
      setMotivoBaja("");
      utils.perfil.obtener.invalidate();
    },
    onError: (err) => {
      setBajaMsg({ type: "error", text: err.message });
    },
  });

  const cancelarBajaMut = trpc.perfil.cancelarBaja.useMutation({
    onSuccess: () => {
      setBajaMsg(null);
      utils.perfil.obtener.invalidate();
    },
  });

  if (!perfilLoading && perfil === null) {
    navigate("/onboarding");
    return null;
  }

  if (perfilLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  // "pendiente" nunca ocurre en la practica -- la inscripcion es directa
  // (server/db.ts: crearSolicitudConAsignacion siempre inserta estado
  // "aprobada", nunca "pendiente"). En su lugar mostramos cupos disponibles:
  // max 1 curso activo por bloque, 2 bloques -- max 2 activos a la vez.
  const MAX_CURSOS_ACTIVOS = 2;
  const aprobadas = solicitudes?.filter((s: any) => (s.solicitudes_curso ?? s).estado === "aprobada").length ?? 0;
  const completados = solicitudes?.filter((s: any) => (s.solicitudes_curso ?? s).estado === "completada").length ?? 0;
  const disponibles = Math.max(0, MAX_CURSOS_ACTIVOS - aprobadas);

  const nivelActual = servidor?.nivelProgresion ?? 0;

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={fadeUp}>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Portal de Capacitación</h1>
        <p className="mt-1 text-sm text-slate-400">Bienvenido a tu espacio de formación profesional</p>
      </motion.div>

      {/* Baja pendiente banner */}
      {perfil?.solicitudBaja && (
        <motion.div variants={fadeUp} className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Solicitud de baja pendiente</p>
              <p className="text-xs text-amber-600">Tu solicitud está siendo revisada por el administrador</p>
            </div>
          </div>
          <button
            onClick={() => cancelarBajaMut.mutate()}
            disabled={cancelarBajaMut.isPending}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
          >
            Cancelar solicitud
          </button>
        </motion.div>
      )}

      {/* Success/error message */}
      <AnimatePresence>
        {bajaMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`rounded-xl p-4 text-sm font-medium ${
              bajaMsg.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
            }`}
          >
            {bajaMsg.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Profile Card */}
      <motion.div variants={fadeUp} className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-card-rest">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{user?.nombre ?? "Usuario"}</h2>
            {servidor?.cargo && <p className="text-sm text-slate-600">{servidor.cargo}</p>}
            {servidor?.dependencia && <p className="text-sm text-slate-400">{servidor.dependencia}</p>}
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">
                Federal
              </span>
              <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {NIVEL_LABELS_PROG[nivelActual] ?? `N${nivelActual}`}
              </span>
            </div>
            {servidor?.preparacionAcademica && (
              <p className="text-xs text-slate-400">{servidor.preparacionAcademica}</p>
            )}
            {servidor?.fechaIngreso && (
              <p className="text-xs text-slate-400">Ingreso: {formatFechaCedula(servidor.fechaIngreso)}</p>
            )}
          </div>
        </div>

        {/* Accreditation Progress */}
        {progresoAcreditacion && (
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-slate-700">
                Acreditación {progresoAcreditacion.acreditado && <CheckCircle2 className="inline h-3.5 w-3.5 text-emerald-500 ml-1" />}
              </span>
              <span className="text-sm text-slate-400">
                {progresoAcreditacion.aprobados}/{progresoAcreditacion.requeridos} cursos aprobados
              </span>
            </div>
            <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${progresoAcreditacion.acreditado ? "bg-emerald-500" : "bg-linear-to-r from-amber-400 to-amber-500"}`}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (progresoAcreditacion.aprobados / progresoAcreditacion.requeridos) * 100)}%` }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
              />
            </div>
            {progresoAcreditacion.completados > progresoAcreditacion.aprobados && (
              <p className="mt-1.5 text-xs text-slate-400">
                {progresoAcreditacion.completados - progresoAcreditacion.aprobados} curso{progresoAcreditacion.completados - progresoAcreditacion.aprobados > 1 ? "s" : ""} completado{progresoAcreditacion.completados - progresoAcreditacion.aprobados > 1 ? "s" : ""} sin calificación aprobatoria
              </p>
            )}
          </div>
        )}
      </motion.div>

      {/* Stats Cards */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-card-rest">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-stat text-slate-900">{disponibles}</p>
              <p className="text-label">Cupos disponibles</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-card-rest">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-stat text-slate-900">{aprobadas}</p>
              <p className="text-label">Aprobadas</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-card-rest">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
              <Award className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-stat text-slate-900">{completados}</p>
              <p className="text-label">Completados</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Quick Links */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <button
          onClick={() => navigate("/portal/cursos")}
          className="group flex items-center justify-between rounded-2xl border border-slate-200/60 bg-white p-5 shadow-card-rest hover:border-primary-200 hover:shadow-card-hover transition-all text-left"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
              <BookOpen className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Ver Catálogo de Cursos</p>
              <p className="text-sm text-slate-400">Explora cursos disponibles</p>
            </div>
          </div>
          <ArrowRight className="h-5 w-5 text-slate-300 group-hover:text-primary-600 transition-colors" />
        </button>

        <button
          onClick={() => navigate("/portal/solicitudes")}
          className="group flex items-center justify-between rounded-2xl border border-slate-200/60 bg-white p-5 shadow-card-rest hover:border-primary-200 hover:shadow-card-hover transition-all text-left"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
              <ClipboardList className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Mis Solicitudes</p>
              <p className="text-sm text-slate-400">Revisa el estado de tus inscripciones</p>
            </div>
          </div>
          <ArrowRight className="h-5 w-5 text-slate-300 group-hover:text-primary-600 transition-colors" />
        </button>
      </motion.div>

      {/* Descargar Cédula */}
      <motion.div variants={fadeUp}>
        <button
          onClick={() => {
            if (!servidor || !user) return;

            // Cursos seleccionados por el usuario, en orden de solicitud (mas antiguo
            // primero). Sin calificacion aun -> 0. Sin cursos seleccionados -> seccion vacia.
            const detallesPorCurso = [cursoDetalleCedula1, cursoDetalleCedula2];
            const cursos = solicitudesOrdenadas.slice(0, 2).map((item: any, idx: number) => {
              const sol = item.solicitudes_curso ?? item;
              const curso = item.cursos ?? {};
              const inst = detallesPorCurso[idx]?.instituciones?.[0] as any;
              const ci = inst?.cursos_instituciones ?? inst;
              return {
                nombre: curso.nombre ?? "",
                periodo: ci?.fechaInicio && ci?.fechaFin
                  ? `${formatFechaCedula(ci.fechaInicio)} - ${formatFechaCedula(ci.fechaFin)}`
                  : "",
                calificacion: sol.calificacion ?? 0,
              };
            });

            generarCedula({
              nombre: user.nombre ?? servidor.nombreCompleto ?? "Sin nombre",
              curp: servidor.curp,
              email: servidor.email ?? "",
              cargo: servidor.cargo ?? "",
              grupoFuncion: servidor.grupoFuncion,
              nivelProgresion: servidor.nivelProgresion ?? 0,
              upa: servidor.upa ?? "",
              cmao: servidor.cmao ?? "",
              ua: servidor.ua ?? "",
              cursos,
            });
          }}
          className="flex items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-4 py-2.5 text-sm font-medium text-primary-600 hover:bg-primary-100 transition-colors"
        >
          <Download className="h-4 w-4" />
          Descargar cédula de inscripción
        </button>
      </motion.div>

      {/* Solicitar Baja */}
      {!perfil?.solicitudBaja && (
        <motion.div variants={fadeUp}>
          <button
            onClick={() => setShowBajaModal(true)}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Solicitar baja del sistema
          </button>
        </motion.div>
      )}

      {/* Baja Modal */}
      <AnimatePresence>
        {showBajaModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={() => setShowBajaModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50">
                    <AlertTriangle className="h-5 w-5 text-rose-500" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-900">Solicitar Baja</h2>
                </div>
                <button onClick={() => setShowBajaModal(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <p className="text-sm text-slate-500 mb-4">
                Esta solicitud será revisada por el administrador. Tu cuenta permanecerá activa hasta que sea aprobada.
              </p>

              <div className="mb-4">
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Motivo de la baja *
                </label>
                <textarea
                  value={motivoBaja}
                  onChange={(e) => setMotivoBaja(e.target.value)}
                  placeholder="Describe el motivo de tu solicitud..."
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-300 focus:ring-2 focus:ring-primary-100 focus:outline-none resize-none"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowBajaModal(false)}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => solicitarBajaMut.mutate({ motivo: motivoBaja })}
                  disabled={solicitarBajaMut.isPending || motivoBaja.trim().length < 5}
                  className="flex-1 rounded-xl bg-rose-500 py-2.5 text-sm font-semibold text-white hover:bg-rose-600 disabled:opacity-50 transition-colors"
                >
                  {solicitarBajaMut.isPending ? "Enviando..." : "Enviar Solicitud"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

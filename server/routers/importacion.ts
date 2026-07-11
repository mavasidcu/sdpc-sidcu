import { z } from "zod";
import { router } from "../trpc";
import { protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { crearServidor, crearAuditoria, getDb } from "../db";
import { eq, or } from "drizzle-orm";
import * as schema from "../../drizzle/schema";
import { capitalizarNombre } from "../../shared/utils";
import { GRUPOS_FUNCION, NIVELES } from "../../shared/const";

function requireRole(...roles: string[]) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (!roles.includes(ctx.user.role)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "No tienes permisos para esta acción",
      });
    }
    return next({ ctx });
  });
}

// Busca un valor en la fila probando varios nombres de columna posibles,
// ignorando mayúsculas/acentos (formatos reales como "ANTIGÜEDAD", "UP", "PUESTO" varían).
const normalizar = (s: string) => s.toString().trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
function buscarCampo(row: Record<string, any>, ...nombres: string[]): string | undefined {
  const entradas = Object.entries(row);
  for (const nombre of nombres) {
    const nombreNorm = normalizar(nombre);
    const encontrado = entradas.find(([k]) => normalizar(k) === nombreNorm);
    if (encontrado && encontrado[1] !== undefined && encontrado[1] !== null && encontrado[1].toString().trim() !== "") {
      return encontrado[1].toString();
    }
  }
  return undefined;
}

// Convierte fechas en formato DD/MM/YYYY (formato de Excel/CSV) a ISO para que Date las parsee bien.
function parseFechaDDMMYYYY(valor: string | undefined): string | null {
  if (!valor) return null;
  const texto = valor.toString().trim();
  if (!texto) return null;
  const match = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const isoCandidato = match
    ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`
    : texto;
  return isNaN(new Date(isoCandidato).getTime()) ? null : isoCandidato;
}

// El CSV real trae "grupo función" como texto humano (ej. "Técnico",
// "Administrativo"), no como el código de 4 letras que usa el enum de DB
// (TECN, ADMO...). Sin este mapeo, cualquier valor que no calce exacto con
// el código pasaba silencioso como z.string() y quedaba mal escrito en DB
// (o tronaba el insert dependiendo del sql_mode) -- el admin nunca se enteraba
// de cuál fila quedó con el grupo equivocado.
const GRUPO_FUNCION_SINONIMOS: Record<string, typeof GRUPOS_FUNCION[number]> = {
  ADMO: "ADMO", ADMINISTRATIVO: "ADMO", ADMINISTRATIVA: "ADMO",
  TECN: "TECN", TECNICO: "TECN", TECNICA: "TECN",
  SERV: "SERV", SERVICIOS: "SERV", SERVICIO: "SERV",
  COMUN: "COMUN", COMUNICACION: "COMUN",
  PROFE: "PROFE", PROFESIONAL: "PROFE",
  EDU: "EDU", EDUCACION: "EDU", EDUCATIVO: "EDU", EDUCATIVA: "EDU",
};
function normalizarGrupoFuncion(valor: string | undefined): string | undefined {
  if (!valor) return undefined;
  const clave = valor.toString().trim().toUpperCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, ""); // quita acentos
  return GRUPO_FUNCION_SINONIMOS[clave];
}

// Filas sin RFC/CURP real reciben un placeholder PENDxxxxxxxxx (ver más abajo) --
// esas no deben pasar por el regex estricto, solo los valores reales tomados del CSV.
const rfcSchema = z.string().refine(
  (v) => v.startsWith("PEND") || /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(v),
  "RFC inválido",
);
const curpSchema = z.string().refine(
  (v) => v.startsWith("PEND") || /^[A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]\d$/.test(v),
  "CURP inválido",
);

const registroImportSchema = z.object({
  nombreCompleto: z.string(),
  rfc: rfcSchema,
  curp: curpSchema,
  cargo: z.string(),
  dependencia: z.string(),
  nivel: z.enum(NIVELES),
  fechaIngreso: z.string(),
  datosContacto: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  grupoFuncion: z.enum(GRUPOS_FUNCION),
  estatus: z.enum(["activo", "inactivo"]),
  observaciones: z.string().nullable().optional(),
  preparacionAcademica: z.string().nullable().optional(),
});

export const importacionRouter = router({
  validar: requireRole("admin", "capturista")
    .input(z.object({ registros: z.array(z.record(z.string(), z.any())) }))
    .mutation(({ input }) => {
      // Solo previsualiza: cualquier campo faltante se autocompleta en "importar",
      // así que aquí solo se marca inválida una fila vacía o sin nombre/CURP reconocible.
      const resultados = input.registros.map((row, index) => {
        const vacia = Object.values(row).every((v) => !v || v.toString().trim() === "");
        if (vacia) {
          return { fila: index + 1, valido: false as const, data: row, errores: ["Fila vacía"] };
        }
        const nombreCompleto = buscarCampo(row, "nombreCompleto", "nombre_completo", "nombre");
        const curp = buscarCampo(row, "curp");
        if (!nombreCompleto && !curp) {
          return { fila: index + 1, valido: false as const, data: row, errores: ["No se reconoce nombre ni CURP en esta fila"] };
        }
        return { fila: index + 1, valido: true as const, data: row, errores: [] };
      });

      return {
        total: resultados.length,
        validos: resultados.filter((r) => r.valido).length,
        invalidos: resultados.filter((r) => !r.valido).length,
        resultados,
      };
    }),

  importar: requireRole("admin", "capturista")
    .input(z.object({
      registros: z.array(z.record(z.string(), z.any())),
      // Todo el archivo es de un solo programa -- se elige antes de subir
      // el CSV, no fila por fila (mismo patrón que cursos.importar).
      programa: z.enum(["PAC", "SPC", "SDPC"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const BATCH_SIZE = 50;
      const creados: number[] = [];
      const errores: { fila: number; error: string }[] = [];
      const curpsVistos = new Set<string>();
      const rfcsVistos = new Set<string>();

      for (let i = 0; i < input.registros.length; i++) {
        const row = input.registros[i];
        const nivelProgRaw = (buscarCampo(row, "nivelProgresion", "nivel_progresion", "nivelP", "nivel") || "0").toString().trim();
        const nivelProgresion = nivelProgRaw.toUpperCase().startsWith("N") ? Number(nivelProgRaw.slice(1)) : Number(nivelProgRaw) || 0;

        const upa = (buscarCampo(row, "upa", "up") || "").toString().toUpperCase().trim() || "SIN ASIGNAR";
        const cmao = (buscarCampo(row, "cmao") || "").toString().toUpperCase().trim() || "SIN ASIGNAR";
        const ua = (buscarCampo(row, "ua") || "").toString().trim() || "Sin asignar";
        const preparacionAcademica = buscarCampo(row, "preparacionAcademica", "preparacion_academica", "preparacion academica") || null;

        // ANTIGÜEDAD en el formato real = fecha de ingreso del servidor
        const fechaIngresoRaw = buscarCampo(row, "fechaIngreso", "fecha_ingreso", "antiguedad", "antigüedad");

        const nombreRaw = buscarCampo(row, "nombreCompleto", "nombre_completo", "nombre");
        const grupoFuncionRaw = buscarCampo(row, "grupoFuncion", "grupo_funcion", "grupo funcion", "grupo/funcion");
        const grupoFuncionNormalizado = normalizarGrupoFuncion(grupoFuncionRaw);
        // Columna vacía -> default ADMO (comportamiento previo). Columna con
        // texto no reconocido -> error explícito en vez de default silencioso,
        // para que el admin vea exactamente qué fila trae el dato mal escrito.
        if (grupoFuncionRaw && !grupoFuncionNormalizado) {
          errores.push({ fila: i + 1, error: `Grupo de función "${grupoFuncionRaw}" no reconocido (usar: ${GRUPOS_FUNCION.join(", ")})` });
          continue;
        }

        const reg = registroImportSchema.safeParse({
          nombreCompleto: nombreRaw ? capitalizarNombre(nombreRaw) : "Por definir",
          rfc: buscarCampo(row, "rfc") || `PEND${String(i + 1).padStart(9, "0")}`,
          curp: buscarCampo(row, "curp") || `PEND${String(i + 1).padStart(14, "0")}`,
          cargo: buscarCampo(row, "cargo", "puesto") || "Por definir",
          // El formato real no trae columna "dependencia" explícita — la UA (unidad administrativa)
          // es la dependencia real del servidor dentro de la Secretaría de Cultura.
          dependencia: buscarCampo(row, "dependencia") || (ua !== "Sin asignar" ? ua : "Por definir"),
          nivel: "federal",
          fechaIngreso: parseFechaDDMMYYYY(fechaIngresoRaw) || new Date().toISOString().split("T")[0],
          grupoFuncion: grupoFuncionNormalizado ?? "ADMO",
          datosContacto: buscarCampo(row, "datosContacto", "datos_contacto") || "Sin datos",
          email: buscarCampo(row, "email", "correo", "correo electronico") || null,
          estatus: (buscarCampo(row, "estatus") || "activo").toLowerCase() === "inactivo" ? "inactivo" : "activo",
          observaciones: buscarCampo(row, "observaciones") || "Sin observaciones",
          preparacionAcademica,
        });

        if (!reg.success) {
          errores.push({
            fila: i + 1,
            error: reg.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", "),
          });
          continue;
        }

        const curp = reg.data.curp.toUpperCase();
        const rfc = reg.data.rfc.toUpperCase();

        if (curpsVistos.has(curp) && !curp.startsWith("PEND")) {
          errores.push({ fila: i + 1, error: `CURP "${curp}" duplicado en el mismo archivo (fila anterior)` });
          continue;
        }
        if (rfcsVistos.has(rfc) && !rfc.startsWith("PEND")) {
          errores.push({ fila: i + 1, error: `RFC "${rfc}" duplicado en el mismo archivo (fila anterior)` });
          continue;
        }
        curpsVistos.add(curp);
        rfcsVistos.add(rfc);

        const d = await getDb();
        const [existente] = await d.select({ id: schema.servidoresPublicos.id, estatus: schema.servidoresPublicos.estatus, curp: schema.servidoresPublicos.curp })
          .from(schema.servidoresPublicos)
          .where(
            or(
              eq(schema.servidoresPublicos.curp, curp),
              ...(!rfc.startsWith("PEND") ? [eq(schema.servidoresPublicos.rfc, rfc)] : [])
            )
          );
        if (existente) {
          if (existente.estatus === "inactivo") {
            errores.push({ fila: i + 1, error: `CURP "${curp}" pertenece a un servidor dado de baja — no se puede reimportar` });
            continue;
          }
          errores.push({ fila: i + 1, error: `Servidor con CURP "${curp}" ya registrado — se omitió` });
          continue;
        }

        try {
          const id = await crearServidor({
            ...reg.data,
            fechaIngreso: new Date(reg.data.fechaIngreso),
            datosContacto: reg.data.datosContacto ?? null,
            observaciones: reg.data.observaciones ?? null,
            upa,
            cmao,
            ua,
            nivelProgresion,
            programa: input.programa,
            creadoPor: ctx.user.id,
            actualizadoPor: ctx.user.id,
          } as any);

          await crearAuditoria({
            servidorId: id,
            usuarioId: ctx.user.id,
            accion: "crear",
            cambiosAnteriores: null,
            cambiosPosterior: JSON.stringify(reg),
            descripcion: `Servidor "${reg.data.nombreCompleto}" importado via CSV por ${ctx.user.nombre ?? ctx.user.email ?? ctx.user.id}`,
          });

          creados.push(id);
        } catch (err: any) {
          const msg = err.message ?? "Error desconocido";
          let error = msg;
          if (msg.includes("Duplicate")) {
            if (msg.includes("rfc")) error = `RFC "${reg.data.rfc}" ya existe en el sistema`;
            else if (msg.includes("curp")) error = `CURP "${reg.data.curp}" ya existe en el sistema`;
            else error = "Registro duplicado (RFC o CURP ya existe)";
          }
          errores.push({ fila: i + 1, error });
        }
      }

      return {
        totalProcesados: input.registros.length,
        creados: creados.length,
        errores,
      };
    }),
});

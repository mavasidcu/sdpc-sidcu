import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedureSinRestriccion, adminProcedure } from "../trpc";
import {
  elegibilidadPromocion,
  yaInscritoPromocion,
  confirmarInscripcion,
  buscarEnPoolPromocion,
  poolPromocionTieneRegistros,
  importarFilaEvaluador,
  listarInscripcionesPromocion,
  listarResultadosPromocion,
  reasignarEvaluadorPromocion,
  listarCorreosFallidosPromocion,
  reintentarCorreoPromocion,
  listarPoolPromocion,
  moverRolPoolPromocion,
  quitarDelPoolPromocion,
  obtenerConfigModuloPromocion,
  moduloPromocionHabilitado,
  actualizarModuloPromocionManual,
  programarVentanaModuloPromocion,
} from "../db";

type ErrorCodigoConfirmar = "NO_ELEGIBLE" | "YA_INSCRITO" | "SELECCION_INVALIDA" | "CORREO_INVALIDO";

function traducirErrorConfirmar(error: ErrorCodigoConfirmar): TRPCError {
  switch (error) {
    case "NO_ELEGIBLE":
      return new TRPCError({ code: "FORBIDDEN", message: "No cumples el requisito de calificación para inscribirte." });
    case "SELECCION_INVALIDA":
      return new TRPCError({ code: "BAD_REQUEST", message: "Alguno de los evaluadores elegidos no es válido. Vuelve a elegir." });
    case "YA_INSCRITO":
      return new TRPCError({ code: "CONFLICT", message: "Ya estás inscrito a Promoción." });
    case "CORREO_INVALIDO":
      return new TRPCError({ code: "BAD_REQUEST", message: "Alguno de los correos capturados no es válido o su dominio no existe." });
    default: {
      const _exhaustivo: never = error;
      return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Error inesperado." });
    }
  }
}

type ErrorCodigoReasignar = "PROMOCION_NO_ENCONTRADA" | "SELECCION_INVALIDA" | "CORREO_INVALIDO" | "EVALUACION_YA_ENVIADA" | "REASIGNACION_CONCURRENTE";

function traducirErrorReasignar(error: ErrorCodigoReasignar): TRPCError {
  switch (error) {
    case "PROMOCION_NO_ENCONTRADA":
      return new TRPCError({ code: "NOT_FOUND", message: "Inscripción no encontrada." });
    case "SELECCION_INVALIDA":
      return new TRPCError({ code: "BAD_REQUEST", message: "Ese servidor no es válido para este puesto (no está en el pool del rol, o ya ocupa otro lugar en esta inscripción)." });
    case "CORREO_INVALIDO":
      return new TRPCError({ code: "BAD_REQUEST", message: "El correo capturado no es válido o su dominio no existe." });
    case "EVALUACION_YA_ENVIADA":
      return new TRPCError({ code: "CONFLICT", message: "Ese evaluador ya envió su evaluación; no se puede reasignar." });
    case "REASIGNACION_CONCURRENTE":
      return new TRPCError({ code: "CONFLICT", message: "Otra reasignación se procesó al mismo tiempo para este puesto. Intenta de nuevo." });
    default: {
      const _exhaustivo: never = error;
      return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Error inesperado." });
    }
  }
}

const evaluadorSeleccionSchema = z.object({
  curp: z.string().length(18),
  nombre: z.string().min(2),
  correo: z.string().email(),
});

const filaImportSchema = z.object({ registros: z.array(z.record(z.string(), z.any())) });

// "Pausa total": mientras el modulo esta deshabilitado, ningun trabajador
// nuevo puede confirmar inscripcion. Lectura (miElegibilidad, buscarEnPool)
// sigue abierta y una inscripcion ya confirmada nunca se toca -- mismo
// criterio que exigirModuloHabilitado en inconformidad.ts.
async function exigirModuloHabilitado(): Promise<void> {
  if (!(await moduloPromocionHabilitado())) {
    throw new TRPCError({ code: "FORBIDDEN", message: "El módulo Promoción no está disponible en este momento." });
  }
}

export const promocionRouter = router({
  moduloHabilitado: protectedProcedureSinRestriccion.query(async () => {
    return moduloPromocionHabilitado();
  }),

  moduloConfig: adminProcedure.query(async () => {
    return obtenerConfigModuloPromocion();
  }),

  actualizarModulo: adminProcedure
    .input(z.object({ habilitado: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await actualizarModuloPromocionManual(input.habilitado, ctx.user.id);
      return { success: true };
    }),

  programarVentanaModulo: adminProcedure
    .input(z.object({
      fechaDesde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
      fechaHasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
    }).refine((v) => v.fechaHasta >= v.fechaDesde, {
      message: '"Hasta" no puede ser antes que "Desde".',
      path: ["fechaHasta"],
    }))
    .mutation(async ({ ctx, input }) => {
      await programarVentanaModuloPromocion(input.fechaDesde, input.fechaHasta, ctx.user.id);
      return { success: true };
    }),

  miElegibilidad: protectedProcedureSinRestriccion.query(async ({ ctx }) => {
    const [elegibilidad, yaInscrito] = await Promise.all([
      elegibilidadPromocion(ctx.user.id),
      yaInscritoPromocion(ctx.user.id),
    ]);
    return { ...elegibilidad, yaInscrito };
  }),

  // M4: excluirUserId opcional -- por defecto excluye al propio llamante
  // (caso del trabajador buscando sus 3 evaluadores, donde nunca debe verse
  // a si mismo). El panel admin (GestionPromocion.tsx, reasignacion por
  // baja) pasa el userId del TRABAJADOR de la inscripcion en cuestion en vez
  // del suyo -- antes excluia al admin (su propio ctx.user.id), que no es a
  // quien hay que excluir en ese flujo. Bajo impacto si se omite (el select
  // solo filtra resultados de busqueda; reasignarEvaluadorPromocion vuelve a
  // validar todo server-side de cualquier forma), por eso protectedProcedure
  // basta -- no hace falta restringir el override a adminProcedure.
  buscarEnPool: protectedProcedureSinRestriccion
    .input(z.object({ q: z.string().min(2), rol: z.enum(["jefe", "companero"]), excluirUserId: z.number().int().positive().optional() }))
    .query(async ({ ctx, input }) => buscarEnPoolPromocion(input.q, input.rol, input.excluirUserId ?? ctx.user.id)),

  poolTieneRegistros: protectedProcedureSinRestriccion
    .input(z.object({ rol: z.enum(["jefe", "companero"]) }))
    .query(async ({ input }) => poolPromocionTieneRegistros(input.rol)),

  confirmarInscripcion: protectedProcedureSinRestriccion
    .input(z.object({
      jefe: evaluadorSeleccionSchema,
      companero1: evaluadorSeleccionSchema,
      companero2: evaluadorSeleccionSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      await exigirModuloHabilitado();
      const resultado = await confirmarInscripcion(ctx.user.id, input);
      if (!resultado.ok) throw traducirErrorConfirmar(resultado.error);
      return { success: true };
    }),

  importarEvaluadores: adminProcedure
    .input(z.object({ rol: z.enum(["jefe", "companero"]), ...filaImportSchema.shape }))
    .mutation(async ({ ctx, input }) => {
      let creados = 0;
      const errores: { fila: number; error: string }[] = [];
      const advertencias: { fila: number; advertencia: string }[] = [];
      for (let i = 0; i < input.registros.length; i++) {
        const row = input.registros[i];
        const curp = (row["curp"] ?? "").toString().trim();
        const nombre = (row["nombre"] ?? "").toString().trim();
        const correo = (row["correo"] ?? "").toString().trim() || undefined;
        const rfc = (row["rfc"] ?? "").toString().trim() || undefined;
        if (!curp || !nombre) {
          errores.push({ fila: i + 1, error: "Faltan columnas curp/nombre" });
          continue;
        }
        try {
          const resultado = await importarFilaEvaluador(curp, nombre, input.rol, correo, ctx.user.id, rfc);
          if (resultado.ok) {
            creados++;
            if (resultado.advertencia) advertencias.push({ fila: i + 1, advertencia: resultado.advertencia });
          } else {
            errores.push({ fila: i + 1, error: resultado.error });
          }
        } catch (err: any) {
          errores.push({ fila: i + 1, error: err.message ?? "Error inesperado al importar esta fila" });
        }
      }
      return { totalProcesados: input.registros.length, creados, errores, advertencias };
    }),

  listarInscripciones: adminProcedure
    .input(z.object({
      search: z.string().optional(),
      page: z.number().int().positive().default(1),
      limit: z.number().int().positive().max(100).default(20),
    }))
    .query(async ({ input }) => listarInscripcionesPromocion(input)),

  listarResultados: adminProcedure
    .input(z.object({
      search: z.string().optional(),
      estado: z.enum(["completo", "pendiente"]).optional(),
      ordenTotal: z.enum(["asc", "desc"]).optional(),
      page: z.number().int().positive().default(1),
      limit: z.number().int().positive().max(100).default(20),
    }))
    .query(async ({ input }) => listarResultadosPromocion(input)),

  reasignarEvaluador: adminProcedure
    .input(z.object({
      promocionId: z.number(),
      rol: z.enum(["jefe", "companero1", "companero2"]),
      nuevoCurp: z.string().length(18),
      nuevoNombre: z.string().min(2),
      correo: z.string().email(),
    }))
    .mutation(async ({ ctx, input }) => {
      const resultado = await reasignarEvaluadorPromocion(input.promocionId, input.rol, input.nuevoCurp, input.nuevoNombre, input.correo, ctx.user.id);
      if (!resultado.ok) throw traducirErrorReasignar(resultado.error);
      return { success: true };
    }),

  listarPool: adminProcedure
    .input(z.object({
      rol: z.enum(["jefe", "companero"]),
      search: z.string().optional(),
      page: z.number().int().positive().default(1),
      limit: z.number().int().positive().max(100).default(20),
    }))
    .query(async ({ input }) => listarPoolPromocion(input.rol, input)),

  moverRolPool: adminProcedure
    .input(z.object({
      curp: z.string().length(18),
      rolActual: z.enum(["jefe", "companero"]),
      rolNuevo: z.enum(["jefe", "companero"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const resultado = await moverRolPoolPromocion(input.curp, input.rolActual, input.rolNuevo, ctx.user.id);
      if (!resultado.ok) {
        throw new TRPCError({
          code: resultado.error === "NO_ENCONTRADO" ? "NOT_FOUND" : "CONFLICT",
          message: resultado.error === "NO_ENCONTRADO" ? "No se encontró en ese pool." : "Ya está en el pool destino.",
        });
      }
      return { success: true };
    }),

  quitarDelPool: adminProcedure
    .input(z.object({ curp: z.string().length(18), rol: z.enum(["jefe", "companero"]) }))
    .mutation(async ({ input }) => {
      const resultado = await quitarDelPoolPromocion(input.curp, input.rol);
      if (!resultado.ok) throw new TRPCError({ code: "NOT_FOUND", message: "No se encontró en ese pool." });
      return { success: true };
    }),

  listarCorreosFallidos: adminProcedure.query(async () => listarCorreosFallidosPromocion()),

  reintentarCorreo: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await reintentarCorreoPromocion(input.id);
      return { success: true };
    }),
});

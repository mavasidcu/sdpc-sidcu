import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import {
  listarMisEvaluacionesPendientes,
  miEvaluacion,
  iniciarEvaluacion,
  enviarEvaluacion,
  importarFilaPreguntaEvaluador,
  contarPreguntasActivasEvaluador,
  listarPreguntasEvaluador,
  actualizarPreguntaEvaluador,
  eliminarPreguntaEvaluador,
  obtenerConfigModuloEvaluadores,
  moduloEvaluadoresHabilitado,
  actualizarModuloEvaluadoresManual,
  programarVentanaModuloEvaluadores,
} from "../db";
import { LIKERT_OPCIONES, EVALUADOR_ROLES_BANCO } from "../../drizzle/schema";
import { PREGUNTAS_EVALUADOR } from "../../shared/const";

type ErrorCodigoIniciar = "NO_ENCONTRADA" | "AJENA" | "YA_INICIADA" | "BANCO_INSUFICIENTE";
type ErrorCodigoEnviar = "NO_ENCONTRADA" | "AJENA" | "NO_INICIADA" | "YA_ENVIADA" | "RESPUESTAS_INVALIDAS";

function traducirErrorIniciar(error: ErrorCodigoIniciar): TRPCError {
  switch (error) {
    case "NO_ENCONTRADA":
      return new TRPCError({ code: "NOT_FOUND", message: "Esa evaluación no existe." });
    case "AJENA":
      return new TRPCError({ code: "FORBIDDEN", message: "Esa evaluación no te corresponde." });
    case "YA_INICIADA":
      return new TRPCError({ code: "CONFLICT", message: "Ya iniciaste esta evaluación." });
    case "BANCO_INSUFICIENTE":
      return new TRPCError({ code: "PRECONDITION_FAILED", message: "El banco de preguntas todavía no está listo. Contacta al administrador." });
    default: {
      const _exhaustivo: never = error;
      return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Error inesperado." });
    }
  }
}

function traducirErrorEnviar(error: ErrorCodigoEnviar): TRPCError {
  switch (error) {
    case "NO_ENCONTRADA":
      return new TRPCError({ code: "NOT_FOUND", message: "Esa evaluación no existe." });
    case "AJENA":
      return new TRPCError({ code: "FORBIDDEN", message: "Esa evaluación no te corresponde." });
    case "NO_INICIADA":
      return new TRPCError({ code: "BAD_REQUEST", message: "Todavía no has iniciado esta evaluación." });
    case "YA_ENVIADA":
      return new TRPCError({ code: "CONFLICT", message: "Esta evaluación ya fue enviada." });
    case "RESPUESTAS_INVALIDAS":
      return new TRPCError({ code: "BAD_REQUEST", message: "Las respuestas no corresponden a tu sorteo de preguntas. Recarga la página e intenta de nuevo." });
    default: {
      const _exhaustivo: never = error;
      return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Error inesperado." });
    }
  }
}

const filaImportSchema = z.object({ rol: z.enum(EVALUADOR_ROLES_BANCO), registros: z.array(z.record(z.string(), z.any())) });

// "Pausa total": mientras el modulo esta deshabilitado, ningun evaluador
// puede INICIAR su evaluacion -- aunque ya haya sido seleccionado
// (requisito real cumplido). Lectura (misPendientes, miEvaluacion) y lo ya
// iniciado/enviado nunca se tocan -- mismo criterio que
// exigirModuloHabilitado en autoevaluacion.ts/promocion.ts.
async function exigirModuloHabilitado(): Promise<void> {
  if (!(await moduloEvaluadoresHabilitado())) {
    throw new TRPCError({ code: "FORBIDDEN", message: "El módulo Evaluadores no está disponible en este momento." });
  }
}

export const evaluadoresRouter = router({
  misPendientes: protectedProcedure.query(({ ctx }) => listarMisEvaluacionesPendientes(ctx.user.id)),

  miEvaluacion: protectedProcedure
    .input(z.object({ evaluacionId: z.number().int().positive() }))
    .query(({ ctx, input }) => miEvaluacion(ctx.user.id, input.evaluacionId)),

  iniciar: protectedProcedure
    .input(z.object({ evaluacionId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await exigirModuloHabilitado();
      const resultado = await iniciarEvaluacion(ctx.user.id, input.evaluacionId);
      if (!resultado.ok) throw traducirErrorIniciar(resultado.error);
      return { success: true };
    }),

  enviar: protectedProcedure
    .input(z.object({
      evaluacionId: z.number().int().positive(),
      respuestas: z.array(z.object({
        preguntaId: z.number().int().positive(),
        respuestaElegida: z.enum(LIKERT_OPCIONES),
      })).length(PREGUNTAS_EVALUADOR, `Debes contestar las ${PREGUNTAS_EVALUADOR} preguntas`),
    }))
    .mutation(async ({ ctx, input }) => {
      const resultado = await enviarEvaluacion(ctx.user.id, input.evaluacionId, input.respuestas);
      if (!resultado.ok) throw traducirErrorEnviar(resultado.error);
      // No regresar puntaje -- el evaluador nunca lo ve.
      return { success: true };
    }),

  importarPreguntas: adminProcedure
    .input(filaImportSchema)
    .mutation(async ({ input }) => {
      let creados = 0;
      const errores: { fila: number; error: string }[] = [];
      for (let i = 0; i < input.registros.length; i++) {
        const row = input.registros[i];
        const texto = (row["texto"] ?? "").toString();
        const respuestaCorrecta = (row["respuesta_correcta"] ?? "").toString();
        const resultado = await importarFilaPreguntaEvaluador(input.rol, texto, respuestaCorrecta);
        if (resultado.ok) creados++;
        else errores.push({ fila: i + 1, error: resultado.error });
      }
      return { totalProcesados: input.registros.length, creados, errores };
    }),

  contarActivas: adminProcedure
    .input(z.object({ rol: z.enum(EVALUADOR_ROLES_BANCO) }))
    .query(({ input }) => contarPreguntasActivasEvaluador(input.rol)),

  listarPreguntas: adminProcedure
    .input(z.object({ rol: z.enum(EVALUADOR_ROLES_BANCO) }))
    .query(({ input }) => listarPreguntasEvaluador(input.rol)),

  actualizarPregunta: adminProcedure
    .input(z.object({
      id: z.number().int().positive(),
      texto: z.string().min(1).max(500),
      respuestaCorrecta: z.enum(LIKERT_OPCIONES),
      activo: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const resultado = await actualizarPreguntaEvaluador(input.id, input.texto, input.respuestaCorrecta, input.activo);
      if (!resultado.ok) throw new TRPCError({ code: "BAD_REQUEST", message: resultado.error });
      return { success: true };
    }),

  // Reusa importarFilaPreguntaEvaluador -- misma validacion (texto no
  // vacio, respuesta_correcta Likert valida) que ya usa el CSV, solo que
  // para una fila capturada a mano en vez de un import masivo.
  crearPregunta: adminProcedure
    .input(z.object({ rol: z.enum(EVALUADOR_ROLES_BANCO), texto: z.string().min(1).max(500), respuestaCorrecta: z.enum(LIKERT_OPCIONES) }))
    .mutation(async ({ input }) => {
      const resultado = await importarFilaPreguntaEvaluador(input.rol, input.texto, input.respuestaCorrecta);
      if (!resultado.ok) throw new TRPCError({ code: "BAD_REQUEST", message: resultado.error });
      return { success: true };
    }),

  eliminarPregunta: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const resultado = await eliminarPreguntaEvaluador(input.id);
      if (!resultado.ok) {
        throw new TRPCError({ code: "CONFLICT", message: "No se puede eliminar, ya fue usada en una evaluación. Desactívala en vez de borrarla." });
      }
      return { success: true };
    }),

  moduloConfig: adminProcedure.query(async () => {
    return obtenerConfigModuloEvaluadores();
  }),

  moduloHabilitado: protectedProcedure.query(async () => {
    return moduloEvaluadoresHabilitado();
  }),

  actualizarModulo: adminProcedure
    .input(z.object({ habilitado: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await actualizarModuloEvaluadoresManual(input.habilitado, ctx.user.id);
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
      await programarVentanaModuloEvaluadores(input.fechaDesde, input.fechaHasta, ctx.user.id);
      return { success: true };
    }),
});

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedureSinRestriccion, adminProcedure } from "../trpc";
import {
  miAutoevaluacion,
  iniciarAutoevaluacion,
  enviarAutoevaluacion,
  importarFilaPreguntaAutoevaluacion,
  contarPreguntasActivasAutoevaluacion,
  listarPreguntasAutoevaluacion,
  actualizarPreguntaAutoevaluacion,
  eliminarPreguntaAutoevaluacion,
  obtenerConfigModuloAutoevaluacion,
  moduloAutoevaluacionHabilitado,
  actualizarModuloAutoevaluacionManual,
  programarVentanaModuloAutoevaluacion,
} from "../db";
import { LIKERT_OPCIONES } from "../../drizzle/schema";
import { PREGUNTAS_AUTOEVALUACION } from "../../shared/const";

type ErrorCodigoIniciar = "SIN_PROMOCION" | "YA_INICIADA" | "BANCO_INSUFICIENTE";
type ErrorCodigoEnviar = "NO_INICIADA" | "YA_ENVIADA" | "RESPUESTAS_INVALIDAS";

function traducirErrorIniciar(error: ErrorCodigoIniciar): TRPCError {
  switch (error) {
    case "SIN_PROMOCION":
      return new TRPCError({ code: "FORBIDDEN", message: "Necesitas tener una inscripción a Promoción confirmada para hacer tu autoevaluación." });
    case "YA_INICIADA":
      return new TRPCError({ code: "CONFLICT", message: "Ya iniciaste tu autoevaluación." });
    case "BANCO_INSUFICIENTE":
      // tRPC 11 no tiene un codigo "FAILED_PRECONDITION" (el que menciona el
      // finding original) -- el codigo real en @trpc/server es
      // "PRECONDITION_FAILED" (ver codes-DagpWZLc.mjs), que es el equivalente
      // correcto para "el banco de preguntas no esta listo todavia".
      return new TRPCError({ code: "PRECONDITION_FAILED", message: "El banco de preguntas todavía no está listo. Contacta al administrador e intenta más tarde." });
    default: {
      const _exhaustivo: never = error;
      return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Error inesperado." });
    }
  }
}

function traducirErrorEnviar(error: ErrorCodigoEnviar): TRPCError {
  switch (error) {
    case "NO_INICIADA":
      return new TRPCError({ code: "BAD_REQUEST", message: "Todavía no has iniciado tu autoevaluación." });
    case "YA_ENVIADA":
      return new TRPCError({ code: "CONFLICT", message: "Tu autoevaluación ya fue enviada." });
    case "RESPUESTAS_INVALIDAS":
      return new TRPCError({ code: "BAD_REQUEST", message: "Las respuestas no corresponden a tu sorteo de preguntas. Recarga la página e intenta de nuevo." });
    default: {
      const _exhaustivo: never = error;
      return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Error inesperado." });
    }
  }
}

const filaImportSchema = z.object({ registros: z.array(z.record(z.string(), z.any())) });

// "Pausa total": mientras el modulo esta deshabilitado, ningun trabajador
// nuevo puede INICIAR su autoevaluacion -- aunque ya tenga Promocion
// confirmada (requisito real cumplido). Lectura (miEstado) y lo ya
// iniciado/enviado nunca se tocan -- mismo criterio que
// exigirModuloHabilitado en promocion.ts/inconformidad.ts.
async function exigirModuloHabilitado(): Promise<void> {
  if (!(await moduloAutoevaluacionHabilitado())) {
    throw new TRPCError({ code: "FORBIDDEN", message: "El módulo Autoevaluación no está disponible en este momento." });
  }
}

export const autoevaluacionRouter = router({
  // El participante nunca ve su puntaje (confirmado por el cliente
  // 2026-09-22 -- "en ningun momento el participante ve los puntajes", solo
  // existe un reporte para admin/RH). miAutoevaluacion (db.ts) SI trae el
  // puntaje -- es un lector general, pensado para cuando exista un panel de
  // reportes -- el corte de "el trabajador no lo ve" vive aqui, en el
  // procedure que expone datos a su propia sesion.
  miEstado: protectedProcedureSinRestriccion.query(async ({ ctx }) => {
    const estado = await miAutoevaluacion(ctx.user.id);
    if (estado.estado === "enviado") return { estado: "enviado" as const, enviadoAt: estado.enviadoAt };
    return estado;
  }),

  iniciar: protectedProcedureSinRestriccion.mutation(async ({ ctx }) => {
    await exigirModuloHabilitado();
    const resultado = await iniciarAutoevaluacion(ctx.user.id);
    if (!resultado.ok) throw traducirErrorIniciar(resultado.error);
    return { success: true };
  }),

  enviar: protectedProcedureSinRestriccion
    .input(z.object({
      respuestas: z.array(z.object({
        preguntaId: z.number().int().positive(),
        respuestaElegida: z.enum(LIKERT_OPCIONES),
      })).length(PREGUNTAS_AUTOEVALUACION, `Debes contestar las ${PREGUNTAS_AUTOEVALUACION} preguntas`),
    }))
    .mutation(async ({ ctx, input }) => {
      const resultado = await enviarAutoevaluacion(ctx.user.id, input.respuestas);
      if (!resultado.ok) throw traducirErrorEnviar(resultado.error);
      // No regresar resultado.puntaje -- el participante nunca lo ve.
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
        const resultado = await importarFilaPreguntaAutoevaluacion(texto, respuestaCorrecta);
        if (resultado.ok) creados++;
        else errores.push({ fila: i + 1, error: resultado.error });
      }
      return { totalProcesados: input.registros.length, creados, errores };
    }),

  contarActivas: adminProcedure.query(() => contarPreguntasActivasAutoevaluacion()),

  listarPreguntas: adminProcedure.query(() => listarPreguntasAutoevaluacion()),

  actualizarPregunta: adminProcedure
    .input(z.object({
      id: z.number().int().positive(),
      texto: z.string().min(1).max(500),
      respuestaCorrecta: z.enum(LIKERT_OPCIONES),
      activo: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const resultado = await actualizarPreguntaAutoevaluacion(input.id, input.texto, input.respuestaCorrecta, input.activo);
      if (!resultado.ok) throw new TRPCError({ code: "BAD_REQUEST", message: resultado.error });
      return { success: true };
    }),

  // Reusa importarFilaPreguntaAutoevaluacion -- misma validacion
  // (texto no vacio, respuesta_correcta Likert valida) que ya usa el CSV,
  // solo que para una fila capturada a mano en vez de un import masivo.
  crearPregunta: adminProcedure
    .input(z.object({ texto: z.string().min(1).max(500), respuestaCorrecta: z.enum(LIKERT_OPCIONES) }))
    .mutation(async ({ input }) => {
      const resultado = await importarFilaPreguntaAutoevaluacion(input.texto, input.respuestaCorrecta);
      if (!resultado.ok) throw new TRPCError({ code: "BAD_REQUEST", message: resultado.error });
      return { success: true };
    }),

  eliminarPregunta: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const resultado = await eliminarPreguntaAutoevaluacion(input.id);
      if (!resultado.ok) {
        throw new TRPCError({ code: "CONFLICT", message: "No se puede eliminar, ya fue usada en una autoevaluación. Desactívala en vez de borrarla." });
      }
      return { success: true };
    }),

  moduloConfig: adminProcedure.query(async () => {
    return obtenerConfigModuloAutoevaluacion();
  }),

  moduloHabilitado: protectedProcedureSinRestriccion.query(async () => {
    return moduloAutoevaluacionHabilitado();
  }),

  actualizarModulo: adminProcedure
    .input(z.object({ habilitado: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await actualizarModuloAutoevaluacionManual(input.habilitado, ctx.user.id);
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
      await programarVentanaModuloAutoevaluacion(input.fechaDesde, input.fechaHasta, ctx.user.id);
      return { success: true };
    }),
});

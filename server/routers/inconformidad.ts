import { z } from "zod";
import { router, protectedProcedureSinRestriccion, adminProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import {
  obtenerCurpUsuario,
  obtenerFactoresConfig,
  obtenerInconformidad,
  obtenerEstadoInconformidad,
  guardarFactorInconformidad,
  quitarFactorInconformidad,
  crearArchivoPendiente,
  borrarArchivoPendiente,
  confirmarSubidaInconformidad,
  obtenerArchivoPorId,
  obtenerArchivoParaDescarga,
  enviarInconformidad,
  listarInconformidadesAdmin,
  actualizarConfigFactorInconformidad,
  crearAuditoria,
  obtenerConfigModuloInconformidad,
  moduloInconformidadHabilitado,
  actualizarModuloInconformidadManual,
  programarVentanaModuloInconformidad,
} from "../db";
import { urlSubida, urlDescarga, verificarArchivo, tieneEncabezadoPDF, borrarArchivoSeguro } from "../lib/s3";
import { FACTORES_INCONFORMIDAD } from "../../drizzle/schema";
import { MAX_PDF_BYTES, TIPO_PDF } from "../../shared/const";

type ErrorCodigoInconformidad =
  | "YA_ENVIADA" | "FACTOR_DESHABILITADO" | "NO_ENCONTRADO" | "FACTOR_NO_ENCONTRADO"
  | "ARCHIVO_NO_ES_TUYO" | "SIN_FACTORES" | "NO_INICIADA";

function errorS3Seguro(err: unknown): TRPCError {
  // Nunca exponer al cliente el detalle real (p.ej. "AWS_ACCESS_KEY_ID no
  // está configurado") -- es información de infraestructura, no algo que
  // un trabajador deba ver. Se loguea completo para diagnóstico interno.
  console.error("Error de S3 en Inconformidad:", err);
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "No se pudo procesar el archivo en este momento. Intenta de nuevo más tarde o contacta al administrador.",
  });
}

function traducirError(error: ErrorCodigoInconformidad): TRPCError {
  switch (error) {
    case "YA_ENVIADA":
      return new TRPCError({ code: "CONFLICT", message: "Tu inconformidad ya fue enviada (quizás desde otra pestaña). Actualizando tu pantalla..." });
    case "FACTOR_DESHABILITADO":
      return new TRPCError({ code: "FORBIDDEN", message: "Este factor no está disponible actualmente." });
    case "NO_ENCONTRADO":
    case "FACTOR_NO_ENCONTRADO":
      return new TRPCError({ code: "NOT_FOUND", message: "Factor no encontrado." });
    case "ARCHIVO_NO_ES_TUYO":
      return new TRPCError({ code: "FORBIDDEN", message: "No tienes permiso sobre ese archivo." });
    case "SIN_FACTORES":
      return new TRPCError({ code: "BAD_REQUEST", message: "Selecciona al menos un factor antes de enviar." });
    case "NO_INICIADA":
      return new TRPCError({ code: "BAD_REQUEST", message: "No has empezado tu inconformidad." });
    default: {
      // Exhaustividad en compile-time: si se agrega un código nuevo a
      // ErrorCodigoInconformidad sin su `case` arriba, `error` deja de ser
      // `never` aquí y esta línea deja de compilar -- antes caía callado al
      // 500 genérico sin que nadie se enterara en build (hallazgo de code
      // review).
      const _exhaustivo: never = error;
      return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Error inesperado." });
    }
  }
}

// "Pausa total" (decision confirmada con el cliente): mientras el módulo
// está deshabilitado -- a mano o porque hoy cae fuera de una ventana
// programada -- ninguna de las 5 mutaciones del trabajador procede. Lectura
// (factoresDisponibles, miInconformidad, presignarDescarga) sigue abierta:
// un caso ya guardado o enviado nunca se esconde, solo se congela.
async function exigirModuloHabilitado(): Promise<void> {
  if (!(await moduloInconformidadHabilitado())) {
    throw new TRPCError({ code: "FORBIDDEN", message: "El módulo Inconformidad no está disponible en este momento." });
  }
}

export const inconformidadRouter = router({
  moduloHabilitado: protectedProcedureSinRestriccion.query(async () => {
    return moduloInconformidadHabilitado();
  }),

  moduloConfig: adminProcedure.query(async () => {
    return obtenerConfigModuloInconformidad();
  }),

  actualizarModulo: adminProcedure
    .input(z.object({ habilitado: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await actualizarModuloInconformidadManual(input.habilitado, ctx.user.id);
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
      await programarVentanaModuloInconformidad(input.fechaDesde, input.fechaHasta, ctx.user.id);
      return { success: true };
    }),

  factoresDisponibles: protectedProcedureSinRestriccion.query(async () => {
    return obtenerFactoresConfig();
  }),

  miInconformidad: protectedProcedureSinRestriccion.query(async ({ ctx }) => {
    return obtenerInconformidad(ctx.user.id);
  }),

  guardarFactor: protectedProcedureSinRestriccion
    .input(z.object({
      factor: z.enum(FACTORES_INCONFORMIDAD),
      mensaje: z.string().min(10, "Escribe al menos 10 caracteres").max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      await exigirModuloHabilitado();
      const resultado = await guardarFactorInconformidad(ctx.user.id, input.factor, input.mensaje);
      if (!resultado.ok) throw traducirError(resultado.error);
      return { success: true, id: resultado.id };
    }),

  quitarFactor: protectedProcedureSinRestriccion
    .input(z.object({ factorId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await exigirModuloHabilitado();
      const resultado = await quitarFactorInconformidad(ctx.user.id, input.factorId);
      if (!resultado.ok) throw traducirError(resultado.error);
      if (resultado.s3KeyBorrado) await borrarArchivoSeguro(resultado.s3KeyBorrado);
      return { success: true };
    }),

  presignarSubida: protectedProcedureSinRestriccion
    .input(z.object({
      factorId: z.number(),
      nombreOriginal: z.string().min(1).max(255),
      tipoArchivo: z.literal(TIPO_PDF),
      tamanoBytes: z.number().positive().max(MAX_PDF_BYTES, "El archivo excede el límite de 10MB"),
    }))
    .mutation(async ({ ctx, input }) => {
      await exigirModuloHabilitado();
      const inconformidad = await obtenerInconformidad(ctx.user.id);
      const factor = inconformidad?.factores.find((f) => f.id === input.factorId);
      if (!inconformidad || !factor) throw new TRPCError({ code: "NOT_FOUND", message: "Factor no encontrado." });
      if (inconformidad.estado !== "borrador") throw traducirError("YA_ENVIADA");

      // Carpeta legible a simple vista en el bucket real (CURP + factor) en
      // vez de userId/factorId numericos -- antes habia que cruzar contra la
      // DB para saber de quien era cada PDF (hallazgo real revisando el
      // bucket en vivo, 2026-09-26). curp puede venir null en teoria
      // (users.curp es nullable en schema) -- cae a userId para no bloquear
      // la subida por un detalle cosmetico.
      const curp = await obtenerCurpUsuario(ctx.user.id);
      const s3Key = `inconformidad/${curp ?? ctx.user.id}/${factor.factor}/${nanoid()}.pdf`;
      const { id: archivoId } = await crearArchivoPendiente(ctx.user.id, input.nombreOriginal, input.tipoArchivo, input.tamanoBytes, s3Key);
      try {
        const { url, fields } = await urlSubida(s3Key, input.tipoArchivo, MAX_PDF_BYTES);
        return { archivoId, url, fields };
      } catch (err) {
        await borrarArchivoPendiente(archivoId, ctx.user.id);
        throw errorS3Seguro(err);
      }
    }),

  confirmarSubida: protectedProcedureSinRestriccion
    .input(z.object({ factorId: z.number(), archivoId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await exigirModuloHabilitado();
      const archivo = await obtenerArchivoPorId(input.archivoId);
      if (!archivo || archivo.cargadoPor !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tienes permiso sobre ese archivo." });
      }

      // Chequeo temprano, ANTES de tocar S3 -- mismo guard que ya tiene
      // presignarSubida. REDUCE la ventana en la que alguien podía reusar
      // la URL firmada DESPUÉS de enviar su inconformidad y llamar
      // confirmarSubida de nuevo -- las ramas de limpieza de abajo (archivo
      // no existe / excede tamaño / no es PDF) podían borrar el adjunto ya
      // congelado de un factor enviado antes de llegar al rechazo real de
      // confirmarSubidaInconformidad. NO la cierra del todo (queda una
      // ventana más chica entre esta lectura y las llamadas a S3 de abajo,
      // ninguna de las dos bajo lock). Select angosto (solo `estado`), no
      // el objeto completo con join a factores/archivos que no se usa aquí.
      const estadoActual = await obtenerEstadoInconformidad(ctx.user.id);
      if (estadoActual === null) throw traducirError("NO_INICIADA");
      if (estadoActual !== "borrador") throw traducirError("YA_ENVIADA");

      let verificacion: Awaited<ReturnType<typeof verificarArchivo>>;
      try {
        verificacion = await verificarArchivo(archivo.s3Key);
      } catch (err) {
        throw errorS3Seguro(err);
      }
      if (!verificacion.existe) {
        await borrarArchivoPendiente(input.archivoId, ctx.user.id);
        throw new TRPCError({ code: "BAD_REQUEST", message: "No se pudo confirmar la subida, intenta de nuevo." });
      }
      // Defensa en profundidad: la política del POST firmado (content-length-range
      // en urlSubida) ya rechaza en S3 mismo cualquier archivo que exceda
      // MAX_PDF_BYTES -- este objeto nunca debería llegar aquí con un tamaño
      // mayor. Se deja el chequeo de todos modos, no cuesta nada y cubre un
      // bucket mal configurado o una política que cambie sin que este código
      // se entere.
      if ((verificacion.tamanoBytes ?? 0) > MAX_PDF_BYTES) {
        await borrarArchivoSeguro(archivo.s3Key);
        await borrarArchivoPendiente(input.archivoId, ctx.user.id);
        throw new TRPCError({ code: "BAD_REQUEST", message: "El archivo excede el límite de 10MB." });
      }

      let esPdfReal: boolean;
      try {
        esPdfReal = await tieneEncabezadoPDF(archivo.s3Key);
      } catch (err) {
        throw errorS3Seguro(err);
      }
      if (!esPdfReal) {
        await borrarArchivoSeguro(archivo.s3Key);
        await borrarArchivoPendiente(input.archivoId, ctx.user.id);
        throw new TRPCError({ code: "BAD_REQUEST", message: "El archivo no es un PDF válido." });
      }

      const resultado = await confirmarSubidaInconformidad(ctx.user.id, input.factorId, input.archivoId);
      if (!resultado.ok) throw traducirError(resultado.error);
      if (resultado.s3KeyViejo) await borrarArchivoSeguro(resultado.s3KeyViejo);
      return { success: true };
    }),

  presignarDescarga: protectedProcedureSinRestriccion
    .input(z.object({ archivoId: z.number() }))
    .query(async ({ ctx, input }) => {
      const archivo = await obtenerArchivoParaDescarga(input.archivoId);
      if (!archivo) throw new TRPCError({ code: "NOT_FOUND", message: "Archivo no encontrado." });

      const esDueno = archivo.cargadoPor === ctx.user.id;
      const esAdmin = ctx.user.role === "admin";
      if (!esDueno && !esAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "No tienes permiso sobre ese archivo." });

      // El admin solo puede ver adjuntos de inconformidades ya enviadas -- un
      // borrador sigue siendo privado del trabajador hasta que lo envía,
      // aunque el archivoId ya exista en la DB.
      if (esAdmin && !esDueno && archivo.estadoInconformidad !== "enviado") {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tienes permiso sobre ese archivo." });
      }

      let url: string;
      try {
        url = await urlDescarga(archivo.s3Key, archivo.nombreOriginal);
      } catch (err) {
        throw errorS3Seguro(err);
      }

      // Auditar DESPUÉS de que la URL se generó con éxito, no antes -- si se
      // audita primero y urlDescarga falla (S3 caído, credenciales, etc.), el
      // rastro de auditoría queda con una "descarga" que en realidad nunca
      // ocurrió (hallazgo real de QA, verificado con el mismo bloqueo de
      // infra: quedó una fila "descargó el PDF" con la descarga fallando).
      if (esAdmin && archivo.userIdDueno !== null && archivo.userIdDueno !== ctx.user.id) {
        await crearAuditoria({
          servidorId: archivo.servidorIdDueno,
          usuarioId: ctx.user.id,
          accion: "ver",
          descripcion: `${ctx.user.nombre ?? ctx.user.id} descargó el PDF "${archivo.nombreOriginal}" de una inconformidad`,
        });
      }

      return { url };
    }),

  enviar: protectedProcedureSinRestriccion.mutation(async ({ ctx }) => {
    await exigirModuloHabilitado();
    const resultado = await enviarInconformidad(ctx.user.id);
    if (!resultado.ok) throw traducirError(resultado.error);
    return { success: true };
  }),

  listarAdmin: adminProcedure
    .input(z.object({ factor: z.enum(FACTORES_INCONFORMIDAD).optional() }).optional())
    .query(async ({ input }) => {
      return listarInconformidadesAdmin(input?.factor);
    }),

  actualizarConfigFactor: adminProcedure
    .input(z.object({ factor: z.enum(FACTORES_INCONFORMIDAD), habilitado: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await actualizarConfigFactorInconformidad(input.factor, input.habilitado, ctx.user.id);
      return { success: true };
    }),
});

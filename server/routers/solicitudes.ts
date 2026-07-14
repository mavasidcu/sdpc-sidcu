import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import {
  crearSolicitudConAsignacion,
  listarSolicitudesUsuario,
  listarTodasSolicitudes,
  obtenerSolicitud,
  actualizarSolicitud,
  tieneSolicitudActiva,
  getUserByCurp,
  contarAcreditacion,
  contarAprobacionPorBloque,
  getDb,
} from "../db";
import { eq, and, or } from "drizzle-orm";
import * as schema from "../../drizzle/schema";
import { CALIFICACION_APROBATORIA, CURSOS_REQUERIDOS_ACREDITACION } from "../../shared/const";

export const solicitudesRouter = router({
  crear: protectedProcedure
    .input(z.object({ cursoId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "user") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Solo usuarios pueden solicitar cursos" });
      }

      const activa = await tieneSolicitudActiva(ctx.user.id, input.cursoId);
      if (activa) {
        throw new TRPCError({ code: "CONFLICT", message: "Ya tienes una solicitud activa para este curso" });
      }

      const d = await getDb();

      const [cursoNuevo] = await d.select({ bloque: schema.cursos.bloque })
        .from(schema.cursos)
        .where(eq(schema.cursos.id, input.cursoId));

      // Máximo 1 curso activo (pendiente o aprobada) por bloque — cada bloque maneja sus propias fechas,
      // así que un curso por bloque evita empalmes sin necesidad de comparar fechas entre instituciones.
      const activosMismoBloque = await d.select({ id: schema.solicitudesCurso.id })
        .from(schema.solicitudesCurso)
        .innerJoin(schema.cursos, eq(schema.solicitudesCurso.cursoId, schema.cursos.id))
        .where(and(
          eq(schema.solicitudesCurso.userId, ctx.user.id),
          or(
            eq(schema.solicitudesCurso.estado, "pendiente"),
            eq(schema.solicitudesCurso.estado, "aprobada")
          ),
          cursoNuevo?.bloque != null
            ? eq(schema.cursos.bloque, cursoNuevo.bloque)
            : eq(schema.cursos.id, input.cursoId), // sin bloque asignado: no se puede comparar, no bloquea
        ));

      if (cursoNuevo?.bloque != null && activosMismoBloque.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Ya tienes un curso activo en el Bloque ${cursoNuevo.bloque}. Solo puedes tener un curso activo por bloque.`,
        });
      }

      const resultado = await crearSolicitudConAsignacion(ctx.user.id, input.cursoId);
      if (!resultado.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No hay ninguna institución configurada en el sistema",
        });
      }
      return { success: true, id: resultado.id };
    }),

  misSolicitudes: protectedProcedure.query(async ({ ctx }) => {
    return listarSolicitudesUsuario(ctx.user.id);
  }),

  listar: adminProcedure
    .input(z.object({
      estado: z.string().optional(),
      page: z.number().int().positive().default(1),
      limit: z.number().int().positive().max(100).default(20),
    }).optional())
    .query(async ({ input }) => {
      return listarTodasSolicitudes({ estado: input?.estado, page: input?.page, limit: input?.limit });
    }),

  completar: adminProcedure
    .input(z.object({ id: z.number(), calificacion: z.number().min(0).max(100) }))
    .mutation(async ({ input }) => {
      const sol = await obtenerSolicitud(input.id);
      if (!sol) throw new TRPCError({ code: "NOT_FOUND", message: "Solicitud no encontrada" });
      if (sol.estado !== "aprobada") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Solicitud no está aprobada" });
      }
      await actualizarSolicitud(input.id, { estado: "completada", calificacion: input.calificacion });
      // nivelProgresion NO sube automaticamente al aprobar cursos -- queda
      // fijo en lo que se puso al crear/importar el servidor. La regla de
      // cuantos cursos aprobados equivalen a subir de nivel esta pendiente
      // de definir (ver incrementarNivelProgresion en db.ts, sin uso por ahora).
      return { success: true, aprobado: input.calificacion >= CALIFICACION_APROBATORIA };
    }),

  // Carga masiva de calificaciones — un solo CSV con curp + nombre del curso + calificación,
  // cubre todos los bloques/cursos a la vez (no requiere preseleccionar un curso).
  importarCalificaciones: adminProcedure
    .input(z.object({
      registros: z.array(z.record(z.string(), z.any())),
    }))
    .mutation(async ({ input }) => {
      const d = await getDb();
      const actualizados: number[] = [];
      const errores: { fila: number; error: string }[] = [];

      for (let i = 0; i < input.registros.length; i++) {
        const row = input.registros[i];
        const curp = (row.curp ?? "").toString().trim().toUpperCase();
        const cursoNombre = (row.curso ?? "").toString().trim();
        const calificacion = Number(row.calificacion);

        if (!curp) {
          errores.push({ fila: i + 1, error: "CURP requerida" });
          continue;
        }
        if (!cursoNombre) {
          errores.push({ fila: i + 1, error: "Nombre de curso requerido" });
          continue;
        }
        if (!Number.isFinite(calificacion) || calificacion < 0 || calificacion > 100) {
          errores.push({ fila: i + 1, error: "Calificación inválida (0-100)" });
          continue;
        }

        try {
          const { sql } = await import("drizzle-orm");
          const user = await getUserByCurp(curp);
          if (!user) {
            errores.push({ fila: i + 1, error: `CURP "${curp}" no encontrada` });
            continue;
          }

          const [curso] = await d.select({ id: schema.cursos.id }).from(schema.cursos)
            .where(sql`LOWER(TRIM(${schema.cursos.nombre})) = ${cursoNombre.toLowerCase()}`);
          if (!curso) {
            errores.push({ fila: i + 1, error: `Curso "${cursoNombre}" no encontrado` });
            continue;
          }

          const [sol] = await d.select().from(schema.solicitudesCurso)
            .where(and(
              eq(schema.solicitudesCurso.userId, user.id),
              eq(schema.solicitudesCurso.cursoId, curso.id),
              eq(schema.solicitudesCurso.estado, "aprobada"),
            ));
          if (!sol) {
            errores.push({ fila: i + 1, error: `CURP "${curp}" no tiene solicitud aprobada para "${cursoNombre}"` });
            continue;
          }

          await actualizarSolicitud(sol.id, { estado: "completada", calificacion });
          // nivelProgresion NO sube automaticamente aqui tampoco (ver nota en completar).
          actualizados.push(sol.id);
        } catch (err: any) {
          errores.push({ fila: i + 1, error: err.message ?? "Error desconocido" });
        }
      }

      return { totalProcesados: input.registros.length, creados: actualizados.length, errores };
    }),

  // Progreso de acreditación del usuario: cuántos cursos completó y cuántos aprobó
  progresoAcreditacion: protectedProcedure.query(async ({ ctx }) => {
    const d = await getDb();
    const completadas = await d.select({
      calificacion: schema.solicitudesCurso.calificacion,
    }).from(schema.solicitudesCurso)
      .where(and(
        eq(schema.solicitudesCurso.userId, ctx.user.id),
        eq(schema.solicitudesCurso.estado, "completada"),
      ));

    const aprobados = completadas.filter((c) => (c.calificacion ?? 0) >= CALIFICACION_APROBATORIA).length;

    return {
      completados: completadas.length,
      aprobados,
      requeridos: CURSOS_REQUERIDOS_ACREDITACION,
      acreditado: aprobados >= CURSOS_REQUERIDOS_ACREDITACION,
    };
  }),

  // Conteo de servidores acreditados vs no acreditados -- para el resumen
  // que ve el admin en Solicitudes.
  conteoAcreditacion: adminProcedure.query(async () => {
    return contarAcreditacion();
  }),

  // Aprobados/reprobados por bloque -- solo cuenta solicitudes completadas.
  conteoPorBloque: adminProcedure.query(async () => {
    return contarAprobacionPorBloque();
  }),
});

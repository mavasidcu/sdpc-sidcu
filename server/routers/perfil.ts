import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { obtenerPerfil, crearPerfil, actualizarPerfil, listarSolicitudesBaja, toggleActivoUsuario } from "../db";
import { eq } from "drizzle-orm";
import * as schema from "../../drizzle/schema";
import { getDb } from "../db";

const perfilInput = z.object({
  rfc: z.string().regex(/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/, "RFC inválido"),
  curp: z.string().regex(/^[A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]\d$/, "CURP inválido"),
  cargo: z.string().min(2, "Cargo requerido"),
  dependencia: z.string().min(2, "Dependencia requerida"),
  nivelGobierno: z.enum(["federal", "estatal", "municipal", "otro"]),
  grupoFuncion: z.enum(["ADMO", "TECN", "SERV", "COMUN", "PROFE", "EDU"]),
  fechaIngreso: z.coerce.date(),
  datosContacto: z.string().nullable().optional(),
});

export const perfilRouter = router({
  obtener: protectedProcedure.query(async ({ ctx }) => {
    return obtenerPerfil(ctx.user.id);
  }),

  crear: protectedProcedure
    .input(perfilInput.extend({ email: z.string().nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await obtenerPerfil(ctx.user.id);

      // Idempotente: si perfil ya existe y está completado, no error — retorna éxito
      if (existing?.completado) {
        return { success: true, id: existing.id };
      }

      const d = await getDb();

      // Validar CURP — no debe existir en otro servidor activo (excepto temporales)
      const [curpExistente] = await d.select().from(schema.servidoresPublicos)
        .where(eq(schema.servidoresPublicos.curp, input.curp));

      if (curpExistente && curpExistente.userId !== ctx.user.id) {
        if (curpExistente.estatus === "inactivo") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Este CURP pertenece a un servidor dado de baja. Contacte al administrador." });
        }
        if (!curpExistente.curp.startsWith("PEND") && !curpExistente.curp.startsWith("UREG")) {
          throw new TRPCError({ code: "CONFLICT", message: "Este CURP ya está registrado en el sistema." });
        }
      }

      // Validar RFC — no debe existir en otro servidor activo (excepto temporales)
      const [rfcExistente] = await d.select().from(schema.servidoresPublicos)
        .where(eq(schema.servidoresPublicos.rfc, input.rfc));

      if (rfcExistente && rfcExistente.userId !== ctx.user.id) {
        if (!rfcExistente.rfc.startsWith("PEND") && !rfcExistente.rfc.startsWith("UREG")) {
          throw new TRPCError({ code: "CONFLICT", message: "Este RFC ya está registrado en el sistema." });
        }
      }

      // Servidor ya vinculado a este usuario (ej. importado por CSV antes de
      // que la persona se auto-registrara) -- se consulta antes de crear el
      // perfil para heredar su nivelProgresion, en vez de resetearlo a 0.
      const [existingSrv] = await d.select().from(schema.servidoresPublicos)
        .where(eq(schema.servidoresPublicos.userId, ctx.user.id));

      // auth.register ya exige que la CURP exista en el padrón para poder
      // crear la cuenta -- si llega aquí sin servidor vinculado es una cuenta
      // de antes de ese fix (o cualquier otro camino que la haya creado sin
      // pasar por register). No se crea un servidor nuevo desde cero: eso es
      // exactamente el hueco que permitía a cualquiera con CURP con formato
      // válido avanzar sin haber sido dado de alta por un admin.
      if (!existingSrv) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Tu cuenta no está vinculada a ningún registro del padrón. Contacta al administrador para darte de alta.",
        });
      }

      // Crear o actualizar perfil
      let id: number;
      if (existing) {
        await actualizarPerfil(ctx.user.id, { ...input, datosContacto: input.datosContacto ?? null, completado: true });
        id = existing.id;
      } else {
        id = await crearPerfil({
          userId: ctx.user.id,
          ...input,
          datosContacto: input.datosContacto ?? null,
          completado: true,
          nivelProgresion: existingSrv.nivelProgresion ?? 0,
        });
      }

      await d.update(schema.servidoresPublicos).set({
        nombreCompleto: ctx.user.nombre,
        rfc: input.rfc,
        curp: input.curp,
        cargo: input.cargo,
        dependencia: input.dependencia,
        nivel: input.nivelGobierno,
        grupoFuncion: input.grupoFuncion,
        fechaIngreso: input.fechaIngreso,
        datosContacto: input.datosContacto ?? null,
        email: input.email ?? existingSrv.email,
        actualizadoPor: ctx.user.id,
      }).where(eq(schema.servidoresPublicos.id, existingSrv.id));

      return { success: true, id };
    }),

  actualizar: protectedProcedure
    .input(perfilInput.partial())
    .mutation(async ({ ctx, input }) => {
      await actualizarPerfil(ctx.user.id, {
        ...input,
        datosContacto: input.datosContacto ?? undefined,
      });
      return { success: true };
    }),

  solicitarBaja: protectedProcedure
    .input(z.object({ motivo: z.string().min(5, "Describe el motivo de tu solicitud") }))
    .mutation(async ({ ctx, input }) => {
      const perfil = await obtenerPerfil(ctx.user.id);
      if (!perfil) throw new TRPCError({ code: "NOT_FOUND", message: "Perfil no encontrado" });
      if (perfil.solicitudBaja) throw new TRPCError({ code: "CONFLICT", message: "Ya tienes una solicitud de baja pendiente" });
      await actualizarPerfil(ctx.user.id, {
        solicitudBaja: true,
        motivoBaja: input.motivo,
        fechaSolicitudBaja: new Date(),
      });
      return { success: true };
    }),

  cancelarBaja: protectedProcedure
    .mutation(async ({ ctx }) => {
      await actualizarPerfil(ctx.user.id, {
        solicitudBaja: false,
        motivoBaja: null,
        fechaSolicitudBaja: null,
      });
      return { success: true };
    }),

  listarBajas: adminProcedure.query(async () => {
    return listarSolicitudesBaja();
  }),

  aprobarBaja: adminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input }) => {
      const perfil = await obtenerPerfil(input.userId);
      if (!perfil) throw new TRPCError({ code: "NOT_FOUND", message: "Perfil no encontrado" });

      const d = await getDb();
      await d
        .update(schema.servidoresPublicos)
        .set({ estatus: "inactivo" })
        .where(eq(schema.servidoresPublicos.userId, input.userId));

      await toggleActivoUsuario(input.userId);

      await actualizarPerfil(input.userId, {
        solicitudBaja: false,
      });

      return { success: true };
    }),
});

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { hashPassword, verifyPassword, generateToken } from "./auth";
import { verificarTurnstile } from "./turnstile";
import { capitalizarNombre } from "../shared/utils";
import {
  getUserByEmail,
  getUserByCurp,
  createUser,
  crearTokenRestablecimiento,
  obtenerTokenRestablecimiento,
  actualizarPasswordUsuario,
  marcarTokenComoUsado,
} from "./db";
import { COOKIE_NAME } from "../shared/const";
import { router, publicProcedure, protectedProcedure } from "./trpc";
import { servidoresRouter } from "./routers/servidores";
import { usuariosRouter } from "./routers/usuarios";
import { importacionRouter } from "./routers/importacion";
import { perfilRouter } from "./routers/perfil";
import { cursosRouter } from "./routers/cursos";
import { institucionesRouter } from "./routers/instituciones";
import { solicitudesRouter } from "./routers/solicitudes";

export { router, publicProcedure };

const authRouter = router({
  register: publicProcedure
    .input(
      z.object({
        curp: z.string().min(18, "CURP debe tener 18 caracteres").max(18),
        nombre: z.string().min(2, "Nombre requerido"),
        password: z.string().min(8, "Mínimo 8 caracteres"),
        // Sin min(1): la validacion real vive en verificarTurnstile() -- ahi
        // se decide si un token vacio es aceptable (solo cuando no hay
        // TURNSTILE_SECRET_KEY, ej. dev local) o debe rechazarse (con
        // secret configurada, token vacio siempre falla).
        turnstileToken: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const turnstileOk = await verificarTurnstile(input.turnstileToken, ctx.req.ip);
      if (!turnstileOk) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Verificación de seguridad fallida. Intenta de nuevo.",
        });
      }

      // Mensaje generico e identico para los 3 motivos de rechazo (cuenta ya
      // existe, no esta en el padron, dado de baja) -- un mensaje distinto
      // por caso le deja a quien esta probando datos al azar deducir cuales
      // corresponden a alguien real en el sistema. No se menciona "CURP" en
      // el mensaje para no confirmar cual es el campo que se esta validando.
      const REGISTRO_RECHAZADO = "No se pudo completar el registro. Verifica tus datos o contacta al administrador.";

      const curp = input.curp.toUpperCase();
      const existingUser = await getUserByCurp(curp);
      if (existingUser) {
        throw new TRPCError({ code: "FORBIDDEN", message: REGISTRO_RECHAZADO });
      }

      const { getDb } = await import("./db");
      const schema = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const d = await getDb();
      const [servidor] = await d.select().from(schema.servidoresPublicos)
        .where(eq(schema.servidoresPublicos.curp, curp));

      // El registro solo es para gente ya dada de alta por un admin (import
      // CSV de SDPC/PAC/SPC) -- sin esto, cualquiera con una CURP de formato
      // valido podia crearse cuenta y avanzar aunque nunca hubiera sido
      // cargado al padron.
      if (!servidor) {
        throw new TRPCError({ code: "FORBIDDEN", message: REGISTRO_RECHAZADO });
      }

      if (servidor.estatus === "inactivo") {
        throw new TRPCError({ code: "FORBIDDEN", message: REGISTRO_RECHAZADO });
      }

      const nombre = capitalizarNombre(input.nombre);
      const hash = await hashPassword(input.password);
      const id = await createUser({
        nombre,
        curp,
        passwordHash: hash,
        role: "user",
      });

      await d.update(schema.servidoresPublicos)
        .set({ userId: id, nombreCompleto: nombre, actualizadoPor: id })
        .where(eq(schema.servidoresPublicos.id, servidor.id));

      return { success: true, id };
    }),

  login: publicProcedure
    .input(z.object({ curp: z.string().min(1, "CURP requerido"), password: z.string(), rememberMe: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const curp = input.curp.toUpperCase();
      const user = await getUserByCurp(curp);
      if (
        !user ||
        !(await verifyPassword(input.password, user.passwordHash))
      ) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "CURP o contraseña incorrectos",
        });
      }
      if (!user.isActive) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Tu cuenta ha sido desactivada. Contacta al administrador.",
        });
      }
      const token = generateToken(user);
      const cookieOpts: any = {
        httpOnly: true,
        sameSite: "lax" as const,
        secure: process.env.NODE_ENV === "production",
      };
      if (input.rememberMe) {
        cookieOpts.maxAge = 30 * 24 * 60 * 60 * 1000;
      }
      ctx.res.cookie(COOKIE_NAME, token, cookieOpts);
      return {
        success: true,
        user: {
          id: user.id,
          nombre: user.nombre,
          email: user.email ?? null,
          role: user.role,
        },
      };
    }),

  me: publicProcedure.query(({ ctx }) => ctx.user ?? null),

  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.res.clearCookie(COOKIE_NAME);
    return { success: true };
  }),

  solicitarRestablecimiento: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      const user = await getUserByEmail(input.email);
      if (!user) return { success: true }; // don't reveal if user exists
      const token = randomBytes(32).toString("hex");
      await crearTokenRestablecimiento(
        user.id,
        token,
        new Date(Date.now() + 24 * 60 * 60 * 1000),
      );
      // TODO: send email with reset link
      return { success: true };
    }),

  restablecerContrasena: publicProcedure
    .input(z.object({ token: z.string(), password: z.string().min(8) }))
    .mutation(async ({ input }) => {
      const record = await obtenerTokenRestablecimiento(input.token);
      if (!record || record.usedAt || new Date() > record.expiresAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Token invalido o expirado",
        });
      }
      const hash = await hashPassword(input.password);
      await actualizarPasswordUsuario(record.userId, hash);
      await marcarTokenComoUsado(record.id);
      return { success: true };
    }),
});

export const appRouter = router({
  auth: authRouter,
  servidores: servidoresRouter,
  usuarios: usuariosRouter,
  importacion: importacionRouter,
  perfil: perfilRouter,
  cursos: cursosRouter,
  instituciones: institucionesRouter,
  solicitudes: solicitudesRouter,
});

export type AppRouter = typeof appRouter;

import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./middleware/auth";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter(opts) {
    const { shape, error } = opts;
    // Nunca mandar al cliente el stack trace -- revela rutas reales del
    // servidor (ej. "D:\...\server\routers\x.ts:33"), sea cual sea el error.
    const data = { ...shape.data } as typeof shape.data & { stack?: unknown };
    delete data.stack;

    // `error.cause` viene seteado en 2 casos DISTINTOS, hay que separarlos:
    //
    // 1. Falla de validación de input (Zod) -- trpc mismo hace
    //    `throw new TRPCError({ code: "BAD_REQUEST", cause })` dentro de
    //    createInputMiddleware cuando `schema.parse()` truena (verificado
    //    leyendo node_modules/@trpc/server/dist/initTRPC-*.cjs). El `cause`
    //    ahí es el ZodError real, con `.issues` -- su mensaje YA es texto
    //    pensado para el usuario (ej. "Escribe al menos 10 caracteres",
    //    "RFC inválido"), nunca detalle de infra. Hallazgo real: la primera
    //    versión de este formatter genericizaba también estos, perdiendo el
    //    mensaje de validación de negocio.
    // 2. Un throw crudo que nadie controló (ver getTRPCErrorFromUnknown en
    //    @trpc/server) -- ahí SÍ puede venir texto de SQL, nombres de
    //    tabla/columna, variables internas (hallazgo real:
    //    guardarFactorInconformidad agotando sus 3 reintentos). Todo
    //    `new TRPCError({ code, message })` que lanzamos a propósito en este
    //    repo nunca pasa `cause` (verificado por grep) -- si no hay `cause`,
    //    el mensaje ya fue pensado para el usuario y se deja pasar tal cual.
    const cause = error.cause as unknown;
    const esErrorDeValidacion =
      !!cause && typeof cause === "object" && Array.isArray((cause as { issues?: unknown }).issues);

    if (esErrorDeValidacion) {
      const primerIssue = (cause as { issues: { message?: string }[] }).issues[0];
      return { ...shape, message: primerIssue?.message ?? shape.message, data };
    }

    if (cause) {
      console.error("Error interno no controlado en tRPC:", cause);
      return { ...shape, message: "Ocurrió un error inesperado. Intenta de nuevo más tarde.", data };
    }
    return { ...shape, data };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "No autenticado" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const adminProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "No autenticado" });
  }
  if (ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No tienes permisos para esta acción",
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

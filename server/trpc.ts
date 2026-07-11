import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./middleware/auth";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
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

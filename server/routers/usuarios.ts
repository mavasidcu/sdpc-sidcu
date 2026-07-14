import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { hashPassword } from "../auth";
import {
  listarUsuarios,
  cambiarRolUsuario,
  toggleActivoUsuario,
  getUserByCurp,
  createUser,
  crearServidor,
  crearAuditoria,
  servidorIdDeUsuario,
  resetearPasswordUsuario,
} from "../db";

export const usuariosRouter = router({
  crear: adminProcedure
    .input(
      z.object({
        nombre: z.string().min(2, "Nombre requerido"),
        curp: z.string().length(18, "CURP debe tener 18 caracteres"),
        password: z.string().min(8, "Mínimo 8 caracteres"),
        role: z.enum(["admin", "capturista", "consultor", "user"]),
      }),
    )
    .mutation(async ({ input }) => {
      const curp = input.curp.toUpperCase();
      const existing = await getUserByCurp(curp);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "CURP ya registrada",
        });
      }
      const hash = await hashPassword(input.password);
      const id = await createUser({
        nombre: input.nombre,
        curp,
        passwordHash: hash,
        role: input.role,
      });
      await crearServidor({
        userId: id,
        nombreCompleto: input.nombre,
        rfc: `UREG${String(id).padStart(9, "0")}`,
        curp,
        cargo: "Por definir",
        dependencia: "Por definir",
        nivel: "federal",
        grupoFuncion: "ADMO",
        // Alta directa de admin (no es parte del flujo de import por programa) --
        // SDPC como placeholder seguro; admin puede corregirlo desde Servidores si aplica.
        programa: "SDPC",
        fechaIngreso: new Date(),
        datosContacto: null,
        upa: null,
        cmao: null,
        ua: null,
        nivelProgresion: 0,
        estatus: "activo",
        creadoPor: id,
        actualizadoPor: id,
      });
      return { success: true, id };
    }),

  listar: adminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      return listarUsuarios(input.search, input.page, input.limit);
    }),

  cambiarRol: adminProcedure
    .input(
      z.object({
        id: z.number(),
        role: z.enum(["admin", "capturista", "consultor", "user"]),
      }),
    )
    .mutation(async ({ input }) => {
      await cambiarRolUsuario(input.id, input.role);
      return { success: true };
    }),

  toggleActivo: adminProcedure
    .input(
      z.object({
        id: z.number(),
      }),
    )
    .mutation(async ({ input }) => {
      await toggleActivoUsuario(input.id);
      return { success: true };
    }),

  // No existe endpoint para "ver" la contraseña anterior — nunca se almacena en texto
  // plano. Si la olvidaron, el admin asigna una nueva con este endpoint.
  resetearPassword: adminProcedure
    .input(z.object({ id: z.number(), password: z.string().min(8, "Mínimo 8 caracteres") }))
    .mutation(async ({ input, ctx }) => {
      const hash = await hashPassword(input.password);
      await resetearPasswordUsuario(input.id, hash);

      await crearAuditoria({
        servidorId: await servidorIdDeUsuario(input.id),
        usuarioId: ctx.user.id,
        accion: "actualizar",
        cambiosAnteriores: null,
        cambiosPosterior: null,
        descripcion: `${ctx.user.nombre} restableció la contraseña del usuario #${input.id}`,
      } as any);

      return { success: true };
    }),
});

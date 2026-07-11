import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import {
  listarInstituciones,
  crearInstitucion,
  actualizarInstitucion,
  toggleActivoInstitucion,
  eliminarInstitucion,
} from "../db";

export const institucionesRouter = router({
  listar: adminProcedure
    .input(z.object({ soloActivas: z.boolean().default(true) }).optional())
    .query(async ({ input }) => {
      return listarInstituciones(input?.soloActivas ?? true);
    }),

  crear: adminProcedure
    .input(z.object({
      nombre: z.string().min(2),
      direccion: z.string().optional(),
      contacto: z.string().optional(),
      telefono: z.string().optional(),
      email: z.string().email().optional(),
    }))
    .mutation(async ({ input }) => {
      const id = await crearInstitucion({
        nombre: input.nombre,
        direccion: input.direccion ?? null,
        contacto: input.contacto ?? null,
        telefono: input.telefono ?? null,
        email: input.email ?? null,
      });
      return { success: true, id };
    }),

  actualizar: adminProcedure
    .input(z.object({
      id: z.number(),
      nombre: z.string().min(2).optional(),
      direccion: z.string().optional(),
      contacto: z.string().optional(),
      telefono: z.string().optional(),
      email: z.string().email().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await actualizarInstitucion(id, data);
      return { success: true };
    }),

  toggleActivo: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await toggleActivoInstitucion(input.id);
      return { success: true };
    }),

  eliminar: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await eliminarInstitucion(input.id);
      return { success: true };
    }),

  importar: adminProcedure
    .input(z.object({ registros: z.array(z.record(z.string(), z.any())) }))
    .mutation(async ({ input }) => {
      const schema = z.object({
        nombre: z.string().min(2, "Nombre requerido"),
        direccion: z.string().optional(),
        contacto: z.string().optional(),
        telefono: z.string().optional(),
        email: z.string().email().optional(),
      });

      const creados: number[] = [];
      const errores: { fila: number; error: string }[] = [];

      for (let i = 0; i < input.registros.length; i++) {
        const row = input.registros[i];
        const parsed = schema.safeParse({
          nombre: row.nombre,
          direccion: row.direccion || undefined,
          contacto: row.contacto || undefined,
          telefono: row.telefono || undefined,
          email: row.email || undefined,
        });

        if (!parsed.success) {
          errores.push({
            fila: i + 1,
            error: parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", "),
          });
          continue;
        }

        try {
          const id = await crearInstitucion({
            nombre: parsed.data.nombre,
            direccion: parsed.data.direccion ?? null,
            contacto: parsed.data.contacto ?? null,
            telefono: parsed.data.telefono ?? null,
            email: parsed.data.email ?? null,
          });
          creados.push(id);
        } catch (err: any) {
          errores.push({
            fila: i + 1,
            error: err.message ?? "Error desconocido",
          });
        }
      }

      return { totalProcesados: input.registros.length, creados: creados.length, errores };
    }),
});

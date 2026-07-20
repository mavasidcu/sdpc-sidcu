import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import {
  listarCursos,
  obtenerCursoPorId,
  crearCurso,
  actualizarCurso,
  toggleActivoCurso,
  eliminarCurso,
  listarCursosInstituciones,
  asignarCursoInstitucion,
  eliminarCursoInstitucion,
  obtenerPerfil,
  buscarCursoPorNombre,
  obtenerInstitucionPredeterminada,
  obtenerServidorPorUserId,
} from "../db";
import { FINALIDAD_POR_TIPO_PROGRAMA, FINALIDADES_PAC } from "../../shared/const";

// SPC/SDPC: finalidad fija segun catalogo. PAC: cada curso trae la suya
// (una de las 4 de FINALIDADES_PAC) -- se respeta lo que venga si es una
// coincidencia valida, si no cae a la primera opcion como default seguro.
function resolverFinalidad(tipoPrograma: string, finalidadEntrante: string | null | undefined): string | null {
  if (tipoPrograma === "PAC") {
    const match = FINALIDADES_PAC.find(
      (f) => f.toLowerCase() === (finalidadEntrante ?? "").toString().trim().toLowerCase(),
    );
    return match ?? FINALIDADES_PAC[0];
  }
  return FINALIDAD_POR_TIPO_PROGRAMA[tipoPrograma] ?? null;
}

const cursoInput = z.object({
  nombre: z.string().min(2, "Nombre requerido"),
  descripcion: z.string().nullable().optional(),
  nivelRequerido: z.number().int().min(0).max(5).default(0),
  nivelGobierno: z.enum(["federal", "estatal", "municipal", "otro"]).nullable().optional(),
  categoria: z.string().default("general"),
  duracionHoras: z.number().int().positive(),
  modalidad: z.enum(["presencial", "virtual", "mixto"]),
  tipoPrograma: z.enum(["PAC", "SPC", "SDPC"]),
  bloque: z.number().int().nullable().optional(),
  numero: z.number().int().nullable().optional(),
  institucionResponsable: z.string().nullable().optional(),
  finalidad: z.string().nullable().optional(),
  fechaInicio: z.coerce.date().nullable().optional(),
  fechaTermino: z.coerce.date().nullable().optional(),
  horarioTexto: z.string().nullable().optional(),
  fechaEvaluacion: z.coerce.date().nullable().optional(),
  horarioEvaluacion: z.string().nullable().optional(),
  duracionEvaluacion: z.string().nullable().optional(),
});

export const cursosRouter = router({
  listar: protectedProcedure
    .input(z.object({
      categoria: z.string().optional(),
      modalidad: z.string().optional(),
      // Filtro opcional para admin/capturista/consultor -- les facilita
      // navegar el catálogo completo por programa sin restringir lo que
      // pueden ver (a diferencia del rol "user", que sí queda acotado a
      // su propio programa).
      tipoPrograma: z.enum(["PAC", "SPC", "SDPC"]).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      if (ctx.user.role === "user") {
        const perfil = await obtenerPerfil(ctx.user.id);
        if (!perfil?.completado) return [];
        // Catálogo acotado al programa (SDPC/PAC/SPC) del propio servidor --
        // cada persona solo debe ver cursos de su universo, no los 3 mezclados.
        const servidor = await obtenerServidorPorUserId(ctx.user.id);
        return listarCursos({
          categoria: input?.categoria,
          modalidad: input?.modalidad,
          tipoPrograma: servidor?.programa,
          soloActivos: true,
        });
      }
      return listarCursos({
        categoria: input?.categoria,
        modalidad: input?.modalidad,
        tipoPrograma: input?.tipoPrograma,
        soloActivos: false,
      });
    }),

  obtener: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const curso = await obtenerCursoPorId(input.id);
      if (!curso) throw new TRPCError({ code: "NOT_FOUND", message: "Curso no encontrado" });
      const instituciones = await listarCursosInstituciones(input.id);
      return { ...curso, instituciones };
    }),

  crear: adminProcedure
    .input(cursoInput)
    .mutation(async ({ ctx, input }) => {
      const id = await crearCurso({
        ...input,
        descripcion: input.descripcion ?? null,
        nivelGobierno: input.nivelGobierno ?? null,
        finalidad: resolverFinalidad(input.tipoPrograma, input.finalidad),
        creadoPor: ctx.user.id,
      });

      // Mismo auto-asignado que ya hace la importacion CSV (ver import mas
      // abajo) -- sin esto, un curso creado a mano queda sin institucion
      // hasta que el admin reabra el modal en modo editar y la asigne a
      // mano en la pestana "Instituciones", inconsistente con el CSV.
      const institucionPredeterminadaId = await obtenerInstitucionPredeterminada();
      if (institucionPredeterminadaId) {
        await asignarCursoInstitucion({
          cursoId: id,
          institucionId: institucionPredeterminadaId,
          cupoMaximo: 9999,
          cupoDisponible: 9999,
          fechaInicio: input.fechaInicio ?? null,
          fechaFin: input.fechaTermino ?? null,
          activo: true,
        });
      }

      return { success: true, id };
    }),

  actualizar: adminProcedure
    .input(z.object({ id: z.number() }).merge(cursoInput.partial()))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      // Si esta actualizacion trae tipoPrograma, la finalidad se recalcula
      // junto con el; si no viene, se deja intacta la finalidad ya guardada.
      if (data.tipoPrograma) {
        data.finalidad = resolverFinalidad(data.tipoPrograma, data.finalidad);
      }
      await actualizarCurso(id, data);
      return { success: true };
    }),

  toggleActivo: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await toggleActivoCurso(input.id);
      return { success: true };
    }),

  eliminar: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await eliminarCurso(input.id);
      return { success: true };
    }),

  asignarInstitucion: adminProcedure
    .input(z.object({
      cursoId: z.number(),
      institucionId: z.number(),
      cupoMaximo: z.number().int().positive(),
      fechaInicio: z.coerce.date().optional(),
      fechaFin: z.coerce.date().optional(),
    }))
    .mutation(async ({ input }) => {
      const id = await asignarCursoInstitucion({
        cursoId: input.cursoId,
        institucionId: input.institucionId,
        cupoMaximo: input.cupoMaximo,
        cupoDisponible: input.cupoMaximo,
        fechaInicio: input.fechaInicio ?? null,
        fechaFin: input.fechaFin ?? null,
      });
      return { success: true, id };
    }),

  desasignarInstitucion: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await eliminarCursoInstitucion(input.id);
      return { success: true };
    }),

  importar: adminProcedure
    .input(z.object({
      registros: z.array(z.record(z.string(), z.any())),
      // Todo el archivo es de un solo tipoPrograma -- se elige antes de
      // subir el CSV, no fila por fila (simplifica: sin columna ni alias
      // que parsear, la finalidad ya se sabe si es fija o hay que leerla).
      tipoPrograma: z.enum(["PAC", "SPC", "SDPC"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const creados: number[] = [];
      const errores: { fila: number; error: string }[] = [];
      const nombresVistos = new Set<string>();
      const institucionPredeterminadaId = await obtenerInstitucionPredeterminada();

      // Excel con celdas combinadas exporta vacío en filas siguientes del mismo bloque/institución.
      // Rellenar hacia abajo (fill-down) los campos que normalmente se combinan.
      const camposHeredables = [
        "bloque",
        "institucionResponsable",
        "finalidad",
        "fechaInicio",
        "fechaTermino",
        "horarioTexto",
        "duracionHoras",
        "fechaEvaluacion",
        "horarioEvaluacion",
        "duracionEvaluacion",
      ];
      const ultimoValor: Record<string, any> = {};
      for (const row of input.registros) {
        for (const campo of camposHeredables) {
          const valor = row[campo];
          const vacio = valor === undefined || valor === null || valor.toString().trim() === "";
          if (vacio && ultimoValor[campo] !== undefined) {
            row[campo] = ultimoValor[campo];
          } else if (!vacio) {
            ultimoValor[campo] = valor;
          }
        }
      }

      // Convierte fechas en formato DD/MM/YYYY (formato del CSV) a ISO, que sí parsea Date.
      // Corta cualquier hora pegada (Excel exporta "2017-08-16 00:00:00") ANTES del
      // regex -- si no, cae a new Date(textoCrudo) con hora sin "Z", que JS interpreta
      // como hora LOCAL y corre la fecha 5-6h al guardarse. Ver mismo fix en importacion.ts.
      const parseFechaDDMMYYYY = (valor: any): string | null => {
        if (!valor) return null;
        const textoCompleto = valor.toString().trim();
        if (!textoCompleto) return null;
        const texto = textoCompleto.split(/[\sT]/)[0];
        const matchDDMMYYYY = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (matchDDMMYYYY) {
          const [, dd, mm, yyyy] = matchDDMMYYYY;
          return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
        return null;
      };

      // Helpers genéricos para normalizar valores "sucios" que llegan de CSV/Excel
      const quitarAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
      const texto = (valor: any, porDefecto: string | null = "Por definir"): string | null => {
        const t = (valor ?? "").toString().trim();
        return t === "" ? porDefecto : t;
      };
      const soloDigitos = (valor: any): number | null => {
        if (valor === undefined || valor === null || valor.toString().trim() === "") return null;
        const n = Number(String(valor).replace(/\D+/g, ""));
        return Number.isFinite(n) && n > 0 ? n : null;
      };
      const enumPorContenido = (valor: any, opciones: { match: string[]; valor: string }[], def: string): string => {
        const v = quitarAcentos((valor ?? "").toString().trim().toLowerCase());
        return opciones.find((o) => o.match.some((m) => v.includes(m)))?.valor ?? def;
      };

      for (let i = 0; i < input.registros.length; i++) {
        const row = input.registros[i];

        // Saltar filas completamente vacías (líneas en blanco al final del CSV)
        const filaVacia = Object.values(row).every((v) => !v || v.toString().trim() === "");
        if (filaVacia) continue;

        const nombreRaw = (row.nombre ?? "").toString().trim();
        const nombreFormateado = nombreRaw.length > 0 && nombreRaw === nombreRaw.toUpperCase()
          ? nombreRaw.charAt(0).toUpperCase() + nombreRaw.slice(1).toLowerCase()
          : nombreRaw || "Por definir";

        const tipoPrograma = input.tipoPrograma;

        // Todos los cursos son virtuales (decision de negocio) -- se ignora
        // cualquier valor de modalidad que traiga el CSV.
        const modalidad = "virtual";

        const nivelGobierno = enumPorContenido(row.nivelGobierno, [
          { match: ["estatal"], valor: "estatal" },
          { match: ["municipal"], valor: "municipal" },
          { match: ["federal"], valor: "federal" },
        ], "federal");

        const parsed = cursoInput.safeParse({
          nombre: nombreFormateado,
          descripcion: texto(row.descripcion),
          nivelRequerido: soloDigitos(row.nivelRequerido) ?? 0,
          nivelGobierno,
          categoria: texto(row.categoria, "obligatorio"),
          duracionHoras: soloDigitos(row.duracionHoras) ?? 20,
          modalidad,
          tipoPrograma,
          bloque: soloDigitos(row.bloque),
          numero: soloDigitos(row.numero),
          institucionResponsable: texto(row.institucionResponsable),
          finalidad: resolverFinalidad(tipoPrograma, texto(row.finalidad)),
          fechaInicio: parseFechaDDMMYYYY(row.fechaInicio),
          fechaTermino: parseFechaDDMMYYYY(row.fechaTermino),
          horarioTexto: texto(row.horarioTexto),
          fechaEvaluacion: parseFechaDDMMYYYY(row.fechaEvaluacion),
          horarioEvaluacion: texto(row.horarioEvaluacion, null),
          duracionEvaluacion: texto(row.duracionEvaluacion, null),
        });

        if (!parsed.success) {
          errores.push({
            fila: i + 1,
            error: parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", "),
          });
          continue;
        }

        const nombreKey = parsed.data.nombre.toLowerCase();
        if (nombresVistos.has(nombreKey)) {
          errores.push({ fila: i + 1, error: `Curso "${parsed.data.nombre}" duplicado en el mismo archivo` });
          continue;
        }
        nombresVistos.add(nombreKey);

        try {
          const existente = await buscarCursoPorNombre(parsed.data.nombre);
          if (existente) {
            errores.push({ fila: i + 1, error: `Curso "${parsed.data.nombre}" ya existe en el sistema` });
            continue;
          }

          const id = await crearCurso({
            ...parsed.data,
            descripcion: parsed.data.descripcion ?? null,
            nivelGobierno: parsed.data.nivelGobierno ?? null,
            creadoPor: ctx.user.id,
          });

          if (institucionPredeterminadaId) {
            await asignarCursoInstitucion({
              cursoId: id,
              institucionId: institucionPredeterminadaId,
              cupoMaximo: 9999,
              cupoDisponible: 9999,
              fechaInicio: parsed.data.fechaInicio ?? null,
              fechaFin: parsed.data.fechaTermino ?? null,
              activo: true,
            });
          }

          creados.push(id);
        } catch (err: any) {
          errores.push({
            fila: i + 1,
            error: err.message?.includes("Duplicate") ? "Curso duplicado" : err.message ?? "Error desconocido",
          });
        }
      }

      return { totalProcesados: input.registros.length, creados: creados.length, errores };
    }),
});

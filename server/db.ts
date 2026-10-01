import { drizzle } from "drizzle-orm/mysql2";
import type { MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eq, and, like, or, sql, desc, inArray, getTableColumns, ne, isNull, isNotNull, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { randomInt } from "crypto";
import * as schema from "../drizzle/schema";
import type { InsertServidorPublico, InsertAuditoria } from "../drizzle/schema";
import { dbCircuitBreaker } from "./middleware/circuitBreaker";
import { CALIFICACION_APROBATORIA, CURSOS_REQUERIDOS_ACREDITACION, PREGUNTAS_AUTOEVALUACION, PREGUNTAS_EVALUADOR } from "../shared/const";
import { validarCorreoEvaluador } from "./lib/validarCorreo";
import { generarPasswordTemporal, hashPassword } from "./auth";
import { enviarCorreoEvaluador } from "./lib/email";

let db: (MySql2Database<typeof schema> & { $client: mysql.Pool }) | null = null;
let pool: mysql.Pool | null = null;

export async function getDb() {
  if (!db) {
    pool = mysql.createPool({
      uri: process.env.DATABASE_URL!,
      waitForConnections: true,
      connectionLimit: 20,
      queueLimit: 100,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      connectTimeout: 10000,
      // Sin esto, mysql2 convierte Date objects usando la timezone LOCAL del
      // proceso Node al guardar/leer TIMESTAMP -- si el server no corre en
      // UTC (ej. America/Mexico_City), z.coerce.date() en fechaInicio/fechaFin
      // de cursos_instituciones se guarda desfasado un dia (medianoche UTC
      // se interpreta como hora local y se resta el offset). "Z" fuerza UTC
      // fijo sin importar en que timezone corra el proceso.
      timezone: "Z",
    });
    db = drizzle(pool, { schema, mode: "default" });
  }
  // TS pierde el narrowing de esta variable module-level tras el await de
  // arriba (no puede probar que otra llamada concurrente no la reasigno a
  // null) -- el invariante real es que en este punto siempre esta asignada.
  return db!;
}

export async function safeQuery<T>(fn: () => Promise<T>): Promise<T> {
  return dbCircuitBreaker.execute(fn);
}

export async function getUserByEmail(email: string) {
  const d = await getDb();
  const [user] = await d
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email));
  return user ?? null;
}

export async function getUserByCurp(curp: string) {
  const d = await getDb();
  const [user] = await d
    .select()
    .from(schema.users)
    .where(eq(schema.users.curp, curp));
  return user ?? null;
}

export async function getUserById(id: number) {
  const d = await getDb();
  const [user] = await d
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, id));
  return user ?? null;
}

export async function createUser(data: schema.InsertUser) {
  const d = await getDb();
  const [result] = await d.insert(schema.users).values(data);
  return result.insertId;
}

export async function actualizarPasswordUsuario(
  userId: number,
  passwordHash: string,
) {
  const d = await getDb();
  await d
    .update(schema.users)
    .set({ passwordHash })
    .where(eq(schema.users.id, userId));
}

export async function crearTokenRestablecimiento(
  userId: number,
  token: string,
  expiresAt: Date,
) {
  const d = await getDb();
  await d
    .insert(schema.passwordResetTokens)
    .values({ userId, token, expiresAt });
}

export async function obtenerTokenRestablecimiento(token: string) {
  const d = await getDb();
  const [record] = await d
    .select()
    .from(schema.passwordResetTokens)
    .where(eq(schema.passwordResetTokens.token, token));
  return record ?? null;
}

export async function marcarTokenComoUsado(id: number) {
  const d = await getDb();
  await d
    .update(schema.passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(schema.passwordResetTokens.id, id));
}

// ─── Usuarios (Admin) ────────────────────────────────────────────────

export async function listarUsuarios(search?: string, page = 1, limit = 20, estatus?: "activo" | "inactivo") {
  const d = await getDb();
  const conditions = [];

  if (search) {
    const term = `%${search}%`;
    conditions.push(
      or(
        like(schema.users.nombre, term),
        like(schema.users.email, term),
      ),
    );
  }

  // totalActivos/totalInactivos deben quedar fuera de este filtro -- son los
  // contadores que se muestran en los tabs "Activos"/"Inactivos" (ver mas abajo),
  // si el estatus tambien entrara aqui uno de los dos conteos siempre daria 0
  // (isActive=true AND isActive=false nunca es cierto).
  const itemConditions = estatus ? [...conditions, eq(schema.users.isActive, estatus === "activo")] : conditions;

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const whereItems = itemConditions.length > 0 ? and(...itemConditions) : undefined;
  const offset = (page - 1) * limit;

  // No seleccionar passwordHash aquí — el listado se manda al frontend en cada
  // carga de página y quedaría expuesto en el Network tab.
  // totalActivos/totalInactivos son conteos globales (no de la pagina actual)
  // para que las tarjetas de resumen del admin sigan siendo correctas con
  // paginacion real -- antes se calculaban filtrando el arreglo completo,
  // que ya no llega entero al cliente.
  const [items, countResult, activosResult, inactivosResult] = await Promise.all([
    d
      .select({
        id: schema.users.id,
        nombre: schema.users.nombre,
        curp: schema.users.curp,
        email: schema.users.email,
        role: schema.users.role,
        isActive: schema.users.isActive,
        createdAt: schema.users.createdAt,
        updatedAt: schema.users.updatedAt,
      })
      .from(schema.users)
      .where(whereItems)
      .orderBy(desc(schema.users.createdAt))
      .limit(limit)
      .offset(offset),
    d.select({ count: sql<number>`count(*)` }).from(schema.users).where(whereItems),
    d.select({ count: sql<number>`count(*)` }).from(schema.users).where(and(...conditions, eq(schema.users.isActive, true))),
    d.select({ count: sql<number>`count(*)` }).from(schema.users).where(and(...conditions, eq(schema.users.isActive, false))),
  ]);

  return {
    items,
    total: countResult[0]?.count ?? 0,
    totalActivos: activosResult[0]?.count ?? 0,
    totalInactivos: inactivosResult[0]?.count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((countResult[0]?.count ?? 0) / limit),
  };
}

export async function cambiarRolUsuario(id: number, role: string) {
  const d = await getDb();
  await d
    .update(schema.users)
    .set({ role: role as any, updatedAt: new Date() })
    .where(eq(schema.users.id, id));
}

export async function toggleActivoUsuario(id: number) {
  const d = await getDb();
  await d.transaction(async (tx) => {
    const [user] = await tx
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id));

    if (!user) {
      throw new Error("Usuario no encontrado");
    }

    const activar = !user.isActive;

    await tx
      .update(schema.users)
      .set({ isActive: activar, updatedAt: new Date() })
      .where(eq(schema.users.id, id));

    if (!activar) {
      await tx.update(schema.servidoresPublicos)
        .set({ estatus: "inactivo" })
        .where(eq(schema.servidoresPublicos.userId, id));
    }

    if (activar) {
      const [srvExistente] = await tx.select({ id: schema.servidoresPublicos.id })
        .from(schema.servidoresPublicos)
        .where(eq(schema.servidoresPublicos.userId, id));

      if (!srvExistente) {
        await tx.insert(schema.servidoresPublicos).values({
          userId: id,
          nombreCompleto: user.nombre,
          rfc: `UREG${String(id).padStart(9, "0")}`,
          curp: `UREG${String(id).padStart(14, "0")}`,
          cargo: "Por definir",
          dependencia: "Por definir",
          nivel: "federal",
          grupoFuncion: "ADMO",
          // Reactivación sin fila previa (caso raro) -- SDPC como placeholder
          // seguro, igual que en usuarios.crear; admin corrige si aplica.
          programa: "SDPC",
          fechaIngreso: new Date(),
          datosContacto: user.email,
          estatus: "activo",
          creadoPor: id,
          actualizadoPor: id,
        });
      } else {
        await tx.update(schema.servidoresPublicos)
          .set({ estatus: "activo" })
          .where(eq(schema.servidoresPublicos.id, srvExistente.id));
      }
    }
  });
}

export async function servidorIdDeUsuario(userId: number): Promise<number | null> {
  const d = await getDb();
  const [srv] = await d.select({ id: schema.servidoresPublicos.id })
    .from(schema.servidoresPublicos)
    .where(eq(schema.servidoresPublicos.userId, userId));
  return srv?.id ?? null;
}

export async function resetearPasswordUsuario(id: number, passwordHash: string) {
  const d = await getDb();
  await d.update(schema.users)
    .set({ passwordHash })
    .where(eq(schema.users.id, id));
}

// Elimina el usuario y todo lo que depende exclusivamente de él (perfil, solicitudes).
// El servidor público asociado no se borra — se desvincula y marca inactivo.
// ─── Servidores Públicos ─────────────────────────────────────────────

// Señal tipada de "RFC o CURP duplicado" para que el router (o el loop de
// importación CSV) la traduzca a un mensaje de negocio real, sin adivinar
// buscando texto dentro de `err.message` -- eso ya estaba roto: drizzle-orm
// envuelve el error real de mysql2 en un DrizzleQueryError cuyo `.message`
// es solo "Failed query: insert into ...", nunca el texto "Duplicate entry"
// (verificado en vivo). El código y el sqlMessage reales viven en `.cause`.
export class ServidorDuplicadoError extends Error {
  constructor(public readonly campo: "rfc" | "curp") {
    super(`Servidor duplicado por ${campo}`);
    this.name = "ServidorDuplicadoError";
  }
}

function campoDuplicadoServidor(err: unknown): "rfc" | "curp" | null {
  if (codigoMysql(err) !== "ER_DUP_ENTRY") return null;
  const sqlMessage = (err as any)?.sqlMessage ?? (err as any)?.cause?.sqlMessage ?? "";
  if (sqlMessage.includes("_rfc_unique")) return "rfc";
  if (sqlMessage.includes("_curp_unique")) return "curp";
  return null;
}

export async function crearServidor(data: InsertServidorPublico) {
  const d = await getDb();
  try {
    const [result] = await d.insert(schema.servidoresPublicos).values(data);
    return result.insertId;
  } catch (err) {
    const campo = campoDuplicadoServidor(err);
    if (campo) throw new ServidorDuplicadoError(campo);
    throw err;
  }
}

export async function listarServidores(filtros?: {
  search?: string;
  dependencia?: string;
  nivel?: string;
  estatus?: string;
  grupoFuncion?: string;
  page?: number;
  limit?: number;
}) {
  const d = await getDb();
  const conditions = [];

  if (filtros?.search) {
    const term = `%${filtros.search}%`;
    conditions.push(
      or(
        like(schema.servidoresPublicos.nombreCompleto, term),
        like(schema.servidoresPublicos.rfc, term),
        like(schema.servidoresPublicos.curp, term),
        like(schema.servidoresPublicos.cargo, term),
      ),
    );
  }
  if (filtros?.dependencia) {
    conditions.push(eq(schema.servidoresPublicos.dependencia, filtros.dependencia));
  }
  if (filtros?.nivel) {
    conditions.push(eq(schema.servidoresPublicos.nivel, filtros.nivel as any));
  }
  if (filtros?.estatus) {
    conditions.push(eq(schema.servidoresPublicos.estatus, filtros.estatus as any));
  }
  if (filtros?.grupoFuncion) {
    conditions.push(eq(schema.servidoresPublicos.grupoFuncion, filtros.grupoFuncion as any));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = filtros?.limit ?? 20;
  const page = filtros?.page ?? 1;
  const offset = (page - 1) * limit;

  const [items, countResult] = await Promise.all([
    d
      .select({
        ...getTableColumns(schema.servidoresPublicos),
        // null = sin cuenta creada todavia, false = cuenta creada pero
        // faltan los 3 pasos de onboarding, true = registro completo
        registroCompletado: schema.perfilesServidor.completado,
      })
      .from(schema.servidoresPublicos)
      .leftJoin(
        schema.perfilesServidor,
        eq(schema.servidoresPublicos.userId, schema.perfilesServidor.userId),
      )
      .where(where)
      .orderBy(desc(schema.servidoresPublicos.createdAt))
      .limit(limit)
      .offset(offset),
    d
      .select({ count: sql<number>`count(*)` })
      .from(schema.servidoresPublicos)
      .where(where),
  ]);

  return {
    items,
    total: countResult[0]?.count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((countResult[0]?.count ?? 0) / limit),
  };
}

export async function obtenerServidorPorId(id: number) {
  const d = await getDb();
  const [servidor] = await d
    .select()
    .from(schema.servidoresPublicos)
    .where(eq(schema.servidoresPublicos.id, id));
  return servidor ?? null;
}

// nombreCompleto y curp viven duplicados en users (cuenta del trabajador --
// login por CURP, nombre en saludo/cedula) y servidores_publicos (este
// modulo, la fuente que edita el admin) -- 2 columnas por campo sin trigger
// ni sincronizacion. Hallazgo real (2026-09-30): un admin corrigio el
// nombre aqui y nunca se reflejo en la cedula porque esta lee users.nombre,
// que nunca se tocaba -- mismo hueco existia (mas grave) para curp: login
// es 100% contra users.curp (ver routers.ts::login), asi que corregir un
// CURP mal capturado desde aqui dejaba al trabajador sin poder loguearse
// con su CURP correcto. Si el servidor tiene cuenta vinculada y
// nombreCompleto/curp cambian, se propagan a users en la misma transaccion.
export async function actualizarServidor(
  id: number,
  data: Partial<InsertServidorPublico>,
) {
  const d = await getDb();
  try {
    if (data.nombreCompleto !== undefined || data.curp !== undefined) {
      await d.transaction(async (tx) => {
        await tx
          .update(schema.servidoresPublicos)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(schema.servidoresPublicos.id, id));
        const [servidor] = await tx
          .select({ userId: schema.servidoresPublicos.userId })
          .from(schema.servidoresPublicos)
          .where(eq(schema.servidoresPublicos.id, id));
        if (servidor?.userId) {
          const syncUsers: Partial<{ nombre: string; curp: string }> = {};
          if (data.nombreCompleto !== undefined) syncUsers.nombre = data.nombreCompleto;
          if (data.curp !== undefined) syncUsers.curp = data.curp;
          await tx.update(schema.users).set(syncUsers).where(eq(schema.users.id, servidor.userId));
        }
      });
    } else {
      await d
        .update(schema.servidoresPublicos)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(schema.servidoresPublicos.id, id));
    }
  } catch (err) {
    const campo = campoDuplicadoServidor(err);
    if (campo) throw new ServidorDuplicadoError(campo);
    throw err;
  }
}

export async function eliminarServidor(id: number) {
  const d = await getDb();
  await d.transaction(async (tx) => {
    const [srv] = await tx.select({ userId: schema.servidoresPublicos.userId }).from(schema.servidoresPublicos).where(eq(schema.servidoresPublicos.id, id));
    await tx.delete(schema.servidoresPublicos).where(eq(schema.servidoresPublicos.id, id));
    if (srv?.userId) {
      await tx.update(schema.users).set({ isActive: false }).where(eq(schema.users.id, srv.userId));
    }
  });
}

export async function eliminarServidoresBulk(ids: number[]) {
  const d = await getDb();
  await d.delete(schema.servidoresPublicos).where(inArray(schema.servidoresPublicos.id, ids));
}

export async function listarTodosIdsServidores(search?: string) {
  const d = await getDb();
  const where = search
    ? or(
        like(schema.servidoresPublicos.nombreCompleto, `%${search}%`),
        like(schema.servidoresPublicos.rfc, `%${search}%`),
        like(schema.servidoresPublicos.curp, `%${search}%`),
      )
    : undefined;
  const rows = await d.select({ id: schema.servidoresPublicos.id }).from(schema.servidoresPublicos).where(where);
  return rows.map((r) => r.id);
}

export async function obtenerServidorPorUserId(userId: number) {
  const d = await getDb();
  // userId no tiene constraint unico en servidores_publicos (a diferencia de
  // perfiles_servidor, que si lo tiene) -- orderBy+limit hace la lectura
  // deterministica (fila mas reciente) por si alguna vez existe mas de una
  // fila para el mismo usuario, en vez de depender del orden no garantizado
  // que devuelve MySQL sin ORDER BY.
  const [srv] = await d.select().from(schema.servidoresPublicos)
    .where(eq(schema.servidoresPublicos.userId, userId))
    .orderBy(desc(schema.servidoresPublicos.id))
    .limit(1);
  return srv ?? null;
}

export async function listarUpasDistintas() {
  const d = await getDb();
  const rows = await d.selectDistinct({ upa: schema.servidoresPublicos.upa }).from(schema.servidoresPublicos);
  const upas = rows.map((r) => r.upa).filter(Boolean) as string[];
  if (!upas.includes("CULTURA")) upas.push("CULTURA");
  if (!upas.includes("RE")) upas.push("RE");
  if (!upas.includes("INDAUTOR")) upas.push("INDAUTOR");
  return [...new Set(upas)].sort();
}

export async function listarUasDistintas() {
  const d = await getDb();
  const rows = await d.selectDistinct({ ua: schema.servidoresPublicos.ua }).from(schema.servidoresPublicos);
  return (rows.map((r) => r.ua).filter(Boolean) as string[]).sort();
}

export async function getServidoresStats() {
  const d = await getDb();
  const [byEstatus, byNivel, byGrupo, totalResult, byDependencia, byMes, solicitudesActivasResult] = await Promise.all([
    d
      .select({
        estatus: schema.servidoresPublicos.estatus,
        count: sql<number>`count(*)`,
      })
      .from(schema.servidoresPublicos)
      .groupBy(schema.servidoresPublicos.estatus),
    d
      .select({
        nivel: schema.servidoresPublicos.nivel,
        count: sql<number>`count(*)`,
      })
      .from(schema.servidoresPublicos)
      .groupBy(schema.servidoresPublicos.nivel),
    d
      .select({
        grupoFuncion: schema.servidoresPublicos.grupoFuncion,
        count: sql<number>`count(*)`,
      })
      .from(schema.servidoresPublicos)
      .groupBy(schema.servidoresPublicos.grupoFuncion),
    d
      .select({ count: sql<number>`count(*)` })
      .from(schema.servidoresPublicos),
    d
      .select({
        dependencia: schema.servidoresPublicos.dependencia,
        count: sql<number>`count(*)`,
      })
      .from(schema.servidoresPublicos)
      .groupBy(schema.servidoresPublicos.dependencia)
      .orderBy(sql`count(*) DESC`)
      .limit(10),
    // Tendencia de registro mensual = cuando el usuario completo su
    // auto-registro de 3 pasos (perfiles_servidor.created_at), NO cuando
    // el admin creo/importo el servidor (servidores_publicos.created_at,
    // que es un evento distinto -- carga masiva por CSV, no auto-registro).
    d
      .select({
        mes: sql<string>`DATE_FORMAT(created_at, '%Y-%m')`,
        count: sql<number>`count(*)`,
      })
      .from(schema.perfilesServidor)
      .groupBy(sql`DATE_FORMAT(created_at, '%Y-%m')`)
      .orderBy(sql`DATE_FORMAT(created_at, '%Y-%m') ASC`)
      .limit(12),
    // "pendiente" nunca ocurre en la practica -- la inscripcion es directa
    // (crearSolicitudConAsignacion siempre inserta estado "aprobada").
    // "aprobada" = en curso, todavia sin calificar (calificacion se pone
    // junto con el cambio a "completada" en solicitudes.ts) -- es la cola
    // real de trabajo del admin, no un contador que nunca se mueve.
    d
      .select({ count: sql<number>`count(*)` })
      .from(schema.solicitudesCurso)
      .where(eq(schema.solicitudesCurso.estado, "aprobada")),
  ]);

  return {
    total: totalResult[0]?.count ?? 0,
    byEstatus,
    byNivel,
    byGrupo,
    byDependencia,
    byMes,
    solicitudesActivas: solicitudesActivasResult[0]?.count ?? 0,
  };
}

// ─── Auditoría ───────────────────────────────────────────────────────

export async function crearAuditoria(data: InsertAuditoria) {
  const d = await getDb();
  await d.insert(schema.auditoria).values(data);
}

export async function listarAuditoria(filtros?: {
  servidorId?: number;
  usuarioId?: number;
  accion?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const d = await getDb();
  const conditions = [];

  if (filtros?.servidorId) {
    conditions.push(eq(schema.auditoria.servidorId, filtros.servidorId));
  }
  if (filtros?.usuarioId) {
    conditions.push(eq(schema.auditoria.usuarioId, filtros.usuarioId));
  }
  if (filtros?.accion) {
    conditions.push(eq(schema.auditoria.accion, filtros.accion as any));
  }
  if (filtros?.search) {
    const termino = `%${filtros.search}%`;
    const busqueda = [like(schema.auditoria.descripcion, termino)];
    const comoNumero = Number(filtros.search);
    if (Number.isFinite(comoNumero)) {
      busqueda.push(eq(schema.auditoria.servidorId, comoNumero));
    }
    conditions.push(or(...busqueda));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = filtros?.limit ?? 20;
  const page = filtros?.page ?? 1;
  const offset = (page - 1) * limit;

  const [items, countResult] = await Promise.all([
    d
      .select()
      .from(schema.auditoria)
      .where(where)
      .orderBy(desc(schema.auditoria.createdAt))
      .limit(limit)
      .offset(offset),
    d
      .select({ count: sql<number>`count(*)` })
      .from(schema.auditoria)
      .where(where),
  ]);

  return {
    items,
    total: countResult[0]?.count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((countResult[0]?.count ?? 0) / limit),
  };
}

// ─── Perfiles Servidor ───────────────────────────────────────────────

export async function obtenerPerfil(userId: number) {
  const d = await getDb();
  const [perfil] = await d
    .select()
    .from(schema.perfilesServidor)
    .where(eq(schema.perfilesServidor.userId, userId));
  return perfil ?? null;
}

export async function crearPerfil(data: schema.InsertPerfilServidor) {
  const d = await getDb();
  const [result] = await d.insert(schema.perfilesServidor).values(data);
  return result.insertId;
}

export async function actualizarPerfil(userId: number, data: Partial<schema.InsertPerfilServidor>) {
  const d = await getDb();
  await d
    .update(schema.perfilesServidor)
    .set(data)
    .where(eq(schema.perfilesServidor.userId, userId));
}

export async function listarSolicitudesBaja() {
  const d = await getDb();
  // No usar select() plano aquí — el join trae users.passwordHash al JSON enviado al navegador.
  // cargo viene de servidoresPublicos (unica fuente de verdad, perfilesServidor
  // ya no duplica estos datos -- ver comentario en schema.ts).
  return d
    .select({
      perfiles_servidor: schema.perfilesServidor,
      users: {
        id: schema.users.id,
        nombre: schema.users.nombre,
        curp: schema.users.curp,
        email: schema.users.email,
        role: schema.users.role,
        isActive: schema.users.isActive,
      },
      cargo: schema.servidoresPublicos.cargo,
    })
    .from(schema.perfilesServidor)
    .innerJoin(schema.users, eq(schema.perfilesServidor.userId, schema.users.id))
    .leftJoin(schema.servidoresPublicos, eq(schema.perfilesServidor.userId, schema.servidoresPublicos.userId))
    .where(eq(schema.perfilesServidor.solicitudBaja, true))
    .orderBy(desc(schema.perfilesServidor.fechaSolicitudBaja));
}

// ─── Cursos ──────────────────────────────────────────────────────────

export async function listarCursos(filtros?: {
  nivelMax?: number;
  nivelGobierno?: string | null;
  categoria?: string;
  modalidad?: string;
  tipoPrograma?: string;
  soloActivos?: boolean;
}) {
  const d = await getDb();
  const conditions = [];

  if (filtros?.soloActivos !== false) {
    conditions.push(eq(schema.cursos.activo, true));
  }
  if (filtros?.nivelMax) {
    conditions.push(sql`${schema.cursos.nivelRequerido} <= ${filtros.nivelMax}`);
  }
  if (filtros?.nivelGobierno) {
    conditions.push(
      or(
        eq(schema.cursos.nivelGobierno, filtros.nivelGobierno as any),
        sql`${schema.cursos.nivelGobierno} IS NULL`,
      )!,
    );
  }
  if (filtros?.categoria) {
    conditions.push(eq(schema.cursos.categoria, filtros.categoria));
  }
  if (filtros?.modalidad) {
    conditions.push(eq(schema.cursos.modalidad, filtros.modalidad as any));
  }
  if (filtros?.tipoPrograma) {
    conditions.push(eq(schema.cursos.tipoPrograma, filtros.tipoPrograma as any));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  return d.select().from(schema.cursos).where(where).orderBy(desc(schema.cursos.createdAt)).limit(500);
}

export async function obtenerCursoPorId(id: number) {
  const d = await getDb();
  const [curso] = await d.select().from(schema.cursos).where(eq(schema.cursos.id, id));
  return curso ?? null;
}

export async function crearCurso(data: schema.InsertCurso) {
  const d = await getDb();
  const [result] = await d.insert(schema.cursos).values(data);
  return result.insertId;
}

export async function actualizarCurso(id: number, data: Partial<schema.InsertCurso>) {
  const d = await getDb();
  await d.update(schema.cursos).set(data).where(eq(schema.cursos.id, id));
}

export async function toggleActivoCurso(id: number) {
  const d = await getDb();
  const [curso] = await d.select().from(schema.cursos).where(eq(schema.cursos.id, id));
  if (!curso) return;
  await d.update(schema.cursos).set({ activo: !curso.activo }).where(eq(schema.cursos.id, id));
}

export async function eliminarCurso(id: number) {
  const d = await getDb();
  await d.transaction(async (tx) => {
    // Sin esto, las solicitudes de este curso quedan huerfanas (cursoId ya no
    // existe) pero siguen contando en contarAcreditacion/contarAprobacionPorBloque.
    await tx.delete(schema.solicitudesCurso).where(eq(schema.solicitudesCurso.cursoId, id));
    await tx.delete(schema.cursosInstituciones).where(eq(schema.cursosInstituciones.cursoId, id));
    await tx.delete(schema.cursos).where(eq(schema.cursos.id, id));
  });
}

export async function buscarCursoPorNombre(nombre: string) {
  const d = await getDb();
  const [curso] = await d.select({ id: schema.cursos.id }).from(schema.cursos)
    .where(eq(schema.cursos.nombre, nombre));
  return curso ?? null;
}

// Busca institución por nombre (case/espacio-insensible); si no existe, la crea.
// Mientras el sistema tenga una sola institucion, todo curso se asigna a
// ella (sin importar el texto de institucionResponsable del CSV). Altas de
// institucion nuevas se hacen a mano (pagina Instituciones); su asignacion
// por bloque tambien a mano (Gestion de Cursos) cuando llegue a haber mas
// de una.
export async function obtenerInstitucionPredeterminada() {
  const d = await getDb();
  const [institucion] = await d
    .select({ id: schema.instituciones.id })
    .from(schema.instituciones)
    .where(eq(schema.instituciones.activo, true))
    .orderBy(schema.instituciones.id)
    .limit(1);

  return institucion?.id ?? null;
}

// ─── Instituciones ───────────────────────────────────────────────────

export async function listarInstituciones(soloActivas = true) {
  const d = await getDb();
  const where = soloActivas ? eq(schema.instituciones.activo, true) : undefined;
  return d.select().from(schema.instituciones).where(where).orderBy(desc(schema.instituciones.createdAt)).limit(500);
}

export async function crearInstitucion(data: schema.InsertInstitucion) {
  const d = await getDb();
  const [result] = await d.insert(schema.instituciones).values(data);
  return result.insertId;
}

export async function actualizarInstitucion(id: number, data: Partial<schema.InsertInstitucion>) {
  const d = await getDb();
  await d.update(schema.instituciones).set(data).where(eq(schema.instituciones.id, id));
}

export async function toggleActivoInstitucion(id: number) {
  const d = await getDb();
  const [inst] = await d.select().from(schema.instituciones).where(eq(schema.instituciones.id, id));
  if (!inst) return;
  await d.update(schema.instituciones).set({ activo: !inst.activo }).where(eq(schema.instituciones.id, id));
}

export async function eliminarInstitucion(id: number) {
  const d = await getDb();
  await d.transaction(async (tx) => {
    await tx.delete(schema.cursosInstituciones).where(eq(schema.cursosInstituciones.institucionId, id));
    await tx.delete(schema.instituciones).where(eq(schema.instituciones.id, id));
  });
}

// ─── Cursos ↔ Instituciones ──────────────────────────────────────────

export async function listarCursosInstituciones(cursoId: number) {
  const d = await getDb();
  return d
    .select()
    .from(schema.cursosInstituciones)
    .innerJoin(schema.instituciones, eq(schema.cursosInstituciones.institucionId, schema.instituciones.id))
    .where(and(eq(schema.cursosInstituciones.cursoId, cursoId), eq(schema.cursosInstituciones.activo, true)));
}

export async function asignarCursoInstitucion(data: schema.InsertCursoInstitucion) {
  const d = await getDb();
  const [result] = await d.insert(schema.cursosInstituciones).values(data);
  return result.insertId;
}

export async function eliminarCursoInstitucion(id: number) {
  const d = await getDb();
  await d.delete(schema.cursosInstituciones).where(eq(schema.cursosInstituciones.id, id));
}

// ─── Solicitudes Curso ───────────────────────────────────────────────

// Inscripcion directa: no hay paso de aprobacion de admin. Se resuelve (o
// crea) la liga curso-institucion usando la unica institucion activa del
// sistema, y la solicitud queda directo en estado "aprobada".
export async function crearSolicitudConAsignacion(
  userId: number,
  cursoId: number,
): Promise<{ ok: true; id: number } | { ok: false; error: "SIN_INSTITUCION" }> {
  const d = await getDb();
  return d.transaction(async (tx) => {
    const [institucion] = await tx
      .select({ id: schema.instituciones.id })
      .from(schema.instituciones)
      .where(eq(schema.instituciones.activo, true))
      .limit(1);

    if (!institucion) {
      return { ok: false, error: "SIN_INSTITUCION" };
    }

    const [ligaExistente] = await tx
      .select({ id: schema.cursosInstituciones.id })
      .from(schema.cursosInstituciones)
      .where(and(
        eq(schema.cursosInstituciones.cursoId, cursoId),
        eq(schema.cursosInstituciones.institucionId, institucion.id),
        eq(schema.cursosInstituciones.activo, true),
      ));

    let cursoInstitucionId: number;
    if (ligaExistente) {
      cursoInstitucionId = ligaExistente.id;
    } else {
      const [nuevaLiga] = await tx.insert(schema.cursosInstituciones).values({
        cursoId,
        institucionId: institucion.id,
        cupoMaximo: 9999,
        cupoDisponible: 9999,
        activo: true,
      });
      cursoInstitucionId = nuevaLiga.insertId;
    }

    const [nuevaSolicitud] = await tx.insert(schema.solicitudesCurso).values({
      userId,
      cursoId,
      estado: "aprobada",
      cursoInstitucionId,
    });

    return { ok: true, id: nuevaSolicitud.insertId };
  });
}

export async function listarSolicitudesUsuario(userId: number) {
  const d = await getDb();
  return d
    .select()
    .from(schema.solicitudesCurso)
    .innerJoin(schema.cursos, eq(schema.solicitudesCurso.cursoId, schema.cursos.id))
    .leftJoin(schema.cursosInstituciones, eq(schema.solicitudesCurso.cursoInstitucionId, schema.cursosInstituciones.id))
    .leftJoin(schema.instituciones, eq(schema.cursosInstituciones.institucionId, schema.instituciones.id))
    .where(eq(schema.solicitudesCurso.userId, userId))
    .orderBy(desc(schema.solicitudesCurso.createdAt));
}

export async function listarTodasSolicitudes(filtros?: { estado?: string; search?: string; page?: number; limit?: number }) {
  const d = await getDb();
  const conditions = [];
  if (filtros?.estado) {
    conditions.push(eq(schema.solicitudesCurso.estado, filtros.estado as any));
  }
  if (filtros?.search) {
    const termino = `%${escaparComodinesLike(filtros.search)}%`;
    conditions.push(or(like(schema.users.nombre, termino), like(schema.users.curp, termino)));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = filtros?.limit ?? 20;
  const page = filtros?.page ?? 1;
  const offset = (page - 1) * limit;

  // No usar select() plano aquí — el join trae users.passwordHash al JSON enviado al navegador.
  const [items, countResult] = await Promise.all([
    d
      .select({
        solicitudes_curso: schema.solicitudesCurso,
        cursos: schema.cursos,
        users: {
          id: schema.users.id,
          nombre: schema.users.nombre,
          curp: schema.users.curp,
          email: schema.users.email,
          role: schema.users.role,
          isActive: schema.users.isActive,
        },
      })
      .from(schema.solicitudesCurso)
      .innerJoin(schema.cursos, eq(schema.solicitudesCurso.cursoId, schema.cursos.id))
      .innerJoin(schema.users, eq(schema.solicitudesCurso.userId, schema.users.id))
      .where(where)
      .orderBy(desc(schema.solicitudesCurso.createdAt))
      .limit(limit)
      .offset(offset),
    d
      .select({ count: sql<number>`count(*)` })
      .from(schema.solicitudesCurso)
      .innerJoin(schema.users, eq(schema.solicitudesCurso.userId, schema.users.id))
      .where(where),
  ]);

  return {
    items,
    total: countResult[0]?.count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((countResult[0]?.count ?? 0) / limit),
  };
}

export async function exportarTodasSolicitudes(filtros?: { estado?: string; search?: string }) {
  const d = await getDb();
  const conditions = [];
  if (filtros?.estado) {
    conditions.push(eq(schema.solicitudesCurso.estado, filtros.estado as any));
  }
  if (filtros?.search) {
    const termino = `%${escaparComodinesLike(filtros.search)}%`;
    conditions.push(or(like(schema.users.nombre, termino), like(schema.users.curp, termino)));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limite = 10000;

  // No usar select() plano aquí — el join trae users.passwordHash al JSON enviado al navegador.
  const [items, countResult] = await Promise.all([
    d
      .select({
        solicitudes_curso: schema.solicitudesCurso,
        cursos: schema.cursos,
        instituciones: { nombre: schema.instituciones.nombre },
        users: {
          nombre: schema.users.nombre,
          curp: schema.users.curp,
          email: schema.users.email,
        },
      })
      .from(schema.solicitudesCurso)
      .innerJoin(schema.cursos, eq(schema.solicitudesCurso.cursoId, schema.cursos.id))
      .innerJoin(schema.users, eq(schema.solicitudesCurso.userId, schema.users.id))
      .leftJoin(schema.cursosInstituciones, eq(schema.solicitudesCurso.cursoInstitucionId, schema.cursosInstituciones.id))
      .leftJoin(schema.instituciones, eq(schema.cursosInstituciones.institucionId, schema.instituciones.id))
      .where(where)
      .orderBy(desc(schema.solicitudesCurso.createdAt))
      .limit(limite),
    d
      .select({ count: sql<number>`count(*)` })
      .from(schema.solicitudesCurso)
      .innerJoin(schema.users, eq(schema.solicitudesCurso.userId, schema.users.id))
      .where(where),
  ]);

  return { items, total: countResult[0]?.count ?? 0, truncado: (countResult[0]?.count ?? 0) > limite };
}

export async function contarInscritosPorCurso() {
  const d = await getDb();
  return d
    .select({
      cursoId: schema.cursos.id,
      nombre: schema.cursos.nombre,
      bloque: schema.cursos.bloque,
      total: sql<number>`count(${schema.solicitudesCurso.id})`,
    })
    .from(schema.solicitudesCurso)
    .innerJoin(schema.cursos, eq(schema.solicitudesCurso.cursoId, schema.cursos.id))
    .where(inArray(schema.solicitudesCurso.estado, ["aprobada", "completada"]))
    .groupBy(schema.cursos.id, schema.cursos.nombre, schema.cursos.bloque)
    .orderBy(desc(sql`count(${schema.solicitudesCurso.id})`));
}

export async function obtenerSolicitud(id: number) {
  const d = await getDb();
  const [sol] = await d.select().from(schema.solicitudesCurso).where(eq(schema.solicitudesCurso.id, id));
  return sol ?? null;
}

export async function actualizarSolicitud(id: number, data: Partial<schema.InsertSolicitudCurso>) {
  const d = await getDb();
  await d.update(schema.solicitudesCurso).set(data).where(eq(schema.solicitudesCurso.id, id));
}

export async function tieneSolicitudActiva(userId: number, cursoId: number) {
  const d = await getDb();
  const [existing] = await d
    .select({ id: schema.solicitudesCurso.id })
    .from(schema.solicitudesCurso)
    .where(
      and(
        eq(schema.solicitudesCurso.userId, userId),
        eq(schema.solicitudesCurso.cursoId, cursoId),
        or(
          eq(schema.solicitudesCurso.estado, "pendiente"),
          eq(schema.solicitudesCurso.estado, "aprobada"),
        ),
      ),
    );
  return !!existing;
}

// Conteo de servidores acreditados vs no acreditados, para el resumen que
// ve el admin en Solicitudes. Acreditado = >= CURSOS_REQUERIDOS_ACREDITACION
// cursos completados con calificacion >= CALIFICACION_APROBATORIA.
export async function contarAcreditacion() {
  const d = await getDb();

  const usuarios = await d
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.role, "user"), eq(schema.users.isActive, true)));

  if (usuarios.length === 0) {
    return { acreditados: 0, noAcreditados: 0, total: 0 };
  }

  const ids = usuarios.map((u) => u.id);
  const completadas = await d
    .select({
      userId: schema.solicitudesCurso.userId,
      calificacion: schema.solicitudesCurso.calificacion,
    })
    .from(schema.solicitudesCurso)
    .where(
      and(
        eq(schema.solicitudesCurso.estado, "completada"),
        inArray(schema.solicitudesCurso.userId, ids),
      ),
    );

  const aprobadasPorUsuario = new Map<number, number>();
  for (const c of completadas) {
    if ((c.calificacion ?? 0) >= CALIFICACION_APROBATORIA) {
      aprobadasPorUsuario.set(c.userId, (aprobadasPorUsuario.get(c.userId) ?? 0) + 1);
    }
  }

  let acreditados = 0;
  for (const id of ids) {
    if ((aprobadasPorUsuario.get(id) ?? 0) >= CURSOS_REQUERIDOS_ACREDITACION) acreditados++;
  }

  return { acreditados, noAcreditados: ids.length - acreditados, total: ids.length };
}

// Conteo de aprobados/reprobados por bloque -- solo considera solicitudes en
// estado "completada" (calificacion >= CALIFICACION_APROBATORIA = pasan).
export async function contarAprobacionPorBloque() {
  const d = await getDb();
  const rows = await d
    .select({
      bloque: schema.cursos.bloque,
      calificacion: schema.solicitudesCurso.calificacion,
    })
    .from(schema.solicitudesCurso)
    .innerJoin(schema.cursos, eq(schema.solicitudesCurso.cursoId, schema.cursos.id))
    .where(eq(schema.solicitudesCurso.estado, "completada"));

  const porBloque = new Map<number | null, { pasan: number; noPasan: number }>();
  for (const row of rows) {
    const key = row.bloque ?? null;
    if (!porBloque.has(key)) porBloque.set(key, { pasan: 0, noPasan: 0 });
    const entry = porBloque.get(key)!;
    if ((row.calificacion ?? 0) >= CALIFICACION_APROBATORIA) entry.pasan++;
    else entry.noPasan++;
  }

  return [...porBloque.entries()]
    .sort(([a], [b]) => {
      if (a === null) return 1;
      if (b === null) return -1;
      return a - b;
    })
    .map(([bloque, counts]) => ({ bloque, ...counts }));
}

// ─── Inconformidad ───────────────────────────────────────────────────

export async function obtenerFactoresConfig() {
  const d = await getDb();
  return d.select().from(schema.factoresInconformidadConfig);
}

export async function obtenerEstadoInconformidad(userId: number): Promise<"borrador" | "enviado" | null> {
  const d = await getDb();
  const [cabecera] = await d.select({ estado: schema.inconformidades.estado })
    .from(schema.inconformidades)
    .where(eq(schema.inconformidades.userId, userId));
  return cabecera?.estado ?? null;
}

// ─── Config del modulo Inconformidad (Centro de Modulos) ──────────────

export async function obtenerConfigModuloInconformidad() {
  const d = await getDb();
  const [row] = await d.select({
    id: schema.inconformidadModuloConfig.id,
    habilitado: schema.inconformidadModuloConfig.habilitado,
    fechaDesde: schema.inconformidadModuloConfig.fechaDesde,
    fechaHasta: schema.inconformidadModuloConfig.fechaHasta,
    actualizadoPor: schema.inconformidadModuloConfig.actualizadoPor,
    actualizadoPorNombre: schema.users.nombre,
    updatedAt: schema.inconformidadModuloConfig.updatedAt,
  })
    .from(schema.inconformidadModuloConfig)
    .leftJoin(schema.users, eq(schema.users.id, schema.inconformidadModuloConfig.actualizadoPor))
    .where(eq(schema.inconformidadModuloConfig.id, 1));
  if (row) return row;
  // Defensivo: si el seed nunca corrio, no romper el modulo ya en uso --
  // se comporta como si estuviera habilitado (mismo estado que tenia antes
  // de que existiera este control).
  return { id: 1, habilitado: true, fechaDesde: null, fechaHasta: null, actualizadoPor: null, actualizadoPorNombre: null, updatedAt: new Date() };
}

// ─── Autoevaluación ──────────────────────────────────────────────

// Pura, sin DB -- Fisher-Yates con crypto.randomInt (nunca Math.random,
// nunca ORDER BY RAND() -- mismo criterio que el sorteo de Compañeros que
// tenía Promoción antes del replanteo a selección manual, ver
// docs/superpowers/specs/2026-09-16-promocion-replanteo-design.md sección
// 9). El banco de Autoevaluación es chico (60 filas) -- se trae completo a
// memoria y se randomiza en el proceso, nunca en SQL.
export function sortearPreguntasAutoevaluacion(idsDisponibles: number[], cantidad: number): number[] {
  const copia = [...idsDisponibles];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia.slice(0, cantidad);
}

// Fórmula confirmada por el cliente 2026-09-22: 28 preguntas, si todas son
// correctas el puntaje es 14 -- cada acierto vale medio punto. Se deja
// aislada en su propia función de todas formas (no inline en
// enviarAutoevaluacion) porque el mismo patrón de "acierto -> puntaje" se
// repite para Evaluadores con otros pesos (Jefe: 1pt/acierto máx 14;
// Compañero: 6/14 pt/acierto máx 6).
export function calcularPuntajeAutoevaluacion(aciertos: number): number {
  return aciertos * 0.5;
}

// Fórmulas confirmadas por el cliente 2026-09-22 (transcript real). Jefe:
// banco propio de 60, sorteo de 14, 1pt/acierto, máx 14. Compañero: banco
// propio DISTINTO de 60, sorteo de 14, 6/14 pt/acierto, máx 6 (hay 2
// Compañeros por promoción, cada uno evalúa por separado: 6+6=12). Total
// del proceso de desempeño = 40 (14 autoevaluación + 14 jefe + 6 + 6).
export function calcularPuntajeEvaluadorJefe(aciertos: number): number {
  return aciertos * 1;
}

export function calcularPuntajeEvaluadorCompaniero(aciertos: number): number {
  return aciertos * (6 / 14);
}

export type ComponentePuntaje = { estado: "borrador" | "enviado"; puntaje: number | null };

// Suma solo los componentes en estado "enviado" -- un componente en
// "borrador" o inexistente (null) cuenta como 0 en el total pero NO marca
// completo, para distinguir "sacó 0 real" de "todavía no contesta" en la UI
// (ver Review Focus del plan).
export function calcularResultadoPromocion(componentes: {
  autoevaluacion: ComponentePuntaje | null;
  jefe: ComponentePuntaje | null;
  companero1: ComponentePuntaje | null;
  companero2: ComponentePuntaje | null;
}): { total: number; completo: boolean } {
  const lista = [componentes.autoevaluacion, componentes.jefe, componentes.companero1, componentes.companero2];
  const total = lista.reduce((acc, c) => acc + (c?.estado === "enviado" ? (c.puntaje ?? 0) : 0), 0);
  const completo = lista.every((c) => c?.estado === "enviado");
  return { total, completo };
}

// Cuenta días hábiles (lunes-viernes) desde `desde`, sin contar el propio
// día de salida como el primero. "Hábiles" excluye solo sábado/domingo
// hasta que el cliente diga lo contrario (mismo criterio ya usado para el
// límite de medianoche de Inconformidad en America/Mexico_City -- ver
// CLAUDE.md). Usa getUTCDay() a propósito (no getDay()) para que el
// resultado no dependa de la zona horaria del proceso que lo corre
// (Railway puede correr en UTC) -- el conteo de días hábiles es el mismo
// sin importar timezone, solo importa qué día de la semana es.
export function calcularExpiracion3DiasHabiles(desde: Date): Date {
  const resultado = new Date(desde);
  let diasHabilesAgregados = 0;
  while (diasHabilesAgregados < 3) {
    resultado.setUTCDate(resultado.getUTCDate() + 1);
    const diaSemana = resultado.getUTCDay(); // 0=domingo, 6=sabado
    if (diaSemana !== 0 && diaSemana !== 6) {
      diasHabilesAgregados++;
    }
  }
  return resultado;
}

type EstadoAutoevaluacion =
  | { estado: "sin_promocion" }
  | { estado: "no_iniciada" }
  | { estado: "borrador"; preguntas: { preguntaId: number; texto: string; respuestaElegida: (typeof schema.LIKERT_OPCIONES)[number] | null }[] }
  | { estado: "enviado"; puntaje: number; enviadoAt: Date };

// Lectura -- nunca se esconde, igual que el resto del sistema (un borrador
// en progreso o ya enviado siempre se puede volver a ver).
export async function miAutoevaluacion(userId: number): Promise<EstadoAutoevaluacion> {
  const d = await getDb();
  const [promocion] = await d.select({ id: schema.promociones.id })
    .from(schema.promociones)
    .where(eq(schema.promociones.userId, userId));
  if (!promocion) return { estado: "sin_promocion" };

  const [autoevaluacion] = await d.select({
    id: schema.autoevaluaciones.id,
    estado: schema.autoevaluaciones.estado,
    puntaje: schema.autoevaluaciones.puntaje,
    enviadoAt: schema.autoevaluaciones.enviadoAt,
  })
    .from(schema.autoevaluaciones)
    .where(eq(schema.autoevaluaciones.promocionId, promocion.id));
  if (!autoevaluacion) return { estado: "no_iniciada" };

  if (autoevaluacion.estado === "enviado") {
    return { estado: "enviado", puntaje: autoevaluacion.puntaje ?? 0, enviadoAt: autoevaluacion.enviadoAt! };
  }

  const preguntas = await d.select({
    preguntaId: schema.autoevaluacionRespuestas.preguntaId,
    texto: schema.autoevaluacionPreguntas.texto,
    respuestaElegida: schema.autoevaluacionRespuestas.respuestaElegida,
  })
    .from(schema.autoevaluacionRespuestas)
    .innerJoin(schema.autoevaluacionPreguntas, eq(schema.autoevaluacionPreguntas.id, schema.autoevaluacionRespuestas.preguntaId))
    .where(eq(schema.autoevaluacionRespuestas.autoevaluacionId, autoevaluacion.id))
    // Mismo fix que miEvaluacion (Evaluadores, revision final 2026-09-22):
    // sin esto el orden dependia de PK/insertion order de MySQL, no un
    // contrato real -- el wizard indexa por posicion y el arreglo se
    // re-obtiene tras "iniciar" invalidar la query, asi que el orden debe
    // estar garantizado, no ser incidental.
    .orderBy(schema.autoevaluacionRespuestas.id);

  return { estado: "borrador", preguntas };
}

export async function iniciarAutoevaluacion(userId: number): Promise<{ ok: true } | { ok: false; error: "SIN_PROMOCION" | "YA_INICIADA" | "BANCO_INSUFICIENTE" }> {
  const d = await getDb();
  try {
    return await d.transaction(async (tx) => {
      const [promocion] = await tx.select({ id: schema.promociones.id })
        .from(schema.promociones)
        .where(eq(schema.promociones.userId, userId));
      if (!promocion) return { ok: false as const, error: "SIN_PROMOCION" as const };

      const banco = await tx.select({ id: schema.autoevaluacionPreguntas.id })
        .from(schema.autoevaluacionPreguntas)
        .where(eq(schema.autoevaluacionPreguntas.activo, true));

      // Guard ANTES de sortear/insertar nada: sortearPreguntasAutoevaluacion
      // silenciosamente regresa menos de `cantidad` si el banco es corto
      // (comportamiento correcto y ya probado para esa funcion aislada), pero
      // dejar que iniciarAutoevaluacion siga de largo con eso comite una fila
      // con menos de 28 respuestas -- el router.enviar exige exactamente 28
      // (.length(PREGUNTAS_AUTOEVALUACION)), autoevaluaciones.promocionId es
      // unico (no hay reintento posible), asi que el trabajador queda
      // permanentemente bloqueado sin ninguna via de recuperacion. Cubre
      // tambien el caso banco vacio (banco.length === 0), donde ademas
      // tx.insert(...).values([]) tronaria con el error crudo de Drizzle.
      if (banco.length < PREGUNTAS_AUTOEVALUACION) {
        return { ok: false as const, error: "BANCO_INSUFICIENTE" as const };
      }

      const sorteadas = sortearPreguntasAutoevaluacion(banco.map((p) => p.id), PREGUNTAS_AUTOEVALUACION);

      const [insertAutoevaluacion] = await tx.insert(schema.autoevaluaciones).values({
        promocionId: promocion.id,
        estado: "borrador",
      });
      const autoevaluacionId = insertAutoevaluacion.insertId;

      await tx.insert(schema.autoevaluacionRespuestas).values(
        sorteadas.map((preguntaId) => ({ autoevaluacionId, preguntaId })),
      );

      return { ok: true as const };
    });
  } catch (err: any) {
    if (codigoMysql(err) === "ER_DUP_ENTRY") return { ok: false, error: "YA_INICIADA" };
    throw err;
  }
}

export async function enviarAutoevaluacion(
  userId: number,
  respuestas: { preguntaId: number; respuestaElegida: (typeof schema.LIKERT_OPCIONES)[number] }[],
): Promise<{ ok: true; puntaje: number } | { ok: false; error: "NO_INICIADA" | "YA_ENVIADA" | "RESPUESTAS_INVALIDAS" }> {
  const d = await getDb();
  return d.transaction(async (tx) => {
    const [autoevaluacion] = await tx.select({
      id: schema.autoevaluaciones.id,
      estado: schema.autoevaluaciones.estado,
    })
      .from(schema.autoevaluaciones)
      .innerJoin(schema.promociones, eq(schema.promociones.id, schema.autoevaluaciones.promocionId))
      .where(eq(schema.promociones.userId, userId));
    if (!autoevaluacion) return { ok: false, error: "NO_INICIADA" };
    if (autoevaluacion.estado !== "borrador") return { ok: false, error: "YA_ENVIADA" };

    const asignadas = await tx.select({
      preguntaId: schema.autoevaluacionRespuestas.preguntaId,
      respuestaCorrecta: schema.autoevaluacionPreguntas.respuestaCorrecta,
    })
      .from(schema.autoevaluacionRespuestas)
      .innerJoin(schema.autoevaluacionPreguntas, eq(schema.autoevaluacionPreguntas.id, schema.autoevaluacionRespuestas.preguntaId))
      .where(eq(schema.autoevaluacionRespuestas.autoevaluacionId, autoevaluacion.id));

    if (respuestas.length !== asignadas.length) return { ok: false, error: "RESPUESTAS_INVALIDAS" };

    const idsAsignados = new Set(asignadas.map((a) => a.preguntaId));
    const idsRecibidos = new Set(respuestas.map((r) => r.preguntaId));
    const mismoSet = idsAsignados.size === idsRecibidos.size && [...idsAsignados].every((id) => idsRecibidos.has(id));
    if (!mismoSet) return { ok: false, error: "RESPUESTAS_INVALIDAS" };

    const mapaCorrectas = new Map(asignadas.map((a) => [a.preguntaId, a.respuestaCorrecta]));
    let aciertos = 0;
    for (const r of respuestas) {
      const correcta = mapaCorrectas.get(r.preguntaId);
      if (correcta === r.respuestaElegida) aciertos++;
      await tx.update(schema.autoevaluacionRespuestas)
        .set({ respuestaElegida: r.respuestaElegida })
        .where(and(
          eq(schema.autoevaluacionRespuestas.autoevaluacionId, autoevaluacion.id),
          eq(schema.autoevaluacionRespuestas.preguntaId, r.preguntaId),
        ));
    }

    const puntaje = calcularPuntajeAutoevaluacion(aciertos);
    await tx.update(schema.autoevaluaciones)
      .set({ estado: "enviado", puntaje, enviadoAt: new Date() })
      .where(eq(schema.autoevaluaciones.id, autoevaluacion.id));

    await tx.insert(schema.auditoria).values({
      servidorId: null,
      usuarioId: userId,
      accion: "actualizar",
      descripcion: `Envió su Autoevaluación (${aciertos}/${respuestas.length} aciertos)`,
    });

    return { ok: true, puntaje };
  });
}

function normalizarOpcionLikert(valor: string): (typeof schema.LIKERT_OPCIONES)[number] | null {
  const normalizado = valor.trim().toLowerCase().replace(/\s+/g, "_");
  return (schema.LIKERT_OPCIONES as readonly string[]).includes(normalizado)
    ? (normalizado as (typeof schema.LIKERT_OPCIONES)[number])
    : null;
}

export async function importarFilaPreguntaAutoevaluacion(
  texto: string,
  respuestaCorrectaCsv: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const textoLimpio = texto.trim();
  if (!textoLimpio) return { ok: false, error: "Falta el texto de la pregunta" };

  const respuestaCorrecta = normalizarOpcionLikert(respuestaCorrectaCsv);
  if (!respuestaCorrecta) {
    return { ok: false, error: `respuesta_correcta inválida: "${respuestaCorrectaCsv}" (usa siempre/frecuente/algunas_veces/nunca)` };
  }

  const d = await getDb();
  await d.insert(schema.autoevaluacionPreguntas).values({ texto: textoLimpio, respuestaCorrecta });
  return { ok: true };
}

export async function contarPreguntasActivasAutoevaluacion(): Promise<number> {
  const d = await getDb();
  const [fila] = await d.select({ count: sql<number>`count(*)` })
    .from(schema.autoevaluacionPreguntas)
    .where(eq(schema.autoevaluacionPreguntas.activo, true));
  return fila?.count ?? 0;
}

// Todas las preguntas (activas e inactivas) -- panel admin necesita ver el
// banco completo para revisar si la normalizacion de la subida masiva (CSV)
// quedo bien, no solo las que ya estan activas.
export async function listarPreguntasAutoevaluacion(): Promise<
  Array<{ id: number; texto: string; respuestaCorrecta: (typeof schema.LIKERT_OPCIONES)[number]; activo: boolean }>
> {
  const d = await getDb();
  return d.select({
    id: schema.autoevaluacionPreguntas.id,
    texto: schema.autoevaluacionPreguntas.texto,
    respuestaCorrecta: schema.autoevaluacionPreguntas.respuestaCorrecta,
    activo: schema.autoevaluacionPreguntas.activo,
  })
    .from(schema.autoevaluacionPreguntas)
    .orderBy(schema.autoevaluacionPreguntas.id);
}

// No hay eliminar: autoevaluacion_respuestas.preguntaId tiene FK
// onDelete:"restrict" hacia esta tabla -- una pregunta que ya fue sorteada
// en alguna autoevaluacion nunca se puede borrar. `activo` es el mecanismo
// correcto (mismo patron que toggleActivo en Cursos).
export async function actualizarPreguntaAutoevaluacion(
  id: number,
  texto: string,
  respuestaCorrectaCsv: string,
  activo: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const textoLimpio = texto.trim();
  if (!textoLimpio) return { ok: false, error: "Falta el texto de la pregunta" };

  const respuestaCorrecta = normalizarOpcionLikert(respuestaCorrectaCsv);
  if (!respuestaCorrecta) {
    return { ok: false, error: `respuesta_correcta inválida: "${respuestaCorrectaCsv}" (usa siempre/frecuente/algunas_veces/nunca)` };
  }

  const d = await getDb();
  await d.update(schema.autoevaluacionPreguntas)
    .set({ texto: textoLimpio, respuestaCorrecta, activo })
    .where(eq(schema.autoevaluacionPreguntas.id, id));
  return { ok: true };
}

// FK onDelete:"restrict" en autoevaluacion_respuestas.preguntaId rechaza el
// DELETE si la pregunta ya fue sorteada en alguna autoevaluacion (borrador
// o enviada) -- ER_ROW_IS_REFERENCED_2 se traduce a EN_USO en vez de dejar
// pasar el error crudo de MySQL. `activo=false` es el mecanismo correcto
// para retirarla del sorteo sin romper el historial de quien ya la
// contesto.
export async function eliminarPreguntaAutoevaluacion(
  id: number,
): Promise<{ ok: true } | { ok: false; error: "EN_USO" }> {
  const d = await getDb();
  try {
    await d.delete(schema.autoevaluacionPreguntas).where(eq(schema.autoevaluacionPreguntas.id, id));
    return { ok: true };
  } catch (err) {
    if (codigoMysql(err) === "ER_ROW_IS_REFERENCED_2") return { ok: false, error: "EN_USO" };
    throw err;
  }
}

// Pura, sin DB -- si logra probarse aislada, cubre el caso mas propenso a
// errores de este feature (comparacion de fechas) sin necesidad de mocks.
// Tipo estructural (no atado a InconformidadModuloConfig) -- la reusa tal
// cual el modulo Promocion, que tiene su propia tabla de config con la misma
// forma (ver promocionModuloConfig en drizzle/schema.ts).
export function moduloEstaHabilitadoAhora(
  config: { habilitado: boolean; fechaDesde: string | null; fechaHasta: string | null },
  ahora: Date = new Date(),
): boolean {
  if (config.fechaDesde && config.fechaHasta) {
    // Comparacion de fecha pura (YYYY-MM-DD) contra el dia calendario en
    // America/Mexico_City -- fijo a mano, NUNCA a la timezone del proceso.
    // Si el host termina corriendo en UTC (default comun de contenedores,
    // ej. Railway) usar getFullYear/getMonth/getDate del proceso correria la
    // ventana hasta 6 horas alrededor de medianoche real de Mexico. Mexico
    // abolio el horario de verano en 2022 -- el offset UTC-6 es fijo todo el
    // año, sin ambiguedad de DST.
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(ahora);
    return hoy >= config.fechaDesde && hoy <= config.fechaHasta;
  }
  return config.habilitado;
}

export async function moduloInconformidadHabilitado(): Promise<boolean> {
  const config = await obtenerConfigModuloInconformidad();
  return moduloEstaHabilitadoAhora(config);
}

export async function actualizarModuloInconformidadManual(habilitado: boolean, adminUserId: number): Promise<void> {
  const d = await getDb();
  await d.transaction(async (tx) => {
    // Tocar el switch a mano SIEMPRE cancela cualquier ventana programada y
    // pasa a control manual puro (decision confirmada con el cliente) --
    // sin esto, un admin que "apaga" durante una ventana activa veria que
    // no pasa nada (la ventana seguiria mandando).
    await tx.update(schema.inconformidadModuloConfig)
      .set({ habilitado, fechaDesde: null, fechaHasta: null, actualizadoPor: adminUserId })
      .where(eq(schema.inconformidadModuloConfig.id, 1));

    await tx.insert(schema.auditoria).values({
      servidorId: null,
      usuarioId: adminUserId,
      accion: "actualizar",
      descripcion: `Módulo Inconformidad ${habilitado ? "activado" : "desactivado"} manualmente (cancela ventana programada si había una)`,
    });
  });
}

export async function programarVentanaModuloInconformidad(
  fechaDesde: string,
  fechaHasta: string,
  adminUserId: number,
): Promise<void> {
  const d = await getDb();
  await d.transaction(async (tx) => {
    await tx.update(schema.inconformidadModuloConfig)
      .set({ fechaDesde, fechaHasta, actualizadoPor: adminUserId })
      .where(eq(schema.inconformidadModuloConfig.id, 1));

    await tx.insert(schema.auditoria).values({
      servidorId: null,
      usuarioId: adminUserId,
      accion: "actualizar",
      descripcion: `Módulo Inconformidad: ventana programada del ${fechaDesde} al ${fechaHasta}`,
    });
  });
}

// ─── Config del modulo Promocion (Centro de Modulos) ──────────────────
// Mismo patron que Inconformidad arriba: fila unica id=1, ventana manda
// sobre el flag manual, tocar el switch a mano limpia la ventana.

export async function obtenerConfigModuloPromocion() {
  const d = await getDb();
  const [row] = await d.select({
    id: schema.promocionModuloConfig.id,
    habilitado: schema.promocionModuloConfig.habilitado,
    fechaDesde: schema.promocionModuloConfig.fechaDesde,
    fechaHasta: schema.promocionModuloConfig.fechaHasta,
    actualizadoPor: schema.promocionModuloConfig.actualizadoPor,
    actualizadoPorNombre: schema.users.nombre,
    updatedAt: schema.promocionModuloConfig.updatedAt,
  })
    .from(schema.promocionModuloConfig)
    .leftJoin(schema.users, eq(schema.users.id, schema.promocionModuloConfig.actualizadoPor))
    .where(eq(schema.promocionModuloConfig.id, 1));
  if (row) return row;
  return { id: 1, habilitado: true, fechaDesde: null, fechaHasta: null, actualizadoPor: null, actualizadoPorNombre: null, updatedAt: new Date() };
}

export async function moduloPromocionHabilitado(): Promise<boolean> {
  const config = await obtenerConfigModuloPromocion();
  return moduloEstaHabilitadoAhora(config);
}

export async function actualizarModuloPromocionManual(habilitado: boolean, adminUserId: number): Promise<void> {
  const d = await getDb();
  await d.transaction(async (tx) => {
    await tx.update(schema.promocionModuloConfig)
      .set({ habilitado, fechaDesde: null, fechaHasta: null, actualizadoPor: adminUserId })
      .where(eq(schema.promocionModuloConfig.id, 1));

    await tx.insert(schema.auditoria).values({
      servidorId: null,
      usuarioId: adminUserId,
      accion: "actualizar",
      descripcion: `Módulo Promoción ${habilitado ? "activado" : "desactivado"} manualmente (cancela ventana programada si había una)`,
    });
  });
}

export async function programarVentanaModuloPromocion(
  fechaDesde: string,
  fechaHasta: string,
  adminUserId: number,
): Promise<void> {
  const d = await getDb();
  await d.transaction(async (tx) => {
    await tx.update(schema.promocionModuloConfig)
      .set({ fechaDesde, fechaHasta, actualizadoPor: adminUserId })
      .where(eq(schema.promocionModuloConfig.id, 1));

    await tx.insert(schema.auditoria).values({
      servidorId: null,
      usuarioId: adminUserId,
      accion: "actualizar",
      descripcion: `Módulo Promoción: ventana programada del ${fechaDesde} al ${fechaHasta}`,
    });
  });
}

// ─── Config del modulo Autoevaluacion (Centro de Modulos) ─────────────
// Mismo patron que Promocion arriba: fila unica id=1, ventana manda sobre
// el flag manual, tocar el switch a mano limpia la ventana. Controla si el
// trabajador puede INICIAR su autoevaluacion -- aunque ya tenga Promocion
// confirmada (requisito real cumplido), el admin conserva control total.

export async function obtenerConfigModuloAutoevaluacion() {
  const d = await getDb();
  const [row] = await d.select({
    id: schema.autoevaluacionModuloConfig.id,
    habilitado: schema.autoevaluacionModuloConfig.habilitado,
    fechaDesde: schema.autoevaluacionModuloConfig.fechaDesde,
    fechaHasta: schema.autoevaluacionModuloConfig.fechaHasta,
    actualizadoPor: schema.autoevaluacionModuloConfig.actualizadoPor,
    actualizadoPorNombre: schema.users.nombre,
    updatedAt: schema.autoevaluacionModuloConfig.updatedAt,
  })
    .from(schema.autoevaluacionModuloConfig)
    .leftJoin(schema.users, eq(schema.users.id, schema.autoevaluacionModuloConfig.actualizadoPor))
    .where(eq(schema.autoevaluacionModuloConfig.id, 1));
  if (row) return row;
  return { id: 1, habilitado: true, fechaDesde: null, fechaHasta: null, actualizadoPor: null, actualizadoPorNombre: null, updatedAt: new Date() };
}

export async function moduloAutoevaluacionHabilitado(): Promise<boolean> {
  const config = await obtenerConfigModuloAutoevaluacion();
  return moduloEstaHabilitadoAhora(config);
}

export async function actualizarModuloAutoevaluacionManual(habilitado: boolean, adminUserId: number): Promise<void> {
  const d = await getDb();
  await d.transaction(async (tx) => {
    await tx.update(schema.autoevaluacionModuloConfig)
      .set({ habilitado, fechaDesde: null, fechaHasta: null, actualizadoPor: adminUserId })
      .where(eq(schema.autoevaluacionModuloConfig.id, 1));

    await tx.insert(schema.auditoria).values({
      servidorId: null,
      usuarioId: adminUserId,
      accion: "actualizar",
      descripcion: `Módulo Autoevaluación ${habilitado ? "activado" : "desactivado"} manualmente (cancela ventana programada si había una)`,
    });
  });
}

export async function programarVentanaModuloAutoevaluacion(
  fechaDesde: string,
  fechaHasta: string,
  adminUserId: number,
): Promise<void> {
  const d = await getDb();
  await d.transaction(async (tx) => {
    await tx.update(schema.autoevaluacionModuloConfig)
      .set({ fechaDesde, fechaHasta, actualizadoPor: adminUserId })
      .where(eq(schema.autoevaluacionModuloConfig.id, 1));

    await tx.insert(schema.auditoria).values({
      servidorId: null,
      usuarioId: adminUserId,
      accion: "actualizar",
      descripcion: `Módulo Autoevaluación: ventana programada del ${fechaDesde} al ${fechaHasta}`,
    });
  });
}

// ─── Config del modulo Evaluadores (Centro de Modulos) ────────────────
// Mismo patron -- controla si un evaluador puede INICIAR su evaluacion
// (aunque ya haya sido seleccionado, requisito real cumplido).

export async function obtenerConfigModuloEvaluadores() {
  const d = await getDb();
  const [row] = await d.select({
    id: schema.evaluadorModuloConfig.id,
    habilitado: schema.evaluadorModuloConfig.habilitado,
    fechaDesde: schema.evaluadorModuloConfig.fechaDesde,
    fechaHasta: schema.evaluadorModuloConfig.fechaHasta,
    actualizadoPor: schema.evaluadorModuloConfig.actualizadoPor,
    actualizadoPorNombre: schema.users.nombre,
    updatedAt: schema.evaluadorModuloConfig.updatedAt,
  })
    .from(schema.evaluadorModuloConfig)
    .leftJoin(schema.users, eq(schema.users.id, schema.evaluadorModuloConfig.actualizadoPor))
    .where(eq(schema.evaluadorModuloConfig.id, 1));
  if (row) return row;
  return { id: 1, habilitado: true, fechaDesde: null, fechaHasta: null, actualizadoPor: null, actualizadoPorNombre: null, updatedAt: new Date() };
}

export async function moduloEvaluadoresHabilitado(): Promise<boolean> {
  const config = await obtenerConfigModuloEvaluadores();
  return moduloEstaHabilitadoAhora(config);
}

export async function actualizarModuloEvaluadoresManual(habilitado: boolean, adminUserId: number): Promise<void> {
  const d = await getDb();
  await d.transaction(async (tx) => {
    await tx.update(schema.evaluadorModuloConfig)
      .set({ habilitado, fechaDesde: null, fechaHasta: null, actualizadoPor: adminUserId })
      .where(eq(schema.evaluadorModuloConfig.id, 1));

    await tx.insert(schema.auditoria).values({
      servidorId: null,
      usuarioId: adminUserId,
      accion: "actualizar",
      descripcion: `Módulo Evaluadores ${habilitado ? "activado" : "desactivado"} manualmente (cancela ventana programada si había una)`,
    });
  });
}

export async function programarVentanaModuloEvaluadores(
  fechaDesde: string,
  fechaHasta: string,
  adminUserId: number,
): Promise<void> {
  const d = await getDb();
  await d.transaction(async (tx) => {
    await tx.update(schema.evaluadorModuloConfig)
      .set({ fechaDesde, fechaHasta, actualizadoPor: adminUserId })
      .where(eq(schema.evaluadorModuloConfig.id, 1));

    await tx.insert(schema.auditoria).values({
      servidorId: null,
      usuarioId: adminUserId,
      accion: "actualizar",
      descripcion: `Módulo Evaluadores: ventana programada del ${fechaDesde} al ${fechaHasta}`,
    });
  });
}

// Solo para armar el s3Key legible de la subida de PDF (ver presignarSubida)
// -- ctx.user (payload del JWT) no trae curp, users si.
export async function obtenerCurpUsuario(userId: number): Promise<string | null> {
  const d = await getDb();
  const [fila] = await d.select({ curp: schema.users.curp }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  return fila?.curp ?? null;
}

export async function obtenerInconformidad(userId: number) {
  const d = await getDb();
  const [cabecera] = await d.select().from(schema.inconformidades)
    .where(eq(schema.inconformidades.userId, userId));
  if (!cabecera) return null;

  const factores = await d.select({
    id: schema.inconformidadFactores.id,
    factor: schema.inconformidadFactores.factor,
    mensaje: schema.inconformidadFactores.mensaje,
    archivoId: schema.inconformidadFactores.archivoId,
    nombreOriginal: schema.archivosCargados.nombreOriginal,
  })
    .from(schema.inconformidadFactores)
    .leftJoin(schema.archivosCargados, eq(schema.archivosCargados.id, schema.inconformidadFactores.archivoId))
    .where(eq(schema.inconformidadFactores.inconformidadId, cabecera.id));

  return { ...cabecera, factores };
}

// Codigos de MySQL que significan "otra transaccion concurrente gano la
// carrera o hubo un deadlock detectado por InnoDB" -- en ambos casos la
// transaccion completa ya se aborto server-side (un deadlock la mata entera,
// no solo el statement que fallo), asi que la unica recuperacion correcta es
// reintentar la funcion completa desde cero, no "seguir" dentro de la misma
// transaccion muerta.
const CODIGOS_MYSQL_REINTENTABLES = new Set(["ER_DUP_ENTRY", "ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"]);

// drizzle-orm envuelve el error real de mysql2 en un DrizzleQueryError y lo
// deja en `.cause` (verificado contra node_modules/drizzle-orm/errors) --
// `err.code` esta undefined, el codigo real vive en `err.cause.code`.
function codigoMysql(err: unknown): string | undefined {
  return (err as any)?.code ?? (err as any)?.cause?.code;
}

// Las 4 transacciones de escritura de Inconformidad (guardar/quitar factor,
// confirmar subida, enviar) toman `.for("update")` sobre la fila cabecera del
// usuario -- cualquiera puede toparse con un deadlock o timeout de lock real
// (ej. dos pestañas del mismo usuario operando a la vez), no solo el primer
// guardado. Un deadlock aborta la transaccion COMPLETA server-side, asi que
// la unica recuperacion correcta es reintentar la funcion entera desde cero
// -- verificado con una prueba de concurrencia real contra MySQL, ver ledger.
async function conReintentoDeadlock<T>(intentar: () => Promise<T>): Promise<T> {
  const MAX_INTENTOS = 3;
  for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
    try {
      return await intentar();
    } catch (err: any) {
      const codigo = codigoMysql(err);
      if (codigo && CODIGOS_MYSQL_REINTENTABLES.has(codigo) && intento < MAX_INTENTOS) continue;
      throw err;
    }
  }
  // Inalcanzable (el loop siempre retorna o lanza en su ultima vuelta), solo
  // para que TypeScript vea una funcion que siempre retorna algo.
  throw new Error("conReintentoDeadlock: agoto reintentos sin exito ni error");
}

export async function guardarFactorInconformidad(
  userId: number,
  factor: (typeof schema.FACTORES_INCONFORMIDAD)[number],
  mensaje: string,
): Promise<{ ok: true; id: number } | { ok: false; error: "YA_ENVIADA" | "FACTOR_DESHABILITADO" }> {
  const d = await getDb();
  return conReintentoDeadlock(() => intentarGuardarFactorInconformidad(d, userId, factor, mensaje));
}

async function intentarGuardarFactorInconformidad(
  d: Awaited<ReturnType<typeof getDb>>,
  userId: number,
  factor: (typeof schema.FACTORES_INCONFORMIDAD)[number],
  mensaje: string,
): Promise<{ ok: true; id: number } | { ok: false; error: "YA_ENVIADA" | "FACTOR_DESHABILITADO" }> {
  return d.transaction(async (tx) => {
    const [cabeceraExistente] = await tx.select().from(schema.inconformidades)
      .where(eq(schema.inconformidades.userId, userId))
      .for("update");

    if (cabeceraExistente && cabeceraExistente.estado !== "borrador") {
      return { ok: false, error: "YA_ENVIADA" };
    }

    let factorExistente: typeof schema.inconformidadFactores.$inferSelect | undefined;
    if (cabeceraExistente) {
      [factorExistente] = await tx.select().from(schema.inconformidadFactores)
        .where(and(
          eq(schema.inconformidadFactores.inconformidadId, cabeceraExistente.id),
          eq(schema.inconformidadFactores.factor, factor),
        ));
    }

    if (!factorExistente) {
      const [config] = await tx.select().from(schema.factoresInconformidadConfig)
        .where(eq(schema.factoresInconformidadConfig.factor, factor));
      if (!config?.habilitado) {
        return { ok: false, error: "FACTOR_DESHABILITADO" };
      }
    }

    let cabeceraId: number;
    if (cabeceraExistente) {
      cabeceraId = cabeceraExistente.id;
    } else {
      const [ins] = await tx.insert(schema.inconformidades).values({ userId });
      cabeceraId = ins.insertId;
    }

    let factorId: number;
    if (factorExistente) {
      await tx.update(schema.inconformidadFactores)
        .set({ mensaje })
        .where(eq(schema.inconformidadFactores.id, factorExistente.id));
      factorId = factorExistente.id;
    } else {
      const [ins] = await tx.insert(schema.inconformidadFactores)
        .values({ inconformidadId: cabeceraId, factor, mensaje });
      factorId = ins.insertId;
    }

    const [servidor] = await tx.select({ id: schema.servidoresPublicos.id })
      .from(schema.servidoresPublicos)
      .where(eq(schema.servidoresPublicos.userId, userId));

    await tx.insert(schema.auditoria).values({
      servidorId: servidor?.id ?? null,
      usuarioId: userId,
      accion: factorExistente ? "actualizar" : "crear",
      descripcion: `Inconformidad: ${factorExistente ? "editó el texto del" : "agregó el"} factor "${factor}"`,
    });

    return { ok: true, id: factorId };
  });
}

export async function quitarFactorInconformidad(
  userId: number,
  factorId: number,
): Promise<{ ok: true; s3KeyBorrado: string | null } | { ok: false; error: "YA_ENVIADA" | "NO_ENCONTRADO" }> {
  const d = await getDb();
  return conReintentoDeadlock(() => intentarQuitarFactorInconformidad(d, userId, factorId));
}

async function intentarQuitarFactorInconformidad(
  d: Awaited<ReturnType<typeof getDb>>,
  userId: number,
  factorId: number,
): Promise<{ ok: true; s3KeyBorrado: string | null } | { ok: false; error: "YA_ENVIADA" | "NO_ENCONTRADO" }> {
  return d.transaction(async (tx) => {
    const [cabecera] = await tx.select().from(schema.inconformidades)
      .where(eq(schema.inconformidades.userId, userId))
      .for("update");
    if (!cabecera) return { ok: false, error: "NO_ENCONTRADO" };
    if (cabecera.estado !== "borrador") return { ok: false, error: "YA_ENVIADA" };

    const [factor] = await tx.select().from(schema.inconformidadFactores)
      .where(and(
        eq(schema.inconformidadFactores.id, factorId),
        eq(schema.inconformidadFactores.inconformidadId, cabecera.id),
      ));
    if (!factor) return { ok: false, error: "NO_ENCONTRADO" };

    let s3KeyBorrado: string | null = null;
    if (factor.archivoId) {
      const [archivo] = await tx.select({ s3Key: schema.archivosCargados.s3Key })
        .from(schema.archivosCargados)
        .where(eq(schema.archivosCargados.id, factor.archivoId));
      s3KeyBorrado = archivo?.s3Key ?? null;
      await tx.delete(schema.archivosCargados).where(eq(schema.archivosCargados.id, factor.archivoId));
    }

    await tx.delete(schema.inconformidadFactores).where(eq(schema.inconformidadFactores.id, factorId));

    const [servidor] = await tx.select({ id: schema.servidoresPublicos.id })
      .from(schema.servidoresPublicos)
      .where(eq(schema.servidoresPublicos.userId, userId));

    await tx.insert(schema.auditoria).values({
      servidorId: servidor?.id ?? null,
      usuarioId: userId,
      accion: "eliminar",
      descripcion: `Inconformidad: eliminó el factor "${factor.factor}"${s3KeyBorrado ? " (incluía PDF)" : ""}`,
    });

    return { ok: true, s3KeyBorrado };
  });
}

export async function crearArchivoPendiente(
  cargadoPor: number,
  nombreOriginal: string,
  tipoArchivo: string,
  tamanoBytes: number,
  s3Key: string,
): Promise<{ id: number }> {
  const d = await getDb();
  const [ins] = await d.insert(schema.archivosCargados).values({
    nombreOriginal,
    tipoArchivo,
    tamanoBytes,
    s3Key,
    s3Url: `s3://${process.env.AWS_S3_BUCKET}/${s3Key}`,
    cargadoPor,
  });
  return { id: ins.insertId };
}

export async function obtenerArchivoPorId(archivoId: number) {
  const d = await getDb();
  const [archivo] = await d.select().from(schema.archivosCargados)
    .where(eq(schema.archivosCargados.id, archivoId));
  return archivo ?? null;
}

export async function borrarArchivoPendiente(archivoId: number, userId: number): Promise<void> {
  const d = await getDb();
  await d.delete(schema.archivosCargados)
    .where(and(eq(schema.archivosCargados.id, archivoId), eq(schema.archivosCargados.cargadoPor, userId)));
}

export async function confirmarSubidaInconformidad(
  userId: number,
  factorId: number,
  archivoId: number,
): Promise<{ ok: true; s3KeyViejo: string | null } | { ok: false; error: "YA_ENVIADA" | "FACTOR_NO_ENCONTRADO" | "ARCHIVO_NO_ES_TUYO" }> {
  const d = await getDb();
  return conReintentoDeadlock(() => intentarConfirmarSubidaInconformidad(d, userId, factorId, archivoId));
}

async function intentarConfirmarSubidaInconformidad(
  d: Awaited<ReturnType<typeof getDb>>,
  userId: number,
  factorId: number,
  archivoId: number,
): Promise<{ ok: true; s3KeyViejo: string | null } | { ok: false; error: "YA_ENVIADA" | "FACTOR_NO_ENCONTRADO" | "ARCHIVO_NO_ES_TUYO" }> {
  return d.transaction(async (tx) => {
    const [cabecera] = await tx.select().from(schema.inconformidades)
      .where(eq(schema.inconformidades.userId, userId))
      .for("update");
    if (!cabecera) return { ok: false, error: "FACTOR_NO_ENCONTRADO" };
    if (cabecera.estado !== "borrador") return { ok: false, error: "YA_ENVIADA" };

    const [factor] = await tx.select().from(schema.inconformidadFactores)
      .where(and(
        eq(schema.inconformidadFactores.id, factorId),
        eq(schema.inconformidadFactores.inconformidadId, cabecera.id),
      ));
    if (!factor) return { ok: false, error: "FACTOR_NO_ENCONTRADO" };

    if (factor.archivoId !== archivoId) {
      const [archivoNuevo] = await tx.select({ cargadoPor: schema.archivosCargados.cargadoPor })
        .from(schema.archivosCargados)
        .where(eq(schema.archivosCargados.id, archivoId));
      if (!archivoNuevo || archivoNuevo.cargadoPor !== userId) {
        return { ok: false, error: "ARCHIVO_NO_ES_TUYO" };
      }
    }

    let s3KeyViejo: string | null = null;
    if (factor.archivoId) {
      const [archivoViejo] = await tx.select({ s3Key: schema.archivosCargados.s3Key })
        .from(schema.archivosCargados)
        .where(eq(schema.archivosCargados.id, factor.archivoId));
      s3KeyViejo = archivoViejo?.s3Key ?? null;
      await tx.delete(schema.archivosCargados).where(eq(schema.archivosCargados.id, factor.archivoId));
    }

    await tx.update(schema.inconformidadFactores)
      .set({ archivoId })
      .where(eq(schema.inconformidadFactores.id, factorId));

    const [servidor] = await tx.select({ id: schema.servidoresPublicos.id })
      .from(schema.servidoresPublicos)
      .where(eq(schema.servidoresPublicos.userId, userId));

    await tx.insert(schema.auditoria).values({
      servidorId: servidor?.id ?? null,
      usuarioId: userId,
      accion: "actualizar",
      descripcion: `Inconformidad: ${s3KeyViejo ? "reemplazó" : "subió"} el PDF del factor "${factor.factor}"`,
    });

    return { ok: true, s3KeyViejo };
  });
}

export async function obtenerArchivoParaDescarga(archivoId: number) {
  const d = await getDb();
  const [row] = await d.select({
    s3Key: schema.archivosCargados.s3Key,
    nombreOriginal: schema.archivosCargados.nombreOriginal,
    cargadoPor: schema.archivosCargados.cargadoPor,
    userIdDueno: schema.inconformidades.userId,
    estadoInconformidad: schema.inconformidades.estado,
    servidorIdDueno: schema.servidoresPublicos.id,
  })
    .from(schema.archivosCargados)
    .leftJoin(schema.inconformidadFactores, eq(schema.inconformidadFactores.archivoId, schema.archivosCargados.id))
    .leftJoin(schema.inconformidades, eq(schema.inconformidades.id, schema.inconformidadFactores.inconformidadId))
    .leftJoin(schema.servidoresPublicos, eq(schema.servidoresPublicos.userId, schema.inconformidades.userId))
    .where(eq(schema.archivosCargados.id, archivoId));
  return row ?? null;
}

export async function enviarInconformidad(
  userId: number,
): Promise<{ ok: true } | { ok: false; error: "YA_ENVIADA" | "SIN_FACTORES" | "NO_INICIADA" }> {
  const d = await getDb();
  return conReintentoDeadlock(() => intentarEnviarInconformidad(d, userId));
}

async function intentarEnviarInconformidad(
  d: Awaited<ReturnType<typeof getDb>>,
  userId: number,
): Promise<{ ok: true } | { ok: false; error: "YA_ENVIADA" | "SIN_FACTORES" | "NO_INICIADA" }> {
  return d.transaction(async (tx) => {
    const [cabecera] = await tx.select().from(schema.inconformidades)
      .where(eq(schema.inconformidades.userId, userId))
      .for("update");
    if (!cabecera) return { ok: false, error: "NO_INICIADA" };
    if (cabecera.estado !== "borrador") return { ok: false, error: "YA_ENVIADA" };

    const factores = await tx.select({ id: schema.inconformidadFactores.id })
      .from(schema.inconformidadFactores)
      .where(eq(schema.inconformidadFactores.inconformidadId, cabecera.id));
    if (factores.length === 0) return { ok: false, error: "SIN_FACTORES" };

    await tx.update(schema.inconformidades)
      .set({ estado: "enviado", enviadoAt: new Date() })
      .where(eq(schema.inconformidades.id, cabecera.id));

    const [servidor] = await tx.select({ id: schema.servidoresPublicos.id })
      .from(schema.servidoresPublicos)
      .where(eq(schema.servidoresPublicos.userId, userId));

    await tx.insert(schema.auditoria).values({
      servidorId: servidor?.id ?? null,
      usuarioId: userId,
      accion: "actualizar",
      descripcion: `Inconformidad: envió su inconformidad con ${factores.length} factor(es)`,
    });

    return { ok: true };
  });
}

export async function listarInconformidadesAdmin(filtroFactor?: string) {
  const d = await getDb();
  // Una sola query con joins (antes: 1 + N -- una por cada caso enviado).
  // Mismo filtrado que antes: si filtroFactor viene, solo aparecen casos que
  // tengan ese factor, y de esos casos solo se muestra ese factor (no los
  // demas que tambien tengan guardados) -- se logra filtrando el join en vez
  // de la cabecera.
  const condiciones = filtroFactor
    ? and(eq(schema.inconformidades.estado, "enviado"), eq(schema.inconformidadFactores.factor, filtroFactor as any))
    : eq(schema.inconformidades.estado, "enviado");

  const filas = await d.select({
    id: schema.inconformidades.id,
    enviadoAt: schema.inconformidades.enviadoAt,
    nombreCompleto: schema.servidoresPublicos.nombreCompleto,
    curp: schema.servidoresPublicos.curp,
    factorId: schema.inconformidadFactores.id,
    factor: schema.inconformidadFactores.factor,
    mensaje: schema.inconformidadFactores.mensaje,
    archivoId: schema.inconformidadFactores.archivoId,
    nombreOriginal: schema.archivosCargados.nombreOriginal,
  })
    .from(schema.inconformidades)
    .innerJoin(schema.servidoresPublicos, eq(schema.servidoresPublicos.userId, schema.inconformidades.userId))
    .innerJoin(schema.inconformidadFactores, eq(schema.inconformidadFactores.inconformidadId, schema.inconformidades.id))
    .leftJoin(schema.archivosCargados, eq(schema.archivosCargados.id, schema.inconformidadFactores.archivoId))
    .where(condiciones);

  const porCabecera = new Map<number, {
    id: number; enviadoAt: Date; nombreCompleto: string; curp: string;
    factores: { id: number; factor: string; mensaje: string; archivoId: number | null; nombreOriginal: string | null }[];
  }>();
  for (const fila of filas) {
    let cab = porCabecera.get(fila.id);
    if (!cab) {
      cab = { id: fila.id, enviadoAt: fila.enviadoAt!, nombreCompleto: fila.nombreCompleto, curp: fila.curp, factores: [] };
      porCabecera.set(fila.id, cab);
    }
    cab.factores.push({
      id: fila.factorId, factor: fila.factor, mensaje: fila.mensaje,
      archivoId: fila.archivoId, nombreOriginal: fila.nombreOriginal,
    });
  }
  return [...porCabecera.values()];
}

export async function actualizarConfigFactorInconformidad(
  factor: string,
  habilitado: boolean,
  adminUserId: number,
): Promise<void> {
  const d = await getDb();
  await d.update(schema.factoresInconformidadConfig)
    .set({ habilitado })
    .where(eq(schema.factoresInconformidadConfig.factor, factor as any));

  await d.insert(schema.auditoria).values({
    servidorId: null,
    usuarioId: adminUserId,
    accion: "actualizar",
    descripcion: `Inconformidad: ${habilitado ? "habilitó" : "inhabilitó"} el factor "${factor}" para nuevas selecciones`,
  });
}

// ---- Inscripcion a Promocion ----

// Deliberadamente separada de contarAcreditacion/progresoAcreditacion --
// esas 2 ya las usan el resumen de admin en Solicitudes y el progreso del
// Portal. Regla (retroalimentacion cliente 2026-09-17): pondera PROMEDIO
// de los 2 cursos, no cada uno individual -- ej. 100 y 50 promedia 75 y
// SI es elegible aunque el 50 solo no aprobaria.
//
// calificacion1/calificacion2 se regresan SIEMPRE que haya 2 cursos
// completados, sea o no elegible -- el trabajador necesita ver cuanto sacó
// y por qué no le alcanzó (retroalimentacion cliente 2026-09-17: mostrar
// las calificaciones y la razon de elegible/no elegible en Promocion.tsx).
// Con menos de 2 cursos completados no hay nada que mostrar todavia.
export function calcularElegibilidadPromocion(
  calificaciones: number[],
): { elegible: true; calificacion1: number; calificacion2: number } | { elegible: false; calificacion1?: number; calificacion2?: number } {
  if (calificaciones.length < CURSOS_REQUERIDOS_ACREDITACION) return { elegible: false };
  const [calificacion1, calificacion2] = calificaciones;
  const promedio = (calificacion1 + calificacion2) / 2;
  if (promedio < CALIFICACION_APROBATORIA) return { elegible: false, calificacion1, calificacion2 };
  return { elegible: true, calificacion1, calificacion2 };
}

export async function elegibilidadPromocion(userId: number) {
  const d = await getDb();
  // .orderBy obligatorio -- calcularElegibilidadPromocion usa los primeros 2
  // elementos del arreglo ("tus primeros 2 cursos completados"), y sin orden
  // explicito MySQL no garantiza el orden de un SELECT: alguien con 3+ cursos
  // completados podia ver que calificacion1/calificacion2 (y hasta el
  // resultado elegible/no-elegible) cambiaran entre una carga de pantalla y
  // otra sin que nada cambiara en la DB. createdAt (fecha de inscripcion) es
  // inmutable, a diferencia de updatedAt que un admin puede tocar despues
  // (ej. editar notasAdmin) sin relacion con el orden real de finalizacion.
  const completadas = await d
    .select({ calificacion: schema.solicitudesCurso.calificacion, nombreCurso: schema.cursos.nombre })
    .from(schema.solicitudesCurso)
    .innerJoin(schema.cursos, eq(schema.cursos.id, schema.solicitudesCurso.cursoId))
    .where(and(
      eq(schema.solicitudesCurso.userId, userId),
      eq(schema.solicitudesCurso.estado, "completada"),
    ))
    .orderBy(schema.solicitudesCurso.createdAt);
  const resultado = calcularElegibilidadPromocion(completadas.map((c) => c.calificacion ?? 0));
  // nombreCurso1/2 son solo para mostrarle al trabajador qué curso sacó qué
  // calificación (retroalimentacion cliente 2026-09-17) -- no participan en
  // el calculo de elegibilidad, que sigue viviendo en calcularElegibilidadPromocion.
  return { ...resultado, nombreCurso1: completadas[0]?.nombreCurso, nombreCurso2: completadas[1]?.nombreCurso };
}

type PromocionTx = Parameters<Parameters<Awaited<ReturnType<typeof getDb>>["transaction"]>[0]>[0];

// Compartida entre confirmarInscripcion (trabajador) y reasignarEvaluadorPromocion
// (admin, caso de baja) -- un solo lugar que crea la cuenta si falta, para no
// duplicar la logica de creacion de cuenta en 2 rutas. El password en claro
// se regresa SOLO para pasarlo en memoria a la fila de
// promocionCorreosPendientes -- nunca se persiste en ninguna tabla.
//
// Rediseño 2026-09-26: ya no recibe servidorId ni toca servidores_publicos --
// el pool de evaluadores es identidad directa (curp/nombre), la mayoria de
// Jefes/Companeros nunca fueron importados como servidor. `users.curp` no
// tiene constraint UNIQUE (gap preexistente del sistema, no se resuelve
// aqui) -- .limit(1) deja el comportamiento determinista: el primero que
// encuentre.
export async function asignarEvaluador(
  tx: PromocionTx,
  curp: string,
  nombre: string,
  correoCapturado: string,
): Promise<{ userId: number; passwordTemporalEnClaro: string | null }> {
  const [usuario] = await tx
    .select({
      id: schema.users.id,
      evaluadorCuentaExpiraEn: schema.users.evaluadorCuentaExpiraEn,
    })
    .from(schema.users)
    .where(eq(schema.users.curp, curp))
    .limit(1);

  if (usuario) {
    // null = cuenta real, nunca tuvo restriccion/expiracion -- nunca se le
    // toca esta columna. No-null = cuenta on-the-fly (vencida o no): refresca
    // la ventana de 3 dias habiles Y reactiva, en el mismo update que el
    // email, para que una reseleccion posterior nunca deje la cuenta varada.
    const esOnTheFly = usuario.evaluadorCuentaExpiraEn !== null;
    await tx.update(schema.users).set({
      email: correoCapturado,
      ...(esOnTheFly ? { evaluadorCuentaExpiraEn: calcularExpiracion3DiasHabiles(new Date()), isActive: true } : {}),
    }).where(eq(schema.users.id, usuario.id));
    return { userId: usuario.id, passwordTemporalEnClaro: null };
  }

  const passwordTemporalEnClaro = generarPasswordTemporal();
  const passwordHash = await hashPassword(passwordTemporalEnClaro);
  // Cuenta nueva -- restringida a solo la pantalla de evaluación hasta 3
  // días hábiles desde ahora. Nombre/CURP vienen del pool (CSV), no de
  // servidores_publicos -- esta persona puede no existir ahí en absoluto.
  const [insertResult] = await tx.insert(schema.users).values({
    nombre,
    curp,
    email: correoCapturado,
    passwordHash,
    role: "user",
    evaluadorCuentaExpiraEn: calcularExpiracion3DiasHabiles(new Date()),
  });

  return { userId: insertResult.insertId, passwordTemporalEnClaro };
}

export async function yaInscritoPromocion(userId: number): Promise<boolean> {
  const d = await getDb();
  const [row] = await d.select({ id: schema.promociones.id })
    .from(schema.promociones)
    .where(eq(schema.promociones.userId, userId));
  return !!row;
}

// I1 (revision final): antes solo chequeaba promocionEvaluadorPool.rol+activo --
// una persona dada de baja (servidoresPublicos.estatus != "activo") o con
// cuenta desactivada (users.isActive = false) seguia siendo aceptada si se
// referenciaba directo -- regresion del fix c55d401 del diseño anterior.
// leftJoin a users porque un servidor sin cuenta todavia (userId null) no
// tiene isActive que chequear -- eso es valido, no se rechaza por esa razon.
//
// Hallazgo real 2026-09-23 (verificacion en vivo tras el modulo Evaluadores):
// el chequeo original `isActive=true` bloqueaba TAMBIEN a una cuenta on-the-fly
// de evaluador que expiro por el worker de 3 dias habiles (Evaluadores) --
// nunca se podia volver a seleccionar a ese evaluador ni desde
// confirmarInscripcion ni desde reasignarEvaluadorPromocion, asi que la
// reactivacion que hace asignarEvaluador (ver ese archivo) nunca se alcanzaba
// -- codigo muerto. Distinguir: `evaluadorCuentaExpiraEn IS NOT NULL` marca
// que la cuenta es on-the-fly y su isActive=false es recuperable (se
// reactiva sola al reseleccionarla) -- esas SI deben poder seleccionarse de
// nuevo. Una cuenta real desactivada por otra razon (evaluadorCuentaExpiraEn
// null, isActive=false) sigue bloqueada, que es la intencion original de I1.
// Rediseño 2026-09-26: ya no hace JOIN a servidores_publicos (esa tabla ni
// participa en el pool ahora) -- el LEFT JOIN a users es por CURP directo,
// para seguir excluyendo cuentas inactivas SALVO las on-the-fly vencidas
// (recuperables, mismo criterio que antes -- ver hallazgo real 2026-09-23).
// I2 (revision final): antes solo probaba que el CURP estuviera en el pool
// (boolean) -- el `nombre` de la cuenta nueva venia sin validar del cliente
// (seleccion.X.nombre / nuevoNombre), asi que un trabajador o un admin podia
// escribir cualquier nombre en la cuenta on-the-fly de otra persona. Ahora
// regresamos el `nombre` curado del pool para que confirmarInscripcion y
// reasignarEvaluadorPromocion dejen de confiar en el nombre que manda el
// cliente.
async function curpEnPool(tx: PromocionTx, curp: string, rol: "jefe" | "companero"): Promise<{ nombre: string } | null> {
  const [fila] = await tx
    .select({ nombre: schema.promocionEvaluadorPool.nombre })
    .from(schema.promocionEvaluadorPool)
    .leftJoin(schema.users, eq(schema.users.curp, schema.promocionEvaluadorPool.curp))
    .where(and(
      eq(schema.promocionEvaluadorPool.curp, curp),
      eq(schema.promocionEvaluadorPool.rol, rol),
      eq(schema.promocionEvaluadorPool.activo, true),
      or(
        isNull(schema.users.id),
        eq(schema.users.isActive, true),
        isNotNull(schema.users.evaluadorCuentaExpiraEn),
      ),
    ));
  return fila ?? null;
}

export async function confirmarInscripcion(
  userId: number,
  seleccion: {
    jefe: { curp: string; nombre: string; correo: string };
    companero1: { curp: string; nombre: string; correo: string };
    companero2: { curp: string; nombre: string; correo: string };
  },
): Promise<{ ok: true } | { ok: false; error: "NO_ELEGIBLE" | "YA_INSCRITO" | "SELECCION_INVALIDA" | "CORREO_INVALIDO" }> {
  const curps = [seleccion.jefe.curp, seleccion.companero1.curp, seleccion.companero2.curp];
  if (new Set(curps).size !== 3) return { ok: false, error: "SELECCION_INVALIDA" };

  // I3: formato+MX de los 3 correos capturados, ANTES de abrir la
  // transaccion -- resolveMx es I/O de red, no queremos tener un lock/tx de
  // MySQL abierto mientras esperamos DNS.
  const [correoJefeValido, correoC1Valido, correoC2Valido] = await Promise.all([
    validarCorreoEvaluador(seleccion.jefe.correo),
    validarCorreoEvaluador(seleccion.companero1.correo),
    validarCorreoEvaluador(seleccion.companero2.correo),
  ]);
  if (!correoJefeValido.ok || !correoC1Valido.ok || !correoC2Valido.ok) {
    return { ok: false, error: "CORREO_INVALIDO" };
  }

  const d = await getDb();
  try {
    return await d.transaction(async (tx) => {
      // Mismo .orderBy que elegibilidadPromocion (ver ese comentario) -- debe
      // seleccionar EXACTAMENTE los mismos 2 cursos que el trabajador vio en
      // pantalla antes de inscribirse, o "elegible" en la lectura podia
      // convertirse en NO_ELEGIBLE aqui por puro azar de orden de MySQL.
      const completadas = await tx
        .select({ calificacion: schema.solicitudesCurso.calificacion })
        .from(schema.solicitudesCurso)
        .where(and(
          eq(schema.solicitudesCurso.userId, userId),
          eq(schema.solicitudesCurso.estado, "completada"),
        ))
        .orderBy(schema.solicitudesCurso.createdAt);
      const elegibilidad = calcularElegibilidadPromocion(completadas.map((c) => c.calificacion ?? 0));
      if (!elegibilidad.elegible) return { ok: false as const, error: "NO_ELEGIBLE" as const };

      const [jefePool, c1Pool, c2Pool] = await Promise.all([
        curpEnPool(tx, seleccion.jefe.curp, "jefe"),
        curpEnPool(tx, seleccion.companero1.curp, "companero"),
        curpEnPool(tx, seleccion.companero2.curp, "companero"),
      ]);
      if (!jefePool || !c1Pool || !c2Pool) return { ok: false as const, error: "SELECCION_INVALIDA" as const };

      // C1: chequeo de auto-seleccion por CURP propio del llamante, ANTES de
      // llamar asignarEvaluador -- evita huerfanar una cuenta si el
      // trabajador se auto-selecciona. servidorPropio.curp viene del mismo
      // select que ya se hacia (servidoresPublicos por userId), solo se le
      // agrega la columna curp -- no es un query nuevo.
      const [servidorPropio] = await tx
        .select({ id: schema.servidoresPublicos.id, curp: schema.servidoresPublicos.curp })
        .from(schema.servidoresPublicos)
        .where(eq(schema.servidoresPublicos.userId, userId));
      if (servidorPropio && curps.includes(servidorPropio.curp)) {
        return { ok: false as const, error: "SELECCION_INVALIDA" as const };
      }

      const jefe = await asignarEvaluador(tx, seleccion.jefe.curp, jefePool.nombre, seleccion.jefe.correo);
      const companero1 = await asignarEvaluador(tx, seleccion.companero1.curp, c1Pool.nombre, seleccion.companero1.correo);
      const companero2 = await asignarEvaluador(tx, seleccion.companero2.curp, c2Pool.nombre, seleccion.companero2.correo);

      const [promoInsert] = await tx.insert(schema.promociones).values({
        userId,
        jefeAsignadoId: jefe.userId,
        companero1Id: companero1.userId,
        companero2Id: companero2.userId,
        calificacionCurso1: elegibilidad.calificacion1,
        calificacionCurso2: elegibilidad.calificacion2,
      });
      const promocionId = promoInsert.insertId;

      // passwordTemporalEnClaro solo viene poblado si asignarEvaluador creo
      // cuenta nueva -- si ya tenia cuenta, viene null y el worker (Task 9)
      // manda la plantilla sin credenciales.
      await tx.insert(schema.promocionCorreosPendientes).values([
        { promocionId, destinatarioUserId: jefe.userId, rol: "jefe", passwordTemporalEnClaro: jefe.passwordTemporalEnClaro },
        { promocionId, destinatarioUserId: companero1.userId, rol: "companero1", passwordTemporalEnClaro: companero1.passwordTemporalEnClaro },
        { promocionId, destinatarioUserId: companero2.userId, rol: "companero2", passwordTemporalEnClaro: companero2.passwordTemporalEnClaro },
      ]);

      // Crea el slot de evaluación de cada rol en `borrador`, SIN sortear
      // preguntas todavía -- el sorteo pasa al "iniciar" (Task 5), para no
      // gastar preguntas del banco en evaluaciones que tal vez nunca se
      // empiecen. unique(promocionId, rol) en el schema garantiza que esto
      // nunca duplique un slot para la misma promoción.
      await tx.insert(schema.evaluaciones).values([
        { promocionId, rol: "jefe", evaluadorUserId: jefe.userId },
        { promocionId, rol: "companero1", evaluadorUserId: companero1.userId },
        { promocionId, rol: "companero2", evaluadorUserId: companero2.userId },
      ]);

      await tx.insert(schema.auditoria).values({
        servidorId: servidorPropio?.id ?? null,
        usuarioId: userId,
        accion: "crear",
        descripcion: "Se inscribió a Promoción (selección manual de evaluadores)",
        cambiosPosterior: JSON.stringify({
          jefeAsignadoId: jefe.userId,
          companero1Id: companero1.userId,
          companero2Id: companero2.userId,
        }),
      });

      return { ok: true as const };
    });
  } catch (err: any) {
    if (codigoMysql(err) === "ER_DUP_ENTRY") return { ok: false, error: "YA_INSCRITO" };
    throw err;
  }
}

type EvaluacionPendiente = {
  evaluacionId: number;
  rol: (typeof schema.EVALUACION_ROLES)[number];
  nombreEvaluado: string;
  fechaLimite: Date | null;
};

// Lista solo lo que este evaluador todavia debe contestar -- estado=enviado
// se excluye, ya no es "pendiente". fechaLimite viene de la cuenta DEL
// EVALUADOR (users.evaluadorCuentaExpiraEn de quien pregunta) -- null si
// su cuenta no es on-the-fly, o si ya tenia cuenta antes de ser asignado.
export async function listarMisEvaluacionesPendientes(userId: number): Promise<EvaluacionPendiente[]> {
  const d = await getDb();
  return d.select({
    evaluacionId: schema.evaluaciones.id,
    rol: schema.evaluaciones.rol,
    nombreEvaluado: schema.servidoresPublicos.nombreCompleto,
    fechaLimite: schema.users.evaluadorCuentaExpiraEn,
  })
    .from(schema.evaluaciones)
    .innerJoin(schema.promociones, eq(schema.promociones.id, schema.evaluaciones.promocionId))
    .innerJoin(schema.servidoresPublicos, eq(schema.servidoresPublicos.userId, schema.promociones.userId))
    .innerJoin(schema.users, eq(schema.users.id, schema.evaluaciones.evaluadorUserId))
    .where(and(
      eq(schema.evaluaciones.evaluadorUserId, userId),
      eq(schema.evaluaciones.estado, "borrador"),
    ));
}

// Alimenta el gate de App.tsx -- llamado desde authRouter.me en CADA carga
// de auth.me (staleTime de 5 min en el cliente, ver useAuthState), no
// desde el JWT (que vive hasta 7 dias y no reflejaria una expiracion
// reciente). Costo: 1 query indexada por userId, aceptable a esta escala
// (100-999 servidores).
export async function estadoRestriccionEvaluador(userId: number): Promise<{ restringido: boolean }> {
  const d = await getDb();
  const [usuario] = await d.select({ evaluadorCuentaExpiraEn: schema.users.evaluadorCuentaExpiraEn })
    .from(schema.users)
    .where(eq(schema.users.id, userId));

  const restringido = !!usuario?.evaluadorCuentaExpiraEn && usuario.evaluadorCuentaExpiraEn.getTime() > Date.now();
  return { restringido };
}

type EstadoEvaluacion =
  | { estado: "no_encontrada" }
  | { estado: "ajena" }
  | { estado: "borrador"; nombreEvaluado: string; preguntas: { preguntaId: number; texto: string; respuestaElegida: (typeof schema.LIKERT_OPCIONES)[number] | null }[] }
  | { estado: "enviado" };

// Lectura de UNA evaluación específica (para el wizard). "enviado" no
// regresa preguntas ni puntaje -- el evaluador nunca ve ninguno de los dos
// (regla confirmada por el cliente 2026-09-22, aplica también al
// evaluador sobre su propia evaluación, no solo al evaluado).
export async function miEvaluacion(userId: number, evaluacionId: number): Promise<EstadoEvaluacion> {
  const d = await getDb();
  const [fila] = await d.select({
    id: schema.evaluaciones.id,
    evaluadorUserId: schema.evaluaciones.evaluadorUserId,
    estado: schema.evaluaciones.estado,
    nombreEvaluado: schema.servidoresPublicos.nombreCompleto,
  })
    .from(schema.evaluaciones)
    .innerJoin(schema.promociones, eq(schema.promociones.id, schema.evaluaciones.promocionId))
    .innerJoin(schema.servidoresPublicos, eq(schema.servidoresPublicos.userId, schema.promociones.userId))
    .where(eq(schema.evaluaciones.id, evaluacionId));

  if (!fila) return { estado: "no_encontrada" };
  if (fila.evaluadorUserId !== userId) return { estado: "ajena" };
  if (fila.estado === "enviado") return { estado: "enviado" };

  const preguntas = await d.select({
    preguntaId: schema.evaluacionRespuestas.preguntaId,
    texto: schema.evaluadorPreguntas.texto,
    respuestaElegida: schema.evaluacionRespuestas.respuestaElegida,
  })
    .from(schema.evaluacionRespuestas)
    .innerJoin(schema.evaluadorPreguntas, eq(schema.evaluadorPreguntas.id, schema.evaluacionRespuestas.preguntaId))
    .where(eq(schema.evaluacionRespuestas.evaluacionId, fila.id))
    // Fix 7 (revision final): sin esto el orden dependia de PK/insertion
    // order de MySQL, no un contrato real -- el wizard indexa por posicion
    // (indiceActual) y el arreglo se re-obtiene tras "iniciar" invalidar la
    // query, asi que el orden debe estar garantizado, no ser incidental.
    .orderBy(schema.evaluacionRespuestas.id);

  return { estado: "borrador", nombreEvaluado: fila.nombreEvaluado, preguntas };
}

export async function iniciarEvaluacion(
  userId: number,
  evaluacionId: number,
): Promise<{ ok: true } | { ok: false; error: "NO_ENCONTRADA" | "AJENA" | "YA_INICIADA" | "BANCO_INSUFICIENTE" }> {
  const d = await getDb();
  try {
    return await d.transaction(async (tx) => {
      const [fila] = await tx.select({
        id: schema.evaluaciones.id,
        evaluadorUserId: schema.evaluaciones.evaluadorUserId,
        rol: schema.evaluaciones.rol,
      })
        .from(schema.evaluaciones)
        .where(eq(schema.evaluaciones.id, evaluacionId));
      if (!fila) return { ok: false as const, error: "NO_ENCONTRADA" as const };
      if (fila.evaluadorUserId !== userId) return { ok: false as const, error: "AJENA" as const };

      // rol de evaluaciones es jefe/companero1/companero2 -- el banco de
      // preguntas usa jefe/companero (companero1 y companero2 comparten el
      // MISMO banco de Compañero, son personas distintas evaluando, no
      // bancos distintos).
      const rolBanco = fila.rol === "jefe" ? "jefe" : "companero";
      const banco = await tx.select({ id: schema.evaluadorPreguntas.id })
        .from(schema.evaluadorPreguntas)
        .where(and(eq(schema.evaluadorPreguntas.rol, rolBanco), eq(schema.evaluadorPreguntas.activo, true)));

      if (banco.length < PREGUNTAS_EVALUADOR) {
        return { ok: false as const, error: "BANCO_INSUFICIENTE" as const };
      }

      const sorteadas = sortearPreguntasAutoevaluacion(banco.map((p) => p.id), PREGUNTAS_EVALUADOR);

      await tx.insert(schema.evaluacionRespuestas).values(
        sorteadas.map((preguntaId) => ({ evaluacionId: fila.id, preguntaId })),
      );

      return { ok: true as const };
    });
  } catch (err: any) {
    if (codigoMysql(err) === "ER_DUP_ENTRY") return { ok: false, error: "YA_INICIADA" };
    throw err;
  }
}

export async function enviarEvaluacion(
  userId: number,
  evaluacionId: number,
  respuestas: { preguntaId: number; respuestaElegida: (typeof schema.LIKERT_OPCIONES)[number] }[],
): Promise<{ ok: true } | { ok: false; error: "NO_ENCONTRADA" | "AJENA" | "NO_INICIADA" | "YA_ENVIADA" | "RESPUESTAS_INVALIDAS" }> {
  const d = await getDb();
  return d.transaction(async (tx) => {
    const [fila] = await tx.select({
      id: schema.evaluaciones.id,
      evaluadorUserId: schema.evaluaciones.evaluadorUserId,
      rol: schema.evaluaciones.rol,
      estado: schema.evaluaciones.estado,
    })
      .from(schema.evaluaciones)
      .where(eq(schema.evaluaciones.id, evaluacionId));
    if (!fila) return { ok: false, error: "NO_ENCONTRADA" };
    if (fila.evaluadorUserId !== userId) return { ok: false, error: "AJENA" };
    if (fila.estado !== "borrador") return { ok: false, error: "YA_ENVIADA" };

    const asignadas = await tx.select({
      preguntaId: schema.evaluacionRespuestas.preguntaId,
      respuestaCorrecta: schema.evaluadorPreguntas.respuestaCorrecta,
    })
      .from(schema.evaluacionRespuestas)
      .innerJoin(schema.evaluadorPreguntas, eq(schema.evaluadorPreguntas.id, schema.evaluacionRespuestas.preguntaId))
      .where(eq(schema.evaluacionRespuestas.evaluacionId, fila.id));

    // Chequeo de LARGO antes del chequeo por Set -- un Set deduplica, asi
    // que un arreglo con preguntaId repetidos (padding attack) podia pasar
    // la comparacion de sets aunque length no coincidiera con lo asignado
    // (mismo hallazgo real que se cerro en enviarAutoevaluacion).
    if (respuestas.length !== asignadas.length) return { ok: false, error: "RESPUESTAS_INVALIDAS" };

    const idsAsignados = new Set(asignadas.map((a) => a.preguntaId));
    const idsRecibidos = new Set(respuestas.map((r) => r.preguntaId));
    const mismoSet = idsAsignados.size === idsRecibidos.size && [...idsAsignados].every((id) => idsRecibidos.has(id));
    if (!mismoSet) return { ok: false, error: "RESPUESTAS_INVALIDAS" };

    const mapaCorrectas = new Map(asignadas.map((a) => [a.preguntaId, a.respuestaCorrecta]));
    let aciertos = 0;
    for (const r of respuestas) {
      const correcta = mapaCorrectas.get(r.preguntaId);
      if (correcta === r.respuestaElegida) aciertos++;
      await tx.update(schema.evaluacionRespuestas)
        .set({ respuestaElegida: r.respuestaElegida })
        .where(and(
          eq(schema.evaluacionRespuestas.evaluacionId, fila.id),
          eq(schema.evaluacionRespuestas.preguntaId, r.preguntaId),
        ));
    }

    // Jefe usa 1pt/acierto (max 14), companero1 y companero2 usan
    // 6/14 pt/acierto (max 6) -- misma formula para ambos compañeros, solo
    // cambia QUIEN evalua, no el peso de su evaluacion.
    const puntajeFinal = fila.rol === "jefe"
      ? calcularPuntajeEvaluadorJefe(aciertos)
      : calcularPuntajeEvaluadorCompaniero(aciertos);

    await tx.update(schema.evaluaciones)
      .set({ estado: "enviado", puntajeFinal, enviadoAt: new Date() })
      .where(eq(schema.evaluaciones.id, fila.id));

    await tx.insert(schema.auditoria).values({
      servidorId: null,
      usuarioId: userId,
      accion: "actualizar",
      descripcion: `Envió una evaluación de Evaluadores (rol ${fila.rol}, ${aciertos}/${respuestas.length} aciertos)`,
    });

    // No regresa puntajeFinal -- ni al router, ni por lo tanto al cliente.
    // El evaluador nunca ve su propio puntaje (regla confirmada 2026-09-22).
    return { ok: true };
  });
}

export async function importarFilaPreguntaEvaluador(
  rol: (typeof schema.EVALUADOR_ROLES_BANCO)[number],
  texto: string,
  respuestaCorrectaCsv: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const textoLimpio = texto.trim();
  if (!textoLimpio) return { ok: false, error: "Falta el texto de la pregunta" };

  const respuestaCorrecta = normalizarOpcionLikert(respuestaCorrectaCsv);
  if (!respuestaCorrecta) {
    return { ok: false, error: `respuesta_correcta inválida: "${respuestaCorrectaCsv}" (usa siempre/frecuente/algunas_veces/nunca)` };
  }

  const d = await getDb();
  await d.insert(schema.evaluadorPreguntas).values({ rol, texto: textoLimpio, respuestaCorrecta });
  return { ok: true };
}

export async function contarPreguntasActivasEvaluador(rol: (typeof schema.EVALUADOR_ROLES_BANCO)[number]): Promise<number> {
  const d = await getDb();
  const [fila] = await d.select({ count: sql<number>`count(*)` })
    .from(schema.evaluadorPreguntas)
    .where(and(eq(schema.evaluadorPreguntas.rol, rol), eq(schema.evaluadorPreguntas.activo, true)));
  return fila?.count ?? 0;
}

// Todas las preguntas del rol pedido (activas e inactivas) -- panel admin
// necesita ver el banco completo para revisar si la normalizacion de la
// subida masiva (CSV) quedo bien, no solo las que ya estan activas. Mismo
// patron que listarPreguntasAutoevaluacion.
export async function listarPreguntasEvaluador(
  rol: (typeof schema.EVALUADOR_ROLES_BANCO)[number],
): Promise<Array<{ id: number; texto: string; respuestaCorrecta: (typeof schema.LIKERT_OPCIONES)[number]; activo: boolean }>> {
  const d = await getDb();
  return d.select({
    id: schema.evaluadorPreguntas.id,
    texto: schema.evaluadorPreguntas.texto,
    respuestaCorrecta: schema.evaluadorPreguntas.respuestaCorrecta,
    activo: schema.evaluadorPreguntas.activo,
  })
    .from(schema.evaluadorPreguntas)
    .where(eq(schema.evaluadorPreguntas.rol, rol))
    .orderBy(schema.evaluadorPreguntas.id);
}

// No hay eliminar directo salvo si nadie la ha usado: evaluacion_respuestas
// tiene FK onDelete:"restrict" hacia esta tabla -- mismo criterio que
// actualizarPreguntaAutoevaluacion/eliminarPreguntaAutoevaluacion.
export async function actualizarPreguntaEvaluador(
  id: number,
  texto: string,
  respuestaCorrectaCsv: string,
  activo: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const textoLimpio = texto.trim();
  if (!textoLimpio) return { ok: false, error: "Falta el texto de la pregunta" };

  const respuestaCorrecta = normalizarOpcionLikert(respuestaCorrectaCsv);
  if (!respuestaCorrecta) {
    return { ok: false, error: `respuesta_correcta inválida: "${respuestaCorrectaCsv}" (usa siempre/frecuente/algunas_veces/nunca)` };
  }

  const d = await getDb();
  await d.update(schema.evaluadorPreguntas)
    .set({ texto: textoLimpio, respuestaCorrecta, activo })
    .where(eq(schema.evaluadorPreguntas.id, id));
  return { ok: true };
}

export async function eliminarPreguntaEvaluador(
  id: number,
): Promise<{ ok: true } | { ok: false; error: "EN_USO" }> {
  const d = await getDb();
  try {
    await d.delete(schema.evaluadorPreguntas).where(eq(schema.evaluadorPreguntas.id, id));
    return { ok: true };
  } catch (err) {
    if (codigoMysql(err) === "ER_ROW_IS_REFERENCED_2") return { ok: false, error: "EN_USO" };
    throw err;
  }
}

// Rediseño 2026-09-26: ya no valida contra servidores_publicos -- la mayoria
// de Jefes/Companeros del roster real nunca fueron importados como servidor
// (son gente externa a SIDCU). El pool es ahora identidad directa: upsert
// por (curp, rol) con lo que traiga el CSV, sin padrón contra el cual
// comparar nombre.
export async function importarFilaEvaluador(
  curp: string,
  nombreCsv: string,
  rol: "jefe" | "companero",
  correoCsv: string | undefined,
  adminUserId: number,
  rfcCsv?: string,
): Promise<{ ok: true; advertencia?: string } | { ok: false; error: string }> {
  const curpNormalizada = curp.trim().toUpperCase();
  const nombreNormalizado = nombreCsv.trim();
  if (!curpNormalizada || !nombreNormalizado) {
    return { ok: false, error: "Faltan columnas curp/nombre" };
  }

  // I3 (revision final): el CSV es dato del mundo real, no confiable --
  // sin esto una fila con CURP mal formado o un nombre/RFC absurdamente
  // largo tronaba contra una constraint de MySQL y (antes del fix del
  // router de abajo) podia abortar el batch completo en vez de solo esa
  // fila.
  if (!/^[A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]\d$/.test(curpNormalizada)) {
    return { ok: false, error: `CURP "${curpNormalizada}" no tiene formato válido` };
  }
  if (nombreNormalizado.length > 255) {
    return { ok: false, error: "Nombre excede 255 caracteres" };
  }

  let advertencia: string | undefined;
  let correoSugerido: string | null = null;
  if (correoCsv) {
    const correoValido = await validarCorreoEvaluador(correoCsv);
    if (!correoValido.ok) {
      advertencia = `${nombreNormalizado}: correo inválido`;
    } else {
      correoSugerido = correoCsv.trim().toLowerCase();
    }
  }
  const rfcNormalizado = rfcCsv?.trim() ? rfcCsv.trim().toUpperCase() : null;
  if (rfcNormalizado && rfcNormalizado.length > 13) {
    return { ok: false, error: `RFC "${rfcNormalizado}" excede 13 caracteres` };
  }

  const d = await getDb();
  await d.insert(schema.promocionEvaluadorPool)
    .values({
      curp: curpNormalizada,
      nombre: nombreNormalizado,
      rfc: rfcNormalizado,
      rol,
      activo: true,
      correoSugerido,
      actualizadoPor: adminUserId,
    })
    .onDuplicateKeyUpdate({
      set: { nombre: nombreNormalizado, rfc: rfcNormalizado, activo: true, correoSugerido, actualizadoPor: adminUserId },
    });

  return advertencia ? { ok: true, advertencia } : { ok: true };
}

// Vista de administrador para revisar (y corregir) lo que ya se subio a los
// 2 pools por CSV -- sin esto no habia forma de ver el contenido del pool
// salvo re-subir el CSV o buscar indirectamente dentro del flujo de
// reasignar un evaluador de una inscripcion ya confirmada.
export async function listarPoolPromocion(
  rol: "jefe" | "companero",
  filtros?: { search?: string; page?: number; limit?: number },
): Promise<{
  items: Array<{ curp: string; nombre: string }>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const d = await getDb();
  const limit = filtros?.limit ?? 20;
  const page = filtros?.page ?? 1;
  const offset = (page - 1) * limit;
  const term = filtros?.search ? `%${escaparComodinesLike(filtros.search)}%` : null;
  const where = and(
    eq(schema.promocionEvaluadorPool.rol, rol),
    term ? or(like(schema.promocionEvaluadorPool.nombre, term), like(schema.promocionEvaluadorPool.curp, term)) : undefined,
  );

  const [items, countResult] = await Promise.all([
    d
      .select({
        curp: schema.promocionEvaluadorPool.curp,
        nombre: schema.promocionEvaluadorPool.nombre,
      })
      .from(schema.promocionEvaluadorPool)
      .where(where)
      .limit(limit)
      .offset(offset),
    d
      .select({ count: sql<number>`count(*)` })
      .from(schema.promocionEvaluadorPool)
      .where(where),
  ]);

  const total = countResult[0]?.count ?? 0;
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// Corrige el caso "subimos a alguien en el pool equivocado" sin tener que
// quitarlo y volver a subir un CSV. Si el CURP ya esta en rolNuevo, no
// se duplica -- se rechaza con un error claro (la PK compuesta
// (curp, rol) tambien lo evitaria a nivel DB, pero aqui se detecta
// antes para dar un mensaje entendible en vez de un error de duplicado).
export async function moverRolPoolPromocion(
  curp: string,
  rolActual: "jefe" | "companero",
  rolNuevo: "jefe" | "companero",
  adminUserId: number,
): Promise<{ ok: true } | { ok: false; error: "NO_ENCONTRADO" | "YA_EN_ROL_DESTINO" }> {
  const d = await getDb();
  return d.transaction(async (tx) => {
    const [actual] = await tx
      .select()
      .from(schema.promocionEvaluadorPool)
      .where(and(eq(schema.promocionEvaluadorPool.curp, curp), eq(schema.promocionEvaluadorPool.rol, rolActual)));
    if (!actual) return { ok: false as const, error: "NO_ENCONTRADO" as const };

    const [destino] = await tx
      .select()
      .from(schema.promocionEvaluadorPool)
      .where(and(eq(schema.promocionEvaluadorPool.curp, curp), eq(schema.promocionEvaluadorPool.rol, rolNuevo)));
    if (destino) return { ok: false as const, error: "YA_EN_ROL_DESTINO" as const };

    await tx
      .delete(schema.promocionEvaluadorPool)
      .where(and(eq(schema.promocionEvaluadorPool.curp, curp), eq(schema.promocionEvaluadorPool.rol, rolActual)));
    await tx.insert(schema.promocionEvaluadorPool).values({
      curp,
      nombre: actual.nombre,
      rfc: actual.rfc,
      rol: rolNuevo,
      activo: true,
      correoSugerido: actual.correoSugerido,
      actualizadoPor: adminUserId,
    });

    return { ok: true as const };
  });
}

// Hard delete a proposito (no un toggle de `activo`): quitar del pool a
// alguien que nunca debio subirse no debe dejar rastro confuso -- no afecta
// ninguna inscripcion ya confirmada (promociones.jefeAsignadoId/companeroXId
// referencian directo a users.id, independientes de este pool).
export async function quitarDelPoolPromocion(
  curp: string,
  rol: "jefe" | "companero",
): Promise<{ ok: true } | { ok: false; error: "NO_ENCONTRADO" }> {
  const d = await getDb();
  const [fila] = await d
    .select()
    .from(schema.promocionEvaluadorPool)
    .where(and(eq(schema.promocionEvaluadorPool.curp, curp), eq(schema.promocionEvaluadorPool.rol, rol)));
  if (!fila) return { ok: false, error: "NO_ENCONTRADO" };

  await d
    .delete(schema.promocionEvaluadorPool)
    .where(and(eq(schema.promocionEvaluadorPool.curp, curp), eq(schema.promocionEvaluadorPool.rol, rol)));
  return { ok: true };
}

export async function listarInscripcionesPromocion(filtros?: { search?: string; page?: number; limit?: number }) {
  const d = await getDb();
  const trabajador = alias(schema.servidoresPublicos, "trabajador");
  // jefeAsignadoId/companeroXId en `promociones` son users.id (FK a `users`,
  // onDelete: "restrict" -- una fila coincidente esta GARANTIZADA a existir).
  // Este branch (identidad directa por CURP) dejo de requerir/crear una fila
  // en servidores_publicos para evaluadores que solo vienen del CSV del
  // pool, asi que resolvemos el nombre contra `users` directo, no contra
  // servidores_publicos.
  const jefe = alias(schema.users, "jefe");
  const companero1 = alias(schema.users, "companero1");
  const companero2 = alias(schema.users, "companero2");
  // Fix 2 (revision final): GestionPromocion.tsx necesita saber si el slot
  // ya tiene una evaluacion 'enviado' para deshabilitar el boton "Reasignar"
  // -- reasignar un evaluador que ya contesto choca con el unique
  // (promocionId, rol) de `evaluaciones` (ver reasignarEvaluadorPromocion).
  // leftJoin porque el slot puede no existir todavia (evaluaciones se crea
  // en confirmarInscripcion, pero inscripciones viejas pre-backfill pueden
  // no tenerlo -- ver scripts/backfill-evaluaciones-existentes.ts) o estar
  // en 'borrador'.
  const evalJefe = alias(schema.evaluaciones, "eval_jefe");
  const evalCompanero1 = alias(schema.evaluaciones, "eval_companero1");
  const evalCompanero2 = alias(schema.evaluaciones, "eval_companero2");

  const limit = filtros?.limit ?? 20;
  const page = filtros?.page ?? 1;
  const offset = (page - 1) * limit;

  const where = filtros?.search
    ? or(
        like(trabajador.nombreCompleto, `%${filtros.search}%`),
        like(trabajador.curp, `%${filtros.search}%`),
      )
    : undefined;

  const [items, countResult, rotasResult] = await Promise.all([
    d
      .select({
        id: schema.promociones.id,
        enviadoAt: schema.promociones.enviadoAt,
        // M4: para que el admin pueda excluir al TRABAJADOR de esta
        // inscripcion (no a si mismo) al buscar un reemplazo en el pool --
        // ver buscarEnPoolPromocion/GestionPromocion.tsx.
        trabajadorUserId: schema.promociones.userId,
        trabajadorNombre: trabajador.nombreCompleto,
        trabajadorCurp: trabajador.curp,
        jefeNombre: jefe.nombre,
        companero1Nombre: companero1.nombre,
        companero2Nombre: companero2.nombre,
        jefeEvaluacionEstado: evalJefe.estado,
        companero1EvaluacionEstado: evalCompanero1.estado,
        companero2EvaluacionEstado: evalCompanero2.estado,
        // Puntaje real de cada evaluador -- listarInscripcionesPromocion
        // solo la expone via adminProcedure (nadie mas la llama, ver
        // server/routers/promocion.ts), consistente con la regla de que
        // solo el admin ve puntajes (mismo criterio que
        // listarResultadosPromocion).
        jefePuntaje: evalJefe.puntajeFinal,
        companero1Puntaje: evalCompanero1.puntajeFinal,
        companero2Puntaje: evalCompanero2.puntajeFinal,
      })
      .from(schema.promociones)
      .innerJoin(trabajador, eq(trabajador.userId, schema.promociones.userId))
      .leftJoin(jefe, eq(jefe.id, schema.promociones.jefeAsignadoId))
      .leftJoin(companero1, eq(companero1.id, schema.promociones.companero1Id))
      .leftJoin(companero2, eq(companero2.id, schema.promociones.companero2Id))
      .leftJoin(evalJefe, and(eq(evalJefe.promocionId, schema.promociones.id), eq(evalJefe.rol, "jefe")))
      .leftJoin(evalCompanero1, and(eq(evalCompanero1.promocionId, schema.promociones.id), eq(evalCompanero1.rol, "companero1")))
      .leftJoin(evalCompanero2, and(eq(evalCompanero2.promocionId, schema.promociones.id), eq(evalCompanero2.rol, "companero2")))
      .where(where)
      .limit(limit)
      .offset(offset),
    d
      .select({ count: sql<number>`count(*)` })
      .from(schema.promociones)
      .innerJoin(trabajador, eq(trabajador.userId, schema.promociones.userId))
      .where(where),
    // Panorama global (sin filtro de busqueda) -- cuantas inscripciones
    // tienen alguna referencia de evaluador rota. jefeAsignadoId/companeroXId
    // son FK a users.id con onDelete:"restrict", asi que este leftJoin contra
    // `users` SIEMPRE deberia encontrar fila -- conReferenciaRota deberia ser
    // estructuralmente 0 de aqui en adelante. La query se deja igual (barata,
    // defensiva) para no tener que rehacer el KPI de GestionPromocion.tsx.
    d
      .select({ count: sql<number>`count(*)` })
      .from(schema.promociones)
      .leftJoin(jefe, eq(jefe.id, schema.promociones.jefeAsignadoId))
      .leftJoin(companero1, eq(companero1.id, schema.promociones.companero1Id))
      .leftJoin(companero2, eq(companero2.id, schema.promociones.companero2Id))
      .where(or(isNull(jefe.id), isNull(companero1.id), isNull(companero2.id))),
  ]);

  const total = countResult[0]?.count ?? 0;
  const conReferenciaRota = rotasResult[0]?.count ?? 0;

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    conReferenciaRota,
  };
}

export type ResultadoPromocionItem = {
  promocionId: number;
  trabajadorNombre: string;
  trabajadorCurp: string;
  autoevaluacion: ComponentePuntaje | null;
  jefe: ComponentePuntaje | null;
  companero1: ComponentePuntaje | null;
  companero2: ComponentePuntaje | null;
  total: number;
  completo: boolean;
};

// Filtro/orden por total y estado se resuelven en JS DESPUES del query, no
// en SQL -- total/completo son derivados de 4 estados+puntajes, no
// columnas reales. El volumen esperado (mismo orden que inscripciones a
// Promocion, cientos de filas) no justifica llevar la suma a SQL (ver
// spec, seccion Backend).
export async function listarResultadosPromocion(filtros: {
  search?: string;
  estado?: "completo" | "pendiente";
  ordenTotal?: "asc" | "desc";
  page: number;
  limit: number;
}): Promise<{ items: ResultadoPromocionItem[]; total: number; page: number; limit: number; totalPages: number }> {
  const d = await getDb();
  const trabajador = alias(schema.servidoresPublicos, "trabajador");
  const evalJefe = alias(schema.evaluaciones, "eval_jefe");
  const evalCompanero1 = alias(schema.evaluaciones, "eval_companero1");
  const evalCompanero2 = alias(schema.evaluaciones, "eval_companero2");

  const where = filtros.search
    ? or(
        like(trabajador.nombreCompleto, `%${escaparComodinesLike(filtros.search)}%`),
        like(trabajador.curp, `%${escaparComodinesLike(filtros.search)}%`),
      )
    : undefined;

  const filas = await d
    .select({
      promocionId: schema.promociones.id,
      trabajadorNombre: trabajador.nombreCompleto,
      trabajadorCurp: trabajador.curp,
      autoEstado: schema.autoevaluaciones.estado,
      autoPuntaje: schema.autoevaluaciones.puntaje,
      jefeEstado: evalJefe.estado,
      jefePuntaje: evalJefe.puntajeFinal,
      c1Estado: evalCompanero1.estado,
      c1Puntaje: evalCompanero1.puntajeFinal,
      c2Estado: evalCompanero2.estado,
      c2Puntaje: evalCompanero2.puntajeFinal,
    })
    .from(schema.promociones)
    .innerJoin(trabajador, eq(trabajador.userId, schema.promociones.userId))
    .leftJoin(schema.autoevaluaciones, eq(schema.autoevaluaciones.promocionId, schema.promociones.id))
    .leftJoin(evalJefe, and(eq(evalJefe.promocionId, schema.promociones.id), eq(evalJefe.rol, "jefe")))
    .leftJoin(evalCompanero1, and(eq(evalCompanero1.promocionId, schema.promociones.id), eq(evalCompanero1.rol, "companero1")))
    .leftJoin(evalCompanero2, and(eq(evalCompanero2.promocionId, schema.promociones.id), eq(evalCompanero2.rol, "companero2")))
    .where(where)
    .orderBy(schema.promociones.id);

  let items: ResultadoPromocionItem[] = filas.map((f) => {
    const autoevaluacion = f.autoEstado ? { estado: f.autoEstado, puntaje: f.autoPuntaje } : null;
    const jefe = f.jefeEstado ? { estado: f.jefeEstado, puntaje: f.jefePuntaje } : null;
    const companero1 = f.c1Estado ? { estado: f.c1Estado, puntaje: f.c1Puntaje } : null;
    const companero2 = f.c2Estado ? { estado: f.c2Estado, puntaje: f.c2Puntaje } : null;
    const { total, completo } = calcularResultadoPromocion({ autoevaluacion, jefe, companero1, companero2 });
    return { promocionId: f.promocionId, trabajadorNombre: f.trabajadorNombre, trabajadorCurp: f.trabajadorCurp, autoevaluacion, jefe, companero1, companero2, total, completo };
  });

  if (filtros.estado === "completo") items = items.filter((i) => i.completo);
  if (filtros.estado === "pendiente") items = items.filter((i) => !i.completo);

  if (filtros.ordenTotal) {
    items = [...items].sort((a, b) => {
      const diff = filtros.ordenTotal === "asc" ? a.total - b.total : b.total - a.total;
      return diff !== 0 ? diff : a.promocionId - b.promocionId;
    });
  }

  const total = items.length;
  const offset = (filtros.page - 1) * filtros.limit;
  const pageItems = items.slice(offset, offset + filtros.limit);

  return { items: pageItems, total, page: filtros.page, limit: filtros.limit, totalPages: Math.ceil(total / filtros.limit) };
}

// M8: escapa % y _ (los 2 wildcards de LIKE) del termino de busqueda antes
// de envolverlo en %...% -- sin esto, alguien podia mandar "%" y traer TODO
// el pool activo de un rol en una sola pagina, o "_" para matchear un
// caracter cualquiera. MySQL usa "\" como escape por default (sin
// NO_BACKSLASH_ESCAPES en este proyecto), consistente con como drizzle liga
// el parametro.
function escaparComodinesLike(valor: string): string {
  return valor.replace(/[%_\\]/g, (c) => `\\${c}`);
}

// correoPrellenado SOLO viene de users.email (cuenta SIDCU real, verificada
// por el propio dueño al registrarse) -- nunca de correoSugerido (el correo
// del CSV del roster, capturado por el admin, sin verificar). Antes caia a
// correoSugerido si la persona no tenia cuenta, pero eso precargaba un
// correo no confirmado como si fuera dato confiable -- el trabajador podia
// confiar en el sin darse cuenta de que nadie lo valido. Ahora si no hay
// cuenta el campo queda en blanco y el trabajador lo captura el mismo
// (decision de producto 2026-09-26, tras verificar en vivo con Playwright
// que el fallback viejo sí se disparaba).
// `excluido` resuelve el CURP del propio llamante (si tiene) para no
// mostrarlo en su propia busqueda -- si no tiene CURP (o no existe), no se
// excluye nada. `.limit(1)` en el select de `excluido`: users.curp no tiene
// UNIQUE (a diferencia de users.id, que si), asi que sin el limit una fila
// duplicada de CURP haria que drizzle regrese mas de un renglon donde solo
// se espera 0 o 1.
export async function buscarEnPoolPromocion(
  q: string,
  rol: "jefe" | "companero",
  excluirUserId: number,
): Promise<Array<{ curp: string; nombre: string; tieneCuenta: boolean; correoPrellenado: string | null }>> {
  const d = await getDb();
  const [excluido] = await d
    .select({ curp: schema.users.curp })
    .from(schema.users)
    .where(eq(schema.users.id, excluirUserId))
    .limit(1);

  const term = `%${escaparComodinesLike(q)}%`;
  const filas = await d
    .select({
      curp: schema.promocionEvaluadorPool.curp,
      nombre: schema.promocionEvaluadorPool.nombre,
      userId: schema.users.id,
      emailCuenta: schema.users.email,
    })
    .from(schema.promocionEvaluadorPool)
    .leftJoin(schema.users, eq(schema.users.curp, schema.promocionEvaluadorPool.curp))
    .where(and(
      eq(schema.promocionEvaluadorPool.rol, rol),
      eq(schema.promocionEvaluadorPool.activo, true),
      excluido?.curp ? ne(schema.promocionEvaluadorPool.curp, excluido.curp) : undefined,
      or(like(schema.promocionEvaluadorPool.nombre, term), like(schema.promocionEvaluadorPool.curp, term)),
      or(
        isNull(schema.users.id),
        eq(schema.users.isActive, true),
        isNotNull(schema.users.evaluadorCuentaExpiraEn),
      ),
    ))
    .limit(15);

  // M3: users.curp no tiene UNIQUE (gap aceptado y documentado) -- si 2
  // cuentas comparten CURP, el leftJoin de arriba puede regresar la misma
  // fila del pool 2 veces. BuscadorEvaluador.tsx usa `key={r.curp}`, asi que
  // un duplicado aqui se renderizaria/keyearia 2 veces. Dedupe por curp,
  // quedandonos con la primera ocurrencia.
  const vistos = new Set<string>();
  return filas
    .filter((f) => {
      if (vistos.has(f.curp)) return false;
      vistos.add(f.curp);
      return true;
    })
    .map((f) => ({
      curp: f.curp,
      nombre: f.nombre,
      tieneCuenta: f.userId !== null,
      correoPrellenado: f.emailCuenta ?? null,
    }));
}

// Existencia (no listado) del catálogo por rol -- usado por
// BuscadorEvaluador.tsx para distinguir "catálogo vacío" (nadie de ese rol
// cargado por el admin todavía) de "sin coincidencias para esta búsqueda"
// (catálogo con gente, solo no encontró lo que escribiste). Mismo filtro de
// `activo` que buscarEnPoolPromocion (ya no hay `estatus` de servidor que
// filtrar, el pool es identidad directa), sin término de búsqueda.
export async function poolPromocionTieneRegistros(rol: "jefe" | "companero"): Promise<boolean> {
  const d = await getDb();
  const filas = await d
    .select({ curp: schema.promocionEvaluadorPool.curp })
    .from(schema.promocionEvaluadorPool)
    .where(and(
      eq(schema.promocionEvaluadorPool.rol, rol),
      eq(schema.promocionEvaluadorPool.activo, true),
    ))
    .limit(1);
  return filas.length > 0;
}

export async function reasignarEvaluadorPromocion(
  promocionId: number,
  rol: "jefe" | "companero1" | "companero2",
  nuevoCurp: string,
  nuevoNombre: string,
  correoCapturado: string,
  adminUserId: number,
): Promise<{ ok: true } | { ok: false; error: "PROMOCION_NO_ENCONTRADA" | "SELECCION_INVALIDA" | "CORREO_INVALIDO" | "EVALUACION_YA_ENVIADA" | "REASIGNACION_CONCURRENTE" }> {
  // I3: formato+MX del correo capturado por el admin, antes de abrir la
  // transaccion (mismo motivo que confirmarInscripcion: no tener I/O de DNS
  // colgado adentro de un tx de MySQL).
  const correoValido = await validarCorreoEvaluador(correoCapturado);
  if (!correoValido.ok) return { ok: false, error: "CORREO_INVALIDO" };

  const d = await getDb();
  const rolPool = rol === "jefe" ? "jefe" : "companero";

  try {
    return await d.transaction(async (tx) => {
      const poolRow = await curpEnPool(tx, nuevoCurp, rolPool);
      if (!poolRow) return { ok: false as const, error: "SELECCION_INVALIDA" as const };

      const [promo] = await tx.select().from(schema.promociones).where(eq(schema.promociones.id, promocionId));
      if (!promo) return { ok: false as const, error: "PROMOCION_NO_ENCONTRADA" as const };

      // Chequeo de conflicto ANTES de asignarEvaluador: si el CURP destino ya
      // tiene cuenta vinculada, usamos ESE userId para detectar auto-conflicto
      // sin llamar todavia a asignarEvaluador (que haria un UPDATE users.email
      // que quedaria commiteado aunque rechacemos despues -- Drizzle solo hace
      // rollback ante un throw, no ante un return de fallo logico). Si el CURP
      // aun no tiene cuenta (usuarioVinculado es undefined), no hay nada que
      // pueda coincidir todavia, asi que se sigue derecho a asignarEvaluador.
      // Rediseño 2026-09-26: se busca directo en `users` por CURP, ya no via
      // servidores_publicos.userId (esa tabla ni participa en el pool ahora).
      const [usuarioVinculado] = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.curp, nuevoCurp))
        .limit(1);

      if (
        usuarioVinculado?.id != null &&
        (
          usuarioVinculado.id === promo.userId ||
          (rol !== "jefe" && usuarioVinculado.id === promo.jefeAsignadoId) ||
          (rol !== "companero1" && usuarioVinculado.id === promo.companero1Id) ||
          (rol !== "companero2" && usuarioVinculado.id === promo.companero2Id)
        )
      ) {
        return { ok: false as const, error: "SELECCION_INVALIDA" as const };
      }

      const { userId: nuevoUserId, passwordTemporalEnClaro } = await asignarEvaluador(tx, nuevoCurp, poolRow.nombre, correoCapturado);

      // La fila `evaluaciones` del slot reasignado solo puede estar en
      // 'borrador' -- una evaluación 'enviada' no se puede perder (nadie
      // reasigna un evaluador que ya contestó, el caso real de uso es
      // expiración de cuenta ANTES de contestar). Se borra la fila vieja (si
      // existe -- puede que ni siquiera se hubiera "iniciado" todavía, en
      // cuyo caso no hay filas de evaluacionRespuestas que limpiar, el
      // onDelete cascade se encarga si sí las había) y se crea una nueva
      // para el evaluador nuevo, mismo patrón borrador que confirmarInscripcion.
      // Si el slot viejo ya estaba 'enviado' (evaluador ya contesto), este
      // DELETE no encuentra nada que borrar (solo filtra estado='borrador')
      // y el INSERT de abajo choca con el unique (promocionId, rol) --
      // capturado como EVALUACION_YA_ENVIADA en el catch de este try (Fix 2,
      // revision final).
      await tx.delete(schema.evaluaciones).where(and(
        eq(schema.evaluaciones.promocionId, promocionId),
        eq(schema.evaluaciones.rol, rol),
        eq(schema.evaluaciones.estado, "borrador"),
      ));
      await tx.insert(schema.evaluaciones).values({ promocionId, rol, evaluadorUserId: nuevoUserId });

      let valorAnterior: number;
      let update: Partial<typeof schema.promociones.$inferInsert>;
      if (rol === "jefe") { valorAnterior = promo.jefeAsignadoId; update = { jefeAsignadoId: nuevoUserId }; }
      else if (rol === "companero1") { valorAnterior = promo.companero1Id; update = { companero1Id: nuevoUserId }; }
      else { valorAnterior = promo.companero2Id; update = { companero2Id: nuevoUserId }; }

      await tx.update(schema.promociones).set(update).where(eq(schema.promociones.id, promocionId));
      await tx.insert(schema.promocionCorreosPendientes).values({ promocionId, destinatarioUserId: nuevoUserId, rol, passwordTemporalEnClaro });
      await tx.insert(schema.auditoria).values({
        servidorId: null,
        usuarioId: adminUserId,
        accion: "actualizar",
        descripcion: `Promoción #${promocionId}: reasignó ${rol}`,
        cambiosAnteriores: JSON.stringify({ [rol]: valorAnterior }),
        cambiosPosterior: JSON.stringify({ [rol]: nuevoUserId }),
      });

      return { ok: true as const };
    });
  } catch (err: any) {
    // El slot reasignado puede tener una evaluacion ya 'enviado' (el
    // evaluador viejo ya contesto antes de que el admin decidiera
    // reasignar) -- el DELETE de arriba solo borra estado='borrador', asi
    // que no encuentra nada, y el INSERT siguiente choca con
    // eval_promocion_rol_idx (unique promocionId+rol). Antes esto se
    // propagaba como un 500 crudo; ahora se traduce a un error tipado que
    // el router convierte en un mensaje claro (hallazgo revision final).
    //
    // Minor parqueado en esa misma revision: el mismo ER_DUP_ENTRY tambien
    // puede salir por una colision rarisima de 2 reasignaciones al mismo
    // (promocionId, rol) casi al mismo tiempo -- ahi la fila que "gano" la
    // carrera sigue en 'borrador', no es que alguien ya evaluo. Se relee el
    // estado real (fuera de la transaccion que ya se revirtio) para
    // distinguir los 2 casos en vez de asumir siempre "ya envio".
    if (codigoMysql(err) === "ER_DUP_ENTRY") {
      const [filaActual] = await d.select({ estado: schema.evaluaciones.estado })
        .from(schema.evaluaciones)
        .where(and(eq(schema.evaluaciones.promocionId, promocionId), eq(schema.evaluaciones.rol, rol)));
      if (filaActual?.estado === "enviado") return { ok: false, error: "EVALUACION_YA_ENVIADA" };
      return { ok: false, error: "REASIGNACION_CONCURRENTE" };
    }
    throw err;
  }
}

const TOPE_INTENTOS_CORREO = 5;

export async function procesarLotePendientesCorreo(limite = 50): Promise<{ procesados: number; enviados: number; fallidos: number }> {
  const d = await getDb();
  const pendientes = await d
    .select()
    .from(schema.promocionCorreosPendientes)
    .where(eq(schema.promocionCorreosPendientes.estado, "pendiente"))
    .limit(limite);

  let enviados = 0;
  let fallidos = 0;

  for (const fila of pendientes) {
    const [destinatario] = await d
      .select({ email: schema.users.email, nombre: schema.users.nombre, curp: schema.users.curp })
      .from(schema.users)
      .where(eq(schema.users.id, fila.destinatarioUserId));

    if (!destinatario?.email) {
      fallidos++;
      await d.update(schema.promocionCorreosPendientes)
        .set({ estado: "fallido", intentos: fila.intentos + 1, ultimoError: "destinatario sin correo" })
        .where(eq(schema.promocionCorreosPendientes.id, fila.id));
      continue;
    }

    const [promocion] = await d
      .select({ nombreCompleto: schema.servidoresPublicos.nombreCompleto })
      .from(schema.promociones)
      .innerJoin(schema.servidoresPublicos, eq(schema.servidoresPublicos.userId, schema.promociones.userId))
      .where(eq(schema.promociones.id, fila.promocionId));

    // La plantilla se elige por si ESTA fila trae password (creada junto con
    // la cuenta nueva) -- asignarEvaluador guarda el password en claro en
    // esta misma fila (nunca en una columna permanente de users; la
    // contraseña emitida es única y no se cambia, no hace falta rastrear su
    // estado en la cuenta).
    const plantilla = fila.passwordTemporalEnClaro ? "evaluador_nueva_cuenta" : "evaluador_cuenta_existente";
    const resultado = await enviarCorreoEvaluador(destinatario.email, plantilla, {
      nombre: destinatario.nombre,
      curp: destinatario.curp ?? "",
      trabajador: promocion?.nombreCompleto ?? "",
      passwordTemporal: fila.passwordTemporalEnClaro ?? "",
    });

    if (resultado.ok) {
      enviados++;
      await d.update(schema.promocionCorreosPendientes)
        .set({ estado: "enviado", enviadoAt: new Date(), passwordTemporalEnClaro: null })
        .where(eq(schema.promocionCorreosPendientes.id, fila.id));
    } else if (resultado.configuracionFaltante) {
      // I6: un RESEND_API_KEY/RESEND_FROM_EMAIL faltante es un error de
      // CONFIGURACION, no una falla real de envio -- si contara como
      // intento, un deploy con las variables todavia sin poner en Railway
      // quemaria los 5 reintentos de TODA la cola en los primeros 10 minutos
      // (el worker corre cada 2 min) y todo terminaria en "fallido"
      // (dead-letter) sin que nada estuviera realmente mal con esos correos.
      // Se deja la fila en "pendiente" sin tocar `intentos`, para que quede
      // esperando indefinidamente a que se corrija la configuracion.
      fallidos++;
      await d.update(schema.promocionCorreosPendientes)
        .set({ ultimoError: resultado.error })
        .where(eq(schema.promocionCorreosPendientes.id, fila.id));
    } else {
      fallidos++;
      const nuevosIntentos = fila.intentos + 1;
      const esFalloDefinitivo = nuevosIntentos >= TOPE_INTENTOS_CORREO;
      await d.update(schema.promocionCorreosPendientes)
        .set({
          estado: esFalloDefinitivo ? "fallido" : "pendiente",
          intentos: nuevosIntentos,
          ultimoError: resultado.error,
          // Hallazgo de auditoria DBA: al quedar "fallido" definitivo ya no
          // hay reintento automatico posible -- dejar el password real en
          // claro en la fila para siempre es exposicion sin beneficio (el
          // admin reasigna/reintenta desde el panel sin necesitar releerlo).
          ...(esFalloDefinitivo ? { passwordTemporalEnClaro: null } : {}),
        })
        .where(eq(schema.promocionCorreosPendientes.id, fila.id));
    }
  }

  return { procesados: pendientes.length, enviados, fallidos };
}

// Corre en un setInterval (ver server/lib/evaluadorExpiracionWorker.ts).
// isActive=false ya es suficiente para bloquear el login (server/routers.ts
// ya lo rechaza) -- no hace falta limpiar evaluadorCuentaExpiraEn aparte,
// esa columna se queda como registro de que la cuenta SÍ llegó a expirar.
export async function desactivarEvaluadoresExpirados(): Promise<number> {
  const d = await getDb();
  const vencidas = await d.select({ id: schema.users.id })
    .from(schema.users)
    .where(and(
      isNotNull(schema.users.evaluadorCuentaExpiraEn),
      lt(schema.users.evaluadorCuentaExpiraEn, new Date()),
      eq(schema.users.isActive, true),
    ));

  if (vencidas.length === 0) return 0;

  await d.update(schema.users)
    .set({ isActive: false })
    .where(inArray(schema.users.id, vencidas.map((v) => v.id)));

  return vencidas.length;
}

export type CorreoFallidoPromocion = {
  id: number;
  promocionId: number;
  rol: "jefe" | "companero1" | "companero2";
  ultimoError: string | null;
  destinatarioNombre: string;
};

// Panel admin (Task 12): correos que ya agotaron TOPE_INTENTOS_CORREO y
// necesitan intervencion manual (revisar el correo capturado, reintentar).
// Join a promociones+servidoresPublicos (via destinatarioUserId) para poder
// mostrar de quien es cada correo sin que el admin tenga que cruzar el id
// con otra pantalla.
export async function listarCorreosFallidosPromocion(): Promise<CorreoFallidoPromocion[]> {
  const d = await getDb();
  return d
    .select({
      id: schema.promocionCorreosPendientes.id,
      promocionId: schema.promocionCorreosPendientes.promocionId,
      rol: schema.promocionCorreosPendientes.rol,
      ultimoError: schema.promocionCorreosPendientes.ultimoError,
      destinatarioNombre: schema.servidoresPublicos.nombreCompleto,
    })
    .from(schema.promocionCorreosPendientes)
    .innerJoin(schema.promociones, eq(schema.promociones.id, schema.promocionCorreosPendientes.promocionId))
    .innerJoin(schema.servidoresPublicos, eq(schema.servidoresPublicos.userId, schema.promocionCorreosPendientes.destinatarioUserId))
    .where(eq(schema.promocionCorreosPendientes.estado, "fallido"));
}

// Regresa un correo fallido a la cola (procesarLotePendientesCorreo lo vuelve
// a intentar en su siguiente corrida) -- resetea intentos a 0 para que tenga
// otra vez el margen completo de TOPE_INTENTOS_CORREO antes de volver a
// marcarse fallido.
export async function reintentarCorreoPromocion(id: number): Promise<void> {
  const d = await getDb();
  await d.update(schema.promocionCorreosPendientes)
    .set({ estado: "pendiente", intentos: 0 })
    .where(eq(schema.promocionCorreosPendientes.id, id));
}

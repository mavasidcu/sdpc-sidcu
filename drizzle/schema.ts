import { int, mysqlEnum, mysqlTable, text, timestamp, datetime, varchar, boolean, bigint, index, foreignKey } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  curp: varchar("curp", { length: 18 }),
  email: varchar("email", { length: 320 }),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["admin", "capturista", "consultor", "user"]).default("user").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  curpIdx: index("users_curp_idx").on(table.curp),
  roleActiveIdx: index("users_role_active_idx").on(table.role, table.isActive),
}));

export const servidoresPublicos = mysqlTable("servidores_publicos", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").unique().references(() => users.id, { onDelete: "set null" }),
  nombreCompleto: varchar("nombre_completo", { length: 255 }).notNull(),
  rfc: varchar("rfc", { length: 13 }).notNull().unique(),
  curp: varchar("curp", { length: 18 }).notNull().unique(),
  cargo: varchar("cargo", { length: 255 }).notNull(),
  dependencia: varchar("dependencia", { length: 255 }).notNull(),
  nivel: mysqlEnum("nivel", ["federal", "estatal", "municipal", "otro"]).notNull(),
  fechaIngreso: datetime("fecha_ingreso").notNull(),
  datosContacto: varchar("datos_contacto", { length: 255 }),
  grupoFuncion: mysqlEnum("grupo_funcion", ["ADMO", "TECN", "SERV", "COMUN", "PROFE", "EDU"]).notNull(),
  // A qué universo (SDPC/PAC/SPC) pertenece este servidor -- lo fija el
  // import (una selección por archivo, igual que cursos.tipoPrograma), no
  // el onboarding. Determina qué cursos ve en su catálogo (ver cursos.listar).
  programa: mysqlEnum("programa", ["PAC", "SPC", "SDPC"]).notNull(),
  upa: varchar("upa", { length: 100 }),
  cmao: varchar("cmao", { length: 50 }),
  ua: varchar("ua", { length: 255 }),
  nivelProgresion: int("nivel_progresion").default(0),
  preparacionAcademica: varchar("preparacion_academica", { length: 255 }),
  email: varchar("email", { length: 320 }),
  telOficina: varchar("tel_oficina", { length: 20 }),
  ext: varchar("ext", { length: 10 }),
  actividadDesempena: text("actividad_desempena"),
  jefeInmediatoCurp: varchar("jefe_inmediato_curp", { length: 18 }),
  jefeInmediatoNombre: varchar("jefe_inmediato_nombre", { length: 255 }),
  jefeInmediatoCorreo: varchar("jefe_inmediato_correo", { length: 320 }),
  estatus: mysqlEnum("estatus", ["activo", "inactivo"]).default("activo").notNull(),
  observaciones: text("observaciones"),
  creadoPor: int("creado_por").notNull().references(() => users.id, { onDelete: "restrict" }),
  actualizadoPor: int("actualizado_por").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  rfcIdx: index("rfc_idx").on(table.rfc),
  curpIdx: index("curp_idx").on(table.curp),
  userIdIdx: index("srv_user_id_idx").on(table.userId),
  nombreIdx: index("nombre_idx").on(table.nombreCompleto),
  dependenciaIdx: index("dependencia_idx").on(table.dependencia),
  nivelIdx: index("nivel_idx").on(table.nivel),
  grupoFuncionIdx: index("grupo_funcion_idx").on(table.grupoFuncion),
  programaIdx: index("programa_idx").on(table.programa),
  upaIdx: index("upa_idx").on(table.upa),
  cmaoIdx: index("cmao_idx").on(table.cmao),
  uaIdx: index("ua_idx").on(table.ua),
  nivelProgIdx: index("nivel_prog_idx").on(table.nivelProgresion),
  estatusIdx: index("estatus_idx").on(table.estatus),
  createdAtIdx: index("srv_created_at_idx").on(table.createdAt),
  estatusUserIdx: index("srv_estatus_user_idx").on(table.estatus, table.userId),
  dependenciaEstatusIdx: index("srv_dep_estatus_idx").on(table.dependencia, table.estatus),
}));

export const auditoria = mysqlTable("auditoria", {
  id: int("id").autoincrement().primaryKey(),
  servidorId: int("servidor_id").references(() => servidoresPublicos.id, { onDelete: "set null" }),
  // notNull + RESTRICT a proposito: nunca se hace hard-delete de usuarios
  // (ver eliminarUsuarioCompleto, removido -- solo isActive:false) para que
  // el rastro de auditoria nunca pierda quien hizo cada accion.
  usuarioId: int("usuario_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  accion: mysqlEnum("accion", ["crear", "actualizar", "eliminar", "ver"]).notNull(),
  cambiosAnteriores: text("cambios_anteriores"),
  cambiosPosterior: text("cambios_posterior"),
  descripcion: text("descripcion"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  servidorIdIdx: index("servidor_id_idx").on(table.servidorId),
  usuarioIdIdx: index("usuario_id_idx").on(table.usuarioId),
  fechaIdx: index("fecha_idx").on(table.createdAt),
  servidorFechaIdx: index("aud_srv_fecha_idx").on(table.servidorId, table.createdAt),
}));

export const archivosCargados = mysqlTable("archivos_cargados", {
  id: int("id").autoincrement().primaryKey(),
  nombreOriginal: varchar("nombre_original", { length: 255 }).notNull(),
  tipoArchivo: varchar("tipo_archivo", { length: 50 }).notNull(),
  tamanoBytes: bigint("tamano_bytes", { mode: "number" }).notNull(),
  s3Key: varchar("s3_key", { length: 500 }).notNull(),
  s3Url: text("s3_url").notNull(),
  cargadoPor: int("cargado_por").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const passwordResetTokens = mysqlTable("password_reset_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Solo estado de onboarding/baja -- rfc/curp/cargo/dependencia/nivelGobierno/
// grupoFuncion/nivelProgresion/fechaIngreso/datosContacto vivian duplicados
// aqui Y en servidoresPublicos (que es a donde el onboarding en realidad
// escribe, ver perfil.crear). La copia de aqui nunca se volvia a leer para
// nada real, solo quedaba desincronizada con el tiempo -- causo un bug real
// (nivelProgresion se perdia al auto-registrarse) antes de esta sesion.
// servidoresPublicos es la unica fuente de verdad para esos datos.
export const perfilesServidor = mysqlTable("perfiles_servidor", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  completado: boolean("completado").default(false).notNull(),
  solicitudBaja: boolean("solicitud_baja").default(false).notNull(),
  motivoBaja: text("motivo_baja"),
  fechaSolicitudBaja: timestamp("fecha_solicitud_baja"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdIdx: index("perfil_user_id_idx").on(table.userId),
  completadoIdx: index("perfil_completado_idx").on(table.completado),
  solicitudBajaIdx: index("perfil_baja_idx").on(table.solicitudBaja),
}));

export const cursos = mysqlTable("cursos", {
  id: int("id").autoincrement().primaryKey(),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  descripcion: text("descripcion"),
  nivelRequerido: int("nivel_requerido").default(1).notNull(),
  nivelGobierno: mysqlEnum("nivel_gobierno", ["federal", "estatal", "municipal", "otro"]),
  categoria: varchar("categoria", { length: 100 }).notNull(),
  duracionHoras: int("duracion_horas").notNull(),
  modalidad: mysqlEnum("modalidad", ["presencial", "virtual", "mixto"]).notNull(),
  activo: boolean("activo").default(true).notNull(),
  // Campos modulares — estructura real de PAC / SPC / SDPC (3 programas, sin default: siempre se elige explícito)
  tipoPrograma: mysqlEnum("tipo_programa", ["PAC", "SPC", "SDPC"]).notNull(),
  bloque: int("bloque"),
  numero: int("numero"),
  institucionResponsable: varchar("institucion_responsable", { length: 255 }),
  finalidad: text("finalidad"),
  fechaInicio: timestamp("fecha_inicio"),
  fechaTermino: timestamp("fecha_termino"),
  horarioTexto: varchar("horario_texto", { length: 255 }),
  fechaEvaluacion: timestamp("fecha_evaluacion"),
  horarioEvaluacion: varchar("horario_evaluacion", { length: 255 }),
  duracionEvaluacion: varchar("duracion_evaluacion", { length: 50 }),
  creadoPor: int("creado_por").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  nivelRequeridoIdx: index("curso_nivel_requerido_idx").on(table.nivelRequerido),
  nivelGobiernoIdx: index("curso_nivel_gobierno_idx").on(table.nivelGobierno),
  categoriaIdx: index("curso_categoria_idx").on(table.categoria),
  activoIdx: index("curso_activo_idx").on(table.activo),
  tipoProgramaIdx: index("curso_tipo_programa_idx").on(table.tipoPrograma),
  bloqueIdx: index("curso_bloque_idx").on(table.bloque),
}));

export const instituciones = mysqlTable("instituciones", {
  id: int("id").autoincrement().primaryKey(),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  direccion: text("direccion"),
  contacto: varchar("contacto", { length: 255 }),
  telefono: varchar("telefono", { length: 20 }),
  email: varchar("email", { length: 320 }),
  activo: boolean("activo").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const cursosInstituciones = mysqlTable("cursos_instituciones", {
  id: int("id").autoincrement().primaryKey(),
  cursoId: int("curso_id").notNull().references(() => cursos.id, { onDelete: "cascade" }),
  institucionId: int("institucion_id").notNull().references(() => instituciones.id, { onDelete: "cascade" }),
  cupoMaximo: int("cupo_maximo").notNull(),
  cupoDisponible: int("cupo_disponible").notNull(),
  horario: varchar("horario", { length: 255 }),
  fechaInicio: timestamp("fecha_inicio"),
  fechaFin: timestamp("fecha_fin"),
  activo: boolean("activo").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  cursoIdIdx: index("ci_curso_id_idx").on(table.cursoId),
  institucionIdIdx: index("ci_institucion_id_idx").on(table.institucionId),
  activoIdx: index("ci_activo_idx").on(table.activo),
  cursoActivoIdx: index("ci_curso_activo_idx").on(table.cursoId, table.activo),
  fechasIdx: index("ci_fechas_idx").on(table.fechaInicio, table.fechaFin),
}));

export const solicitudesCurso = mysqlTable("solicitudes_curso", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  cursoId: int("curso_id").notNull().references(() => cursos.id, { onDelete: "restrict" }),
  // Sin .references() inline: el nombre auto-generado por Drizzle para esta
  // FK pasa el limite de 64 caracteres de MySQL (tabla+columna+ref largos).
  // Se define abajo con foreignKey() + nombre corto explicito (fk_sol_curso_institucion).
  cursoInstitucionId: int("curso_institucion_id"),
  estado: mysqlEnum("estado", ["pendiente", "aprobada", "rechazada", "completada"]).default("pendiente").notNull(),
  calificacion: int("calificacion"),
  notasAdmin: text("notas_admin"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdIdx: index("sol_user_id_idx").on(table.userId),
  cursoIdIdx: index("sol_curso_id_idx").on(table.cursoId),
  estadoIdx: index("sol_estado_idx").on(table.estado),
  createdAtIdx: index("sol_created_at_idx").on(table.createdAt),
  userEstadoIdx: index("sol_user_estado_idx").on(table.userId, table.estado),
  userCursoIdx: index("sol_user_curso_idx").on(table.userId, table.cursoId),
  cursoInstitucionFk: foreignKey({
    columns: [table.cursoInstitucionId],
    foreignColumns: [cursosInstituciones.id],
    name: "fk_sol_curso_institucion",
  }).onDelete("set null"),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type ServidorPublico = typeof servidoresPublicos.$inferSelect;
export type InsertServidorPublico = typeof servidoresPublicos.$inferInsert;
export type Auditoria = typeof auditoria.$inferSelect;
export type InsertAuditoria = typeof auditoria.$inferInsert;
export type ArchivoCargado = typeof archivosCargados.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type PerfilServidor = typeof perfilesServidor.$inferSelect;
export type InsertPerfilServidor = typeof perfilesServidor.$inferInsert;
export type Curso = typeof cursos.$inferSelect;
export type InsertCurso = typeof cursos.$inferInsert;
export type Institucion = typeof instituciones.$inferSelect;
export type InsertInstitucion = typeof instituciones.$inferInsert;
export type CursoInstitucion = typeof cursosInstituciones.$inferSelect;
export type InsertCursoInstitucion = typeof cursosInstituciones.$inferInsert;
export type SolicitudCurso = typeof solicitudesCurso.$inferSelect;
export type InsertSolicitudCurso = typeof solicitudesCurso.$inferInsert;

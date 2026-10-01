import { int, mysqlEnum, mysqlTable, text, timestamp, datetime, date, varchar, boolean, bigint, decimal, index, foreignKey, primaryKey, unique } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  curp: varchar("curp", { length: 18 }),
  email: varchar("email", { length: 320 }),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["admin", "capturista", "consultor", "user"]).default("user").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  // Solo se llena si asignarEvaluador crea una cuenta NUEVA para un
  // Jefe/Compañero que no tenía cuenta SIDCU todavía -- null significa
  // cuenta normal (nunca restringida, nunca expira). 3 días hábiles desde
  // la creación (ver calcularExpiracion3DiasHabiles en server/db.ts).
  // Mientras no venza, el gate en App.tsx manda cualquier ruta que no sea
  // /portal/evaluaciones directo ahí. Al vencer, el worker de expiración
  // (server/lib/evaluadorExpiracionWorker.ts) pone isActive=false -- el
  // login ya rechaza isActive=false (server/routers.ts), no hace falta
  // limpiar esta columna aparte.
  evaluadorCuentaExpiraEn: timestamp("evaluador_cuenta_expira_en"),
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

export const FACTORES_INCONFORMIDAD = [
  "capacitacion", "evaluacion_desempeno", "antiguedad", "preparacion_academica",
] as const;

export const inconformidades = mysqlTable("inconformidades", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  estado: mysqlEnum("estado", ["borrador", "enviado"]).notNull().default("borrador"),
  enviadoAt: timestamp("enviado_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  estadoIdx: index("inc_estado_idx").on(table.estado),
}));

export const inconformidadFactores = mysqlTable("inconformidad_factores", {
  id: int("id").autoincrement().primaryKey(),
  inconformidadId: int("inconformidad_id").notNull(),
  factor: mysqlEnum("factor", FACTORES_INCONFORMIDAD).notNull(),
  mensaje: varchar("mensaje", { length: 500 }).notNull(),
  archivoId: int("archivo_id").unique().references(() => archivosCargados.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  inconformidadFactorIdx: index("incf_inconformidad_factor_idx").on(table.inconformidadId, table.factor),
  fk: foreignKey({
    columns: [table.inconformidadId],
    foreignColumns: [inconformidades.id],
    name: "fk_incf_inconformidad",
  }).onDelete("cascade"),
}));

export const factoresInconformidadConfig = mysqlTable("factores_inconformidad_config", {
  factor: mysqlEnum("factor", FACTORES_INCONFORMIDAD).primaryKey(),
  habilitado: boolean("habilitado").notNull().default(true),
});

// Fila unica (id=1, sembrada por scripts/seed-modulo-inconformidad-config.ts)
// -- controla si el modulo COMPLETO esta disponible para los trabajadores,
// no un factor individual. Si fechaDesde/fechaHasta estan seteadas, mandan
// ellas sobre `habilitado` (ver moduloEstaHabilitadoAhora en db.ts) -- tocar
// el switch a mano limpia la ventana programada (decision confirmada con el
// cliente: el switch manual siempre puede forzar apagado/prendido).
export const inconformidadModuloConfig = mysqlTable("inconformidad_modulo_config", {
  id: int("id").autoincrement().primaryKey(),
  habilitado: boolean("habilitado").notNull().default(true),
  fechaDesde: date("fecha_desde", { mode: "string" }),
  fechaHasta: date("fecha_hasta", { mode: "string" }),
  actualizadoPor: int("actualizado_por").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

// Mismo patron que inconformidadModuloConfig (fila unica id=1, sembrada por
// scripts/seed-modulo-promocion-config.ts) -- controla si el modulo COMPLETO
// esta disponible para inscripcion nueva, no afecta inscripciones ya
// confirmadas ni el panel admin.
export const promocionModuloConfig = mysqlTable("promocion_modulo_config", {
  id: int("id").autoincrement().primaryKey(),
  habilitado: boolean("habilitado").notNull().default(true),
  fechaDesde: date("fecha_desde", { mode: "string" }),
  fechaHasta: date("fecha_hasta", { mode: "string" }),
  actualizadoPor: int("actualizado_por").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

// Mismo patron que promocionModuloConfig -- controla si un trabajador puede
// INICIAR su autoevaluacion (aunque ya tenga Promocion confirmada, requisito
// real cumplido), no afecta autoevaluaciones ya iniciadas/enviadas ni el
// panel admin.
export const autoevaluacionModuloConfig = mysqlTable("autoevaluacion_modulo_config", {
  id: int("id").autoincrement().primaryKey(),
  habilitado: boolean("habilitado").notNull().default(true),
  fechaDesde: date("fecha_desde", { mode: "string" }),
  fechaHasta: date("fecha_hasta", { mode: "string" }),
  actualizadoPor: int("actualizado_por").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

// Mismo patron -- controla si un evaluador (Jefe/Companero) puede INICIAR su
// evaluacion (aunque ya haya sido seleccionado, requisito real cumplido), no
// afecta evaluaciones ya iniciadas/enviadas ni el panel admin.
export const evaluadorModuloConfig = mysqlTable("evaluador_modulo_config", {
  id: int("id").autoincrement().primaryKey(),
  habilitado: boolean("habilitado").notNull().default(true),
  fechaDesde: date("fecha_desde", { mode: "string" }),
  fechaHasta: date("fecha_hasta", { mode: "string" }),
  actualizadoPor: int("actualizado_por").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
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

export const PROMOCION_ROLES_POOL = ["jefe", "companero"] as const;

// Catálogo de Jefes/Compañeros por identidad directa (CURP/nombre/correo),
// SIN depender de servidores_publicos -- la mayoría de estas personas nunca
// pasó por la importación general de servidores (son gente externa a SIDCU
// que solo participa una vez, como evaluador de Promoción). Decisión de
// diseño 2026-09-26 (ver docs/superpowers/specs/2026-09-26-pool-evaluadores-identidad-directa-design.md):
// crear un servidor "stub" para estos casos contaminaba Reportes/catálogo de
// cursos con datos categóricos fabricados (programa/grupoFuncion/nivel sin
// valor real). CURP es la llave de identidad, igual que en el resto del
// sistema -- siempre en mayúsculas (ver importarFilaEvaluador).
export const promocionEvaluadorPool = mysqlTable("promocion_evaluador_pool", {
  curp: varchar("curp", { length: 18 }).notNull(),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  rfc: varchar("rfc", { length: 13 }),
  rol: mysqlEnum("rol", PROMOCION_ROLES_POOL).notNull(),
  activo: boolean("activo").notNull().default(true),
  correoSugerido: varchar("correo_sugerido", { length: 320 }),
  actualizadoPor: int("actualizado_por").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.curp, table.rol] }),
  rolActivoIdx: index("promo_pool_rol_activo_idx").on(table.rol, table.activo),
}));

// onDelete: "restrict" en las FKs de evaluadores (jefeAsignadoId/companeroXId)
// -- a diferencia del resto del schema que usa "cascade" -- porque borrar la
// cuenta de un evaluador ya asignado NO debe borrar en cascada el registro
// de inscripcion del trabajador (perderia evidencia de que se inscribio).
export const promociones = mysqlTable("promociones", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  jefeAsignadoId: int("jefe_asignado_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  companero1Id: int("companero1_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  companero2Id: int("companero2_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  calificacionCurso1: int("calificacion_curso1").notNull(),
  calificacionCurso2: int("calificacion_curso2").notNull(),
  enviadoAt: timestamp("enviado_at").defaultNow().notNull(),
}, (table) => ({
  jefeIdx: index("promo_jefe_idx").on(table.jefeAsignadoId),
}));

export const LIKERT_OPCIONES = ["siempre", "frecuente", "algunas_veces", "nunca"] as const;

// Banco maestro de preguntas de Autoevaluación -- lo sube el admin vía
// import CSV (texto + columna correcta), mismo patrón que cursos/
// instituciones/pool de evaluadores. `activo` permite retirar una pregunta
// del sorteo sin borrar historial de quien ya la contestó.
export const autoevaluacionPreguntas = mysqlTable("autoevaluacion_preguntas", {
  id: int("id").autoincrement().primaryKey(),
  texto: varchar("texto", { length: 500 }).notNull(),
  respuestaCorrecta: mysqlEnum("respuesta_correcta", LIKERT_OPCIONES).notNull(),
  activo: boolean("activo").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 1 autoevaluación por inscripción a Promoción (unique en promocionId) --
// no es libre para cualquier trabajador, está ligada al proceso de
// Promoción (decisión confirmada 2026-09-21, ver spec sección 2).
export const autoevaluaciones = mysqlTable("autoevaluaciones", {
  id: int("id").autoincrement().primaryKey(),
  promocionId: int("promocion_id").notNull().unique().references(() => promociones.id, { onDelete: "cascade" }),
  estado: mysqlEnum("estado", ["borrador", "enviado"]).notNull().default("borrador"),
  // decimal, no int: la formula confirmada por el cliente (2026-09-22) vale
  // 0.5 puntos por acierto -- un int truncaria/redondearia el puntaje real.
  // Columna fisica "puntaje_final" (no "puntaje") a proposito: cambiar el
  // TIPO de una columna existente hace que drizzle-kit push proponga un
  // TRUNCATE TABLE antes del ALTER -- y ese TRUNCATE truena en cualquier DB
  // real (ER_TRUNCATE_ILLEGAL_FK, autoevaluacion_respuestas tiene FK a esta
  // tabla), rompiendo el build automatico de Railway. Agregar una columna
  // NUEVA es 100% aditivo, nunca dispara ese camino. La vieja columna
  // "puntaje" (int, sin usar desde este commit) NO necesita limpieza manual:
  // al ya no estar en este schema, el siguiente `drizzle-kit push --force`
  // (el que corre solo railway.json en cada deploy) propone un DROP COLUMN
  // normal para ella -- sin TRUNCATE, sin FK que lo bloquee (verificado
  // 2026-09-22) -- y --force lo aplica solo, sin intervencion manual.
  puntaje: decimal("puntaje_final", { precision: 4, scale: 1, mode: "number" }),
  enviadoAt: timestamp("enviado_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Las 28 filas creadas al "iniciar" SON el registro del sorteo -- evita una
// columna JSON separada y evita re-sortear si el trabajador recarga a
// medias. onDelete "restrict" en preguntaId: no se puede borrar una
// pregunta que alguien ya tiene asignada/contestada (a diferencia de
// `activo=false`, que sí la saca de sorteos futuros sin tocar el historial).
export const autoevaluacionRespuestas = mysqlTable("autoevaluacion_respuestas", {
  id: int("id").autoincrement().primaryKey(),
  autoevaluacionId: int("autoevaluacion_id").notNull(),
  preguntaId: int("pregunta_id").notNull(),
  respuestaElegida: mysqlEnum("respuesta_elegida", LIKERT_OPCIONES),
}, (table) => ({
  respuestaUnicaIdx: unique("autoeval_resp_unica_idx").on(table.autoevaluacionId, table.preguntaId),
  fkAutoeval: foreignKey({
    columns: [table.autoevaluacionId],
    foreignColumns: [autoevaluaciones.id],
    name: "fk_autoeval_resp_autoeval",
  }).onDelete("cascade"),
  fkPregunta: foreignKey({
    columns: [table.preguntaId],
    foreignColumns: [autoevaluacionPreguntas.id],
    name: "fk_autoeval_resp_pregunta",
  }).onDelete("restrict"),
}));

export const EVALUADOR_ROLES_BANCO = ["jefe", "companero"] as const;
export const EVALUACION_ROLES = ["jefe", "companero1", "companero2"] as const;

// Banco maestro de preguntas de Evaluadores -- 2 bancos separados
// (Jefe/Compañero, contenido distinto, nunca comparten preguntas) en UNA
// tabla con discriminador `rol`, mismo patrón que promocionEvaluadorPool.
// El admin sube cada banco con su propio import CSV (ver
// GestionEvaluadores.tsx) -- ambos caen aquí, etiquetados por `rol`.
export const evaluadorPreguntas = mysqlTable("evaluador_preguntas", {
  id: int("id").autoincrement().primaryKey(),
  rol: mysqlEnum("rol", EVALUADOR_ROLES_BANCO).notNull(),
  texto: varchar("texto", { length: 500 }).notNull(),
  respuestaCorrecta: mysqlEnum("respuesta_correcta", LIKERT_OPCIONES).notNull(),
  activo: boolean("activo").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  rolActivoIdx: index("eval_preg_rol_activo_idx").on(table.rol, table.activo),
}));

// 1 fila por slot de evaluador (Jefe/Compañero1/Compañero2) por
// promoción -- se crea en confirmarInscripcion, en `estado=borrador` SIN
// preguntas sorteadas todavía (el sorteo pasa al "iniciar", igual que
// Autoevaluación, para no sortear preguntas de evaluaciones que tal vez
// nunca se empiecen). `evaluadorUserId` se guarda directo (no se deriva
// por join contra promociones) para que sobreviva una reasignación
// posterior sin ambigüedad de a quién le tocó cada intento.
// onDelete "restrict" en evaluadorUserId: borrar la cuenta de un
// evaluador no debe borrar en cascada la evidencia de su evaluación.
export const evaluaciones = mysqlTable("evaluaciones", {
  id: int("id").autoincrement().primaryKey(),
  promocionId: int("promocion_id").notNull().references(() => promociones.id, { onDelete: "cascade" }),
  rol: mysqlEnum("rol", EVALUACION_ROLES).notNull(),
  evaluadorUserId: int("evaluador_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  estado: mysqlEnum("estado", ["borrador", "enviado"]).notNull().default("borrador"),
  // decimal, no int: Jefe da puntos enteros (1pt/acierto) pero Compañero da
  // fracciones de 6/14 por acierto. Nombre físico "puntaje_final" literal
  // (no hace falta el truco de nombre distinto al de TS que sí necesitó
  // autoevaluaciones.puntaje -- esta tabla es nueva desde cero, sin
  // columna "puntaje" vieja que migrar, cero riesgo de TRUNCATE).
  // precision 5, scale 3 (no 4,1 como autoevaluaciones.puntaje): el
  // puntaje de Compañero es aciertos * (6/14), una fraccion NO terminante
  // para la mayoria de los valores enteros de aciertos (ej. 13 aciertos =
  // 5.571..., 2 aciertos = 0.857...) -- scale 1 la redondeaba en silencio
  // (5.571 -> 5.6) sin que el cliente confirmara ese redondeo (hallazgo
  // revision final 2026-09-22). Este ensanchamiento es seguro sin la danza
  // de ADD-COLUMN de autoevaluaciones.puntaje: esta tabla es nueva en esta
  // rama, nunca desplegada a ningun ambiente real, sin datos ni riesgo de
  // TRUNCATE por FK dependiente (ese riesgo solo aplica a una tabla que YA
  // existe en produccion con datos).
  puntajeFinal: decimal("puntaje_final", { precision: 5, scale: 3, mode: "number" }),
  enviadoAt: timestamp("enviado_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  promocionRolIdx: unique("eval_promocion_rol_idx").on(table.promocionId, table.rol),
  evaluadorUserIdx: index("eval_evaluador_user_idx").on(table.evaluadorUserId),
}));

// Las 14 filas creadas al "iniciar" SON el registro del sorteo -- mismo
// principio que autoevaluacionRespuestas (no columna JSON, no re-sorteo
// si el evaluador recarga a medias).
export const evaluacionRespuestas = mysqlTable("evaluacion_respuestas", {
  id: int("id").autoincrement().primaryKey(),
  evaluacionId: int("evaluacion_id").notNull().references(() => evaluaciones.id, { onDelete: "cascade" }),
  preguntaId: int("pregunta_id").notNull().references(() => evaluadorPreguntas.id, { onDelete: "restrict" }),
  respuestaElegida: mysqlEnum("respuesta_elegida", LIKERT_OPCIONES),
}, (table) => ({
  respuestaUnicaIdx: unique("eval_resp_unica_idx").on(table.evaluacionId, table.preguntaId),
}));

export const promocionCorreosPendientes = mysqlTable("promocion_correos_pendientes", {
  id: int("id").autoincrement().primaryKey(),
  promocionId: int("promocion_id").notNull().references(() => promociones.id, { onDelete: "cascade" }),
  destinatarioUserId: int("destinatario_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  rol: mysqlEnum("rol", ["jefe", "companero1", "companero2"]).notNull(),
  estado: mysqlEnum("estado", ["pendiente", "enviado", "fallido"]).notNull().default("pendiente"),
  intentos: int("intentos").notNull().default(0),
  ultimoError: text("ultimo_error"),
  // Solo se llena si asignarEvaluador creo cuenta nueva (ver Task 6/7) --
  // el worker (Task 9) lo necesita para poder mandarlo por correo de forma
  // asincrona, ya que el valor en claro no sobrevive fuera de la transaccion
  // que lo genero. Se limpia (set a null) en el mismo update que marca
  // estado='enviado' -- ventana de exposicion acotada a "hasta que se
  // manda", mismo principio que ya usa password_reset_tokens (secreto de un
  // solo uso, vive en la tabla hasta consumirse).
  passwordTemporalEnClaro: varchar("password_temporal_en_claro", { length: 32 }),
  enviadoAt: timestamp("enviado_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  estadoIdx: index("promo_correo_estado_idx").on(table.estado),
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
export type Inconformidad = typeof inconformidades.$inferSelect;
export type InconformidadFactor = typeof inconformidadFactores.$inferSelect;
export type FactorInconformidadConfig = typeof factoresInconformidadConfig.$inferSelect;
export type InconformidadModuloConfig = typeof inconformidadModuloConfig.$inferSelect;
export type Promocion = typeof promociones.$inferSelect;
export type PromocionEvaluadorPool = typeof promocionEvaluadorPool.$inferSelect;
export type PromocionCorreoPendiente = typeof promocionCorreosPendientes.$inferSelect;
export type PromocionModuloConfig = typeof promocionModuloConfig.$inferSelect;
export type AutoevaluacionModuloConfig = typeof autoevaluacionModuloConfig.$inferSelect;
export type EvaluadorModuloConfig = typeof evaluadorModuloConfig.$inferSelect;
export type AutoevaluacionPregunta = typeof autoevaluacionPreguntas.$inferSelect;
export type Autoevaluacion = typeof autoevaluaciones.$inferSelect;
export type AutoevaluacionRespuesta = typeof autoevaluacionRespuestas.$inferSelect;
export type EvaluadorPregunta = typeof evaluadorPreguntas.$inferSelect;
export type Evaluacion = typeof evaluaciones.$inferSelect;
export type EvaluacionRespuesta = typeof evaluacionRespuestas.$inferSelect;

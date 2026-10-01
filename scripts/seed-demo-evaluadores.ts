import "dotenv/config";
import { eq, and } from "drizzle-orm";
import { getDb } from "../server/db";
import * as schema from "../drizzle/schema";

const PREGUNTAS_DEMO_POR_ROL = (rol: (typeof schema.EVALUADOR_ROLES_BANCO)[number]) =>
  Array.from({ length: 60 }, (_, i) => ({
    rol,
    texto: `Pregunta de evaluación (${rol}) demo #${i + 1}`,
    respuestaCorrecta: schema.LIKERT_OPCIONES[i % schema.LIKERT_OPCIONES.length],
  }));

async function sembrarBanco(rol: (typeof schema.EVALUADOR_ROLES_BANCO)[number]) {
  const db = await getDb();
  const [existente] = await db.select({ id: schema.evaluadorPreguntas.id })
    .from(schema.evaluadorPreguntas)
    .where(eq(schema.evaluadorPreguntas.rol, rol))
    .limit(1);

  if (existente) {
    console.log(`Seed omitido para rol "${rol}": ya hay preguntas en ese banco.`);
    return;
  }

  const filas = PREGUNTAS_DEMO_POR_ROL(rol);
  await db.insert(schema.evaluadorPreguntas).values(filas);
  console.log(`Seed listo: ${filas.length} preguntas de Evaluadores (rol "${rol}") creadas.`);
}

async function main() {
  await sembrarBanco("jefe");
  await sembrarBanco("companero");

  const db = await getDb();
  const pendientes = await db.select({ id: schema.evaluaciones.id, rol: schema.evaluaciones.rol })
    .from(schema.evaluaciones)
    .where(eq(schema.evaluaciones.estado, "borrador"));

  if (pendientes.length === 0) {
    console.log("Aviso: no hay ninguna fila en `evaluaciones` todavía -- corre el flujo real de confirmar inscripción a Promoción (o scripts/seed-demo-promocion.ts + confirmar manualmente en /portal/promocion) para generar evaluaciones de prueba.");
  } else {
    console.log(`Hay ${pendientes.length} evaluación(es) pendiente(s) ya lista(s) para probar (roles: ${[...new Set(pendientes.map((p) => p.rol))].join(", ")}).`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Seed falló:", err);
  process.exit(1);
});

import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb } from "../server/db";
import * as schema from "../drizzle/schema";

// Reusa la promocion demo de Diego Torres Vega (TEST900101HDFRRR04, ver
// scripts/seed-demo-promocion.ts) -- si no existe, corre ese seed primero.
const CURP_TRABAJADOR_DEMO = "TEST900101HDFRRR04";

const PREGUNTAS_DEMO: { texto: string; respuestaCorrecta: (typeof schema.LIKERT_OPCIONES)[number] }[] = Array.from({ length: 60 }, (_, i) => ({
  texto: `Pregunta de autoevaluación demo #${i + 1}`,
  respuestaCorrecta: schema.LIKERT_OPCIONES[i % schema.LIKERT_OPCIONES.length],
}));

async function main() {
  const db = await getDb();

  const [existentes] = await db.select({ count: schema.autoevaluacionPreguntas.id })
    .from(schema.autoevaluacionPreguntas)
    .limit(1);

  if (existentes) {
    console.log("Seed omitido: ya hay preguntas en el banco de Autoevaluación.");
  } else {
    await db.insert(schema.autoevaluacionPreguntas).values(PREGUNTAS_DEMO);
    console.log(`Seed listo: ${PREGUNTAS_DEMO.length} preguntas de Autoevaluación creadas.`);
  }

  const [user] = await db.select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.curp, CURP_TRABAJADOR_DEMO));
  if (!user) {
    console.log(`Aviso: no existe la cuenta demo ${CURP_TRABAJADOR_DEMO} -- corre scripts/seed-demo-promocion.ts primero si quieres probar el flujo completo.`);
  } else {
    const [promocion] = await db.select({ id: schema.promociones.id })
      .from(schema.promociones)
      .where(eq(schema.promociones.userId, user.id));
    if (promocion) {
      console.log(`Cuenta demo lista: CURP ${CURP_TRABAJADOR_DEMO}, promocionId=${promocion.id} -- ya puede iniciar su autoevaluación.`);
    } else {
      console.log(`Aviso: ${CURP_TRABAJADOR_DEMO} no tiene una Promoción confirmada todavía -- confírmala manualmente en /portal/promocion antes de probar Autoevaluación.`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Seed falló:", err);
  process.exit(1);
});

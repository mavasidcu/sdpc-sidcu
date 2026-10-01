import "dotenv/config";
import { getDb } from "../server/db";
import * as schema from "../drizzle/schema";
import { FACTORES_INCONFORMIDAD } from "../drizzle/schema";

async function main() {
  const db = await getDb();
  for (const factor of FACTORES_INCONFORMIDAD) {
    await db.insert(schema.factoresInconformidadConfig)
      .values({ factor, habilitado: true })
      .onDuplicateKeyUpdate({ set: { habilitado: true } });
  }
  console.log(`Seed listo: ${FACTORES_INCONFORMIDAD.length} factores insertados/actualizados.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed falló:", err);
  process.exit(1);
});

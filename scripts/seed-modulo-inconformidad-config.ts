import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb } from "../server/db";
import * as schema from "../drizzle/schema";

async function main() {
  const db = await getDb();
  const [existente] = await db.select({ id: schema.inconformidadModuloConfig.id })
    .from(schema.inconformidadModuloConfig)
    .where(eq(schema.inconformidadModuloConfig.id, 1));

  if (existente) {
    console.log("Seed omitido: ya existe la fila de config del módulo (id=1).");
  } else {
    await db.insert(schema.inconformidadModuloConfig).values({ id: 1, habilitado: true });
    console.log("Seed listo: fila de config del módulo Inconformidad creada (habilitado=true).");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed falló:", err);
  process.exit(1);
});

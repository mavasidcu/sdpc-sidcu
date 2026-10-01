// Script MANUAL de un solo uso -- NO se corre automaticamente (no esta
// referenciado desde railway.json ni desde ningun otro script). Es para
// quien despliegue la rama feature/evaluadores a producción, una sola vez,
// justo después del deploy.
//
// Por qué hace falta: las filas de `evaluaciones` (Jefe/Compañero1/Compañero2
// por inscripción) solo se crean HOY EN ADELANTE por `confirmarInscripcion`
// (Task 4) y una a la vez por `reasignarEvaluadorPromocion` (Task 8).
// Promoción ya está en producción desde antes de este módulo -- cualquier
// trabajador que ya confirmó su inscripción antes de este deploy tiene CERO
// filas en `evaluaciones`. Sin este backfill, sus 3 evaluadores verían la
// lista de "pendientes" vacía para siempre, sin forma de arreglarlo salvo
// que el admin reasignara cada slot uno por uno a mano desde el panel.
//
// Qué hace: por cada fila de `promociones`, revisa si ya existe una fila de
// `evaluaciones` para cada uno de los 3 roles (jefe, companero1, companero2)
// y crea la(s) que falten, usando promociones.jefeAsignadoId/
// companero1Id/companero2Id como evaluadorUserId. Idempotente -- correrlo
// más de una vez no duplica nada (revisa antes de insertar, y además el
// unique (promocionId, rol) del schema protege contra una condición de
// carrera con confirmarInscripcion/reasignarEvaluadorPromocion corriendo al
// mismo tiempo -- ER_DUP_ENTRY por fila se atrapa y se cuenta como "ya
// existía", no como error).
//
// Uso: pnpm tsx scripts/backfill-evaluaciones-existentes.ts

import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb } from "../server/db";
import * as schema from "../drizzle/schema";

type RolSlot = (typeof schema.EVALUACION_ROLES)[number];

function codigoMysql(err: unknown): string | undefined {
  if (err && typeof err === "object") {
    const conCodigo = err as { code?: string; cause?: { code?: string } };
    return conCodigo.code ?? conCodigo.cause?.code;
  }
  return undefined;
}

async function main() {
  const db = await getDb();

  const promociones = await db
    .select({
      id: schema.promociones.id,
      jefeAsignadoId: schema.promociones.jefeAsignadoId,
      companero1Id: schema.promociones.companero1Id,
      companero2Id: schema.promociones.companero2Id,
    })
    .from(schema.promociones);

  const existentes = await db
    .select({ promocionId: schema.evaluaciones.promocionId, rol: schema.evaluaciones.rol })
    .from(schema.evaluaciones);

  const yaExiste = new Set(existentes.map((e) => `${e.promocionId}:${e.rol}`));

  let creadas = 0;
  let yaExistian = 0;
  let saltadasSinEvaluador = 0;

  for (const promo of promociones) {
    const slots: { rol: RolSlot; evaluadorUserId: number | null }[] = [
      { rol: "jefe", evaluadorUserId: promo.jefeAsignadoId },
      { rol: "companero1", evaluadorUserId: promo.companero1Id },
      { rol: "companero2", evaluadorUserId: promo.companero2Id },
    ];

    for (const slot of slots) {
      const llave = `${promo.id}:${slot.rol}`;
      if (yaExiste.has(llave)) {
        yaExistian++;
        continue;
      }

      if (slot.evaluadorUserId == null) {
        // No debería pasar en una inscripción ya confirmada (los 3 se
        // exigen al confirmar), pero por si hay una fila vieja/corrupta con
        // referencia rota, no se inventa un evaluador -- se reporta y se
        // sigue, en vez de tronar todo el backfill por una fila.
        console.warn(`Promoción #${promo.id}, rol "${slot.rol}": sin evaluadorUserId asignado, no se puede crear la fila. Revisar manualmente.`);
        saltadasSinEvaluador++;
        continue;
      }

      try {
        await db.insert(schema.evaluaciones).values({
          promocionId: promo.id,
          rol: slot.rol,
          evaluadorUserId: slot.evaluadorUserId,
        });
        creadas++;
      } catch (err) {
        if (codigoMysql(err) === "ER_DUP_ENTRY") {
          // Otro proceso (confirmarInscripcion/reasignarEvaluadorPromocion,
          // o una corrida anterior de este mismo script) ya la creó entre
          // el select de arriba y este insert -- correcto, cuenta como
          // "ya existía", no como fallo.
          yaExistian++;
          continue;
        }
        throw err;
      }
    }
  }

  console.log("Backfill de evaluaciones terminado.");
  console.log(`  Promociones revisadas: ${promociones.length}`);
  console.log(`  Filas creadas:         ${creadas}`);
  console.log(`  Filas que ya existían: ${yaExistian}`);
  console.log(`  Saltadas (sin evaluador asignado, revisar a mano): ${saltadasSinEvaluador}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill falló:", err);
  process.exit(1);
});

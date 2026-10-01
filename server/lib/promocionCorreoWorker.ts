// Infraestructura nueva para este proyecto -- no hay ningun cron/scheduler
// existente en el repo hoy. setInterval dentro del propio proceso de
// Express se justifica porque Railway corre un servicio unico siempre
// activo (sin cold-start de serverless que evitar). Ver spec, seccion 3.
const INTERVALO_MS = 2 * 60 * 1000;

export function iniciarWorkerCorreosPromocion(): void {
  setInterval(async () => {
    const { procesarLotePendientesCorreo } = await import("../db");
    try {
      await procesarLotePendientesCorreo();
    } catch (err) {
      console.error("Error en worker de correos de Promocion:", err);
    }
  }, INTERVALO_MS);
}

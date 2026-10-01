// Mismo patrón que promocionCorreoWorker.ts -- setInterval dentro del
// proceso de Express, Railway corre un servicio único siempre activo.
// Intervalo más largo que el de correos (esto no es urgente entregar en
// segundos, es una expiración de días) -- 30 minutos es suficiente
// margen para que una cuenta no viva de más por mucho tiempo tras vencer.
const INTERVALO_MS = 30 * 60 * 1000;

export function iniciarWorkerExpiracionEvaluadores(): void {
  setInterval(async () => {
    const { desactivarEvaluadoresExpirados } = await import("../db");
    try {
      const desactivadas = await desactivarEvaluadoresExpirados();
      if (desactivadas > 0) {
        console.log(`Worker de expiración de evaluadores: ${desactivadas} cuenta(s) desactivada(s).`);
      }
    } catch (err) {
      console.error("Error en worker de expiración de evaluadores:", err);
    }
  }, INTERVALO_MS);
}

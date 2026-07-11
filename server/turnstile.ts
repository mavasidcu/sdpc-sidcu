// Verificacion server-side de Cloudflare Turnstile para el registro publico.
// Sin TURNSTILE_SECRET_KEY configurada (dev local sin llaves de Cloudflare
// dadas de alta), se salta la verificacion con un warning -- no debe bloquear
// desarrollo local, pero produccion SIEMPRE debe tener la variable puesta
// (ver ACCIONES_PRODUCCION.md).
export async function verificarTurnstile(token: string, remoteIp?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.warn("[turnstile] TURNSTILE_SECRET_KEY no configurada -- verificacion omitida (solo aceptable en dev)");
    return true;
  }

  if (!token) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await res.json();
    return data.success === true;
  } catch (err) {
    console.error("[turnstile] Error al verificar token:", err);
    return false;
  }
}

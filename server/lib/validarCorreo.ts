import { resolveMx, resolve4, resolve6 } from "dns/promises";

const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function tieneRegistro(consulta: () => Promise<unknown[]>): Promise<boolean> {
  try {
    const registros = await consulta();
    return registros.length > 0;
  } catch {
    return false;
  }
}

// 2 capas, sin restringir a una lista fija de proveedores (Gmail/Outlook/etc)
// -- eso rechazaria correos institucionales legitimos que no esten en esa
// lista. Ver spec, seccion 3.
//
// Bug real detectado en uso (sdpc-sidcu.com.mx, dominio propio del proyecto
// YA EN PRODUCCION): exigir SOLO registro MX rechazaba dominios reales que
// no tienen MX configurado pero si resuelven por A/AAAA. RFC 5321 §5 permite
// entregar correo directo al host del registro A cuando no hay MX (MX
// implicito) -- sin este fallback se rechazaban correos institucionales
// legitimos.
export async function validarCorreoEvaluador(correo: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!FORMATO_CORREO.test(correo)) {
    return { ok: false, error: "formato de correo inválido" };
  }
  const dominio = correo.split("@")[1];
  if (await tieneRegistro(() => resolveMx(dominio))) return { ok: true };
  if (await tieneRegistro(() => resolve4(dominio))) return { ok: true };
  if (await tieneRegistro(() => resolve6(dominio))) return { ok: true };
  return { ok: false, error: "el dominio del correo no existe" };
}

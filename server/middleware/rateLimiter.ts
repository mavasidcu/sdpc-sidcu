import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";
import { verifyToken } from "../auth";
import { COOKIE_NAME } from "../../shared/const";

// Con sesion, la key es la cuenta (userId) -- cada usuario tiene su propio
// presupuesto, sin importar cuantos compartan la misma IP/NAT de oficina.
// Sin sesion (aun no logueado), cae a IP como respaldo -- ese trafico es
// minimo (solo llamadas publicas antes de login) y sigue protegido.
export function keyPorCuentaOIp(req: Request): string {
  const token = req.cookies?.[COOKIE_NAME];
  const user = token ? verifyToken(token) : null;
  return user ? `user:${user.id}` : ipKeyGenerator(req.ip ?? "unknown");
}

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 800,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyPorCuentaOIp,
  handler: (req, res) => {
    res.status(429).json({ error: "Demasiadas solicitudes. Intente de nuevo en unos minutos." });
  },
});

// Extrae el CURP del body de una llamada tRPC a auth.login/auth.register,
// sin importar si el request llega batched (httpBatchLink + superjson
// envuelve el input real en body["0"].json en vez de en el body directo).
//
// CRITICO: no basta con probar ambos shapes con "??" y quedarse con el
// primero que exista -- ?batch=1 en la URL es lo que de verdad decide que
// shape usa tRPC para el login real (createExpressMiddleware ignora el
// otro shape por completo). Si aqui se prueba "top-level primero" sin
// mirar ?batch=1, un atacante manda un "curp" decoy rotando en el nivel
// top mientras el login real (con password real) viaja en body["0"].json
// -- la key del limiter nunca converge en la cuenta real, saltandose
// authLimiter por completo (confirmado con curl: 10+ intentos fallidos
// contra la misma cuenta, cero bloqueos, con este bug presente).
export function extraerCurp(req: Request): string | null {
  const body = req.body as any;
  if (!body || typeof body !== "object") return null;
  const esBatched = req.query?.batch === "1";
  const candidato = esBatched
    ? body["0"]?.json?.curp
    : (body.curp ?? body.json?.curp);
  return typeof candidato === "string" && candidato.trim() ? candidato.trim().toUpperCase() : null;
}

// Capa 1 (la que de verdad importa): limite por CURP, no por IP. El ataque
// real de fuerza bruta es contra UNA cuenta -- da igual desde que IP salga.
// skipSuccessfulRequests para que un login correcto no consuma el margen de
// nadie (solo cuentan los intentos fallidos).
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => extraerCurp(req) ?? ipKeyGenerator(req.ip ?? "unknown"),
  handler: (req, res) => {
    res.status(429).json({ error: "Demasiados intentos de acceso para esta cuenta. Intente de nuevo en 15 minutos." });
  },
});

// Capa 2: respaldo por IP contra abuso de volumen bruto (ej. enumeracion de
// CURPs validos probando muchas cuentas distintas desde una sola maquina).
// La defensa real contra fuerza bruta es authLimiter (por CURP); esta capa
// solo debe frenar volumen fuera de cualquier rango razonable, nunca trafico
// legitimo.
//
// Techo alto (no 150): express-rate-limit incrementa el contador de forma
// SINCRONA al llegar cada request y decide bloquear con ESE conteo antes de
// saber si la request tendra exito -- el decremento de skipSuccessfulRequests
// llega despues, de forma asincrona, cuando la respuesta termina. Bajo una
// rafaga concurrente real (ej. 20+ empleados iniciando sesion casi al mismo
// tiempo a las 9am), muchas requests se cuentan TODAS antes de que ninguna
// termine -- un techo de 150 se agota por la rafaga instantanea, no por
// volumen sostenido, y los 429 resultantes nunca se "perdonan" (no son
// exitosos), quedandose pegados los 15 minutos completos. skipSuccessfulRequests
// sigue siendo correcto para trafico sostenido, pero no alcanza para
// proteger de una rafaga concurrente -- el techo debe ser generoso de por si.
export const authIpBackstopLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    res.status(429).json({ error: "Demasiadas solicitudes desde esta red. Intente de nuevo en 15 minutos." });
  },
});

export const importLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: "Demasiadas importaciones. Espere 5 minutos antes de intentar de nuevo." });
  },
});

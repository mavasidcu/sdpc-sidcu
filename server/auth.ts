import Piscina from "piscina";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import { randomBytes, createHash } from "crypto";
import type { User } from "../drizzle/schema";

// Sin fallback silencioso: si NODE_ENV no queda exacto "production" en
// Railway (o Railway corre el proceso sin pasar por pnpm start), un guard
// basado en NODE_ENV nunca dispara y la app cae en un secreto conocido
// hardcodeado -- forjable por cualquiera que lea este archivo. JWT_SECRET
// siempre debe estar en .env (incluso en dev, ya vive ahi), asi que no hay
// caso legitimo donde falte.
if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET no está configurado — obligatorio, sin excepción de entorno.");
}
const JWT_SECRET = process.env.JWT_SECRET;

// Sin limite explicito, Piscina escala minThreads/maxThreads segun los CPUs
// que detecte el host -- en una instancia nueva con mas CPUs disponibles que
// la vieja, eso levanta mas worker threads en reposo (cada uno con su propio
// heap de V8) sin que el trafico real lo justifique. El volumen de logins de
// este sistema no necesita mas de 2 threads concurrentes.
const bcryptPool = new Piscina({
  filename: fileURLToPath(new URL("./workers/bcrypt-worker.mjs", import.meta.url)),
  minThreads: 1,
  maxThreads: 2,
});

// Aleatorio real, NUNCA derivado del CURP -- el CURP es consultable
// publicamente en RENAPO y ya es el username de login en este sistema; un
// password derivado de el equivaldria a "username = password". Se manda
// solo por el correo capturado por quien selecciona al evaluador (ver
// asignarEvaluador en db.ts), nunca se persiste en texto plano.
const PASSWORD_TEMPORAL_ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function generarPasswordTemporal(): string {
  const bytes = randomBytes(12);
  let resultado = "";
  for (let i = 0; i < 12; i++) {
    resultado += PASSWORD_TEMPORAL_ALFABETO[bytes[i] % PASSWORD_TEMPORAL_ALFABETO.length];
  }
  return resultado;
}

// saltRounds=10: medido con carga real (k6), 12 rondas = ~230ms CPU/hash,
// satura el pool de workers bajo rafaga concurrente de logins (p95 subia a
// 1.4s). 10 rondas = ~57ms CPU/hash (4x mas rapido), sigue siendo el minimo
// recomendado por OWASP contra ataque offline. Hashes existentes con cost=12
// se siguen verificando bien -- bcrypt guarda el costo dentro del hash mismo.
export async function hashPassword(password: string): Promise<string> {
  return bcryptPool.run({ action: "hash", password, saltRounds: 10 });
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcryptPool.run({ action: "compare", password, hash });
}

export function generateToken(
  user: Pick<User, "id" | "role" | "nombre"> & { email?: string | null },
): string {
  return jwt.sign(
    { id: user.id, email: user.email ?? null, role: user.role, nombre: user.nombre },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
}

// El token de restablecimiento en si (randomBytes(32).hex, 256 bits de
// entropia) ya es suficiente contra fuerza bruta -- este hash NO es sobre
// una contraseña de baja entropia (no hace falta bcrypt/argon2, seria costo
// sin beneficio real). El punto es que la DB guarde solo el hash: si alguien
// lee la tabla (backup mal manejado, dump de soporte) no puede reconstruir
// el link de restablecimiento real, solo compararlo si YA lo tiene.
// Deterministico a proposito -- routers.ts hashea el token que llega del
// usuario con esta misma funcion antes de buscarlo por igualdad en la DB.
export function hashTokenRestablecimiento(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyToken(
  token: string,
): { id: number; email: string | null; role: string; nombre: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as {
      id: number;
      email: string | null;
      role: string;
      nombre: string;
    };
  } catch {
    return null;
  }
}

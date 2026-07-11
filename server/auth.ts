import Piscina from "piscina";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
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

const bcryptPool = new Piscina({
  filename: fileURLToPath(new URL("./workers/bcrypt-worker.mjs", import.meta.url)),
});

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

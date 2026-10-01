import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  generarPasswordTemporal,
  hashTokenRestablecimiento,
} from "./auth";

describe("auth", () => {
  it("should hash and verify password", async () => {
    const hash = await hashPassword("test123");
    expect(hash).not.toBe("test123");
    expect(await verifyPassword("test123", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("should generate different hashes for same password", async () => {
    const hash1 = await hashPassword("test123");
    const hash2 = await hashPassword("test123");
    expect(hash1).not.toBe(hash2);
  });

  it("should generate and verify JWT token", () => {
    const user = { id: 1, email: "test@test.com", role: "admin" as const, nombre: "Test User" };
    const token = generateToken(user);
    expect(token).toBeTruthy();

    const decoded = verifyToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.id).toBe(1);
    expect(decoded!.email).toBe("test@test.com");
    expect(decoded!.role).toBe("admin");
  });

  it("should return null for invalid token", () => {
    expect(verifyToken("invalid-token")).toBeNull();
  });
});

describe("generarPasswordTemporal", () => {
  it("genera un password de 12 caracteres alfanumericos", () => {
    const password = generarPasswordTemporal();
    expect(password).toHaveLength(12);
    expect(password).toMatch(/^[A-Za-z0-9]{12}$/);
  });

  it("genera valores distintos en llamadas sucesivas", () => {
    const a = generarPasswordTemporal();
    const b = generarPasswordTemporal();
    expect(a).not.toBe(b);
  });
});

// Hallazgo de auditoria DBA: password_reset_tokens.token se guardaba en
// texto plano -- cualquiera con lectura de la DB (backup mal manejado, un
// dump de soporte) podia forjar el link de restablecimiento de cualquier
// cuenta con un token vigente sin necesitar el correo real. Debe ser
// determinista (la misma entrada siempre hashea igual, para poder buscarla
// por hash en la DB) pero jamas reversible a partir del hash guardado.
describe("hashTokenRestablecimiento", () => {
  it("es deterministico: el mismo token siempre hashea igual", () => {
    const token = "abc123def456";
    expect(hashTokenRestablecimiento(token)).toBe(hashTokenRestablecimiento(token));
  });

  it("nunca regresa el valor original en claro", () => {
    const token = "abc123def456";
    expect(hashTokenRestablecimiento(token)).not.toBe(token);
  });

  it("tokens distintos producen hashes distintos", () => {
    expect(hashTokenRestablecimiento("token-a")).not.toBe(hashTokenRestablecimiento("token-b"));
  });
});

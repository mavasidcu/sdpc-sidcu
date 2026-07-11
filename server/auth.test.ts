import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
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

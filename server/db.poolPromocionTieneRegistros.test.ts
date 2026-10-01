import { vi, describe, it, expect, beforeEach } from "vitest";
import { makeTxRecorder } from "./db.transaction-test-helpers";

vi.mock("mysql2/promise", () => ({ default: { createPool: vi.fn(() => ({})) } }));
vi.mock("drizzle-orm/mysql2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return { ...actual, drizzle: vi.fn() };
});

beforeEach(() => {
  vi.resetModules();
});

describe("poolPromocionTieneRegistros", () => {
  it("regresa true si hay al menos un registro activo de ese rol", async () => {
    const { tx } = makeTxRecorder([[{ curp: "AAAA000101HDFXXX01" }]], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { poolPromocionTieneRegistros } = await import("./db");
    const resultado = await poolPromocionTieneRegistros("jefe");
    expect(resultado).toBe(true);
  });

  it("regresa false si no hay ningún registro activo de ese rol", async () => {
    const { tx } = makeTxRecorder([[]], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { poolPromocionTieneRegistros } = await import("./db");
    const resultado = await poolPromocionTieneRegistros("companero");
    expect(resultado).toBe(false);
  });
});

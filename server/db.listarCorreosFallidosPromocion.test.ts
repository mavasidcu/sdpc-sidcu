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

describe("listarCorreosFallidosPromocion", () => {
  it("regresa los correos en estado fallido con el nombre del destinatario que corresponde", async () => {
    const fila = { id: 1, promocionId: 7, rol: "jefe", ultimoError: "timeout", destinatarioNombre: "Ana Lopez" };
    const { tx } = makeTxRecorder([[fila]], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { listarCorreosFallidosPromocion } = await import("./db");
    const resultado = await listarCorreosFallidosPromocion();
    expect(resultado).toEqual([fila]);
  });

  it("regresa arreglo vacio si no hay correos en estado fallido", async () => {
    const { tx } = makeTxRecorder([[]], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { listarCorreosFallidosPromocion } = await import("./db");
    const resultado = await listarCorreosFallidosPromocion();
    expect(resultado).toEqual([]);
  });
});

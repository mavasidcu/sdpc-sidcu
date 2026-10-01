import { vi, describe, it, expect, beforeEach } from "vitest";
import { makeTxRecorder } from "./db.transaction-test-helpers";

vi.mock("mysql2/promise", () => ({ default: { createPool: vi.fn(() => ({})) } }));
vi.mock("drizzle-orm/mysql2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return { ...actual, drizzle: vi.fn() };
});

// moduloEstaHabilitadoAhora ya se prueba a fondo en
// db.moduloInconformidad.test.ts (funcion pura, sin DB, reusada tal cual
// aqui) -- no se repite esa cobertura, solo las funciones nuevas que tocan DB.

describe("obtenerConfigModuloEvaluadores", () => {
  beforeEach(() => vi.resetModules());

  it("regresa la fila si existe", async () => {
    const row = { id: 1, habilitado: true, fechaDesde: null, fechaHasta: null, actualizadoPor: 1, actualizadoPorNombre: "Admin Prueba", updatedAt: new Date() };
    const { tx } = makeTxRecorder([[row]], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { obtenerConfigModuloEvaluadores } = await import("./db");
    const resultado = await obtenerConfigModuloEvaluadores();
    expect(resultado).toEqual(row);
  });

  it("si falta la fila (seed no corrido), se defiende devolviendo habilitado:true en vez de romper el modulo", async () => {
    const { tx } = makeTxRecorder([[]], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { obtenerConfigModuloEvaluadores } = await import("./db");
    const resultado = await obtenerConfigModuloEvaluadores();
    expect(resultado.habilitado).toBe(true);
    expect(resultado.fechaDesde).toBeNull();
  });
});

describe("actualizarModuloEvaluadoresManual", () => {
  beforeEach(() => vi.resetModules());

  it("actualiza habilitado, limpia la ventana programada, y audita -- todo en una transaccion", async () => {
    const { tx, calls } = makeTxRecorder([], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { actualizarModuloEvaluadoresManual } = await import("./db");
    await actualizarModuloEvaluadoresManual(false, 1);

    expect(fakeDb.transaction).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["update", "insert"]);
  });
});

describe("programarVentanaModuloEvaluadores", () => {
  beforeEach(() => vi.resetModules());

  it("guarda fechaDesde/fechaHasta y audita en una transaccion", async () => {
    const { tx, calls } = makeTxRecorder([], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { programarVentanaModuloEvaluadores } = await import("./db");
    await programarVentanaModuloEvaluadores("2026-06-01", "2026-06-30", 1);

    expect(fakeDb.transaction).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["update", "insert"]);
  });
});

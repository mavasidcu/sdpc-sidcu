import { vi, describe, it, expect, beforeEach } from "vitest";
import { makeTxRecorder } from "./db.transaction-test-helpers";

vi.mock("mysql2/promise", () => ({ default: { createPool: vi.fn(() => ({})) } }));
vi.mock("drizzle-orm/mysql2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return { ...actual, drizzle: vi.fn() };
});

// moduloEstaHabilitadoAhora fija la comparacion a America/Mexico_City (ver
// comentario en db.ts) -- por eso aqui SIEMPRE se construye `ahora` con
// Date.UTC() a un instante conocido (Mexico = UTC-6 fijo, sin DST desde
// 2022), nunca con el constructor local Date(y,m,d,...), que dependeria de
// la timezone del proceso que corre el test y volveria estos tests fragiles
// segun el runner (ej. CI en UTC vs. una maquina en Mexico).
const mx = (y: number, m: number, d: number, h: number, mi: number, s: number) =>
  new Date(Date.UTC(y, m, d, h + 6, mi, s)); // +6 horas = mismo instante en UTC

describe("moduloEstaHabilitadoAhora (funcion pura, sin DB)", () => {
  it("sin ventana programada, manda el flag manual (true)", async () => {
    const { moduloEstaHabilitadoAhora } = await import("./db");
    const config = { habilitado: true, fechaDesde: null, fechaHasta: null } as any;
    expect(moduloEstaHabilitadoAhora(config, mx(2026, 5, 15, 10, 0, 0))).toBe(true);
  });

  it("sin ventana programada, manda el flag manual (false)", async () => {
    const { moduloEstaHabilitadoAhora } = await import("./db");
    const config = { habilitado: false, fechaDesde: null, fechaHasta: null } as any;
    expect(moduloEstaHabilitadoAhora(config, mx(2026, 5, 15, 10, 0, 0))).toBe(false);
  });

  it("con ventana y hoy dentro del rango, esta habilitado sin importar el flag manual", async () => {
    const { moduloEstaHabilitadoAhora } = await import("./db");
    const config = { habilitado: false, fechaDesde: "2026-06-01", fechaHasta: "2026-06-30" } as any;
    expect(moduloEstaHabilitadoAhora(config, mx(2026, 5, 15, 10, 0, 0))).toBe(true);
  });

  it("con ventana y hoy fuera del rango (antes), esta deshabilitado aunque el flag manual sea true", async () => {
    const { moduloEstaHabilitadoAhora } = await import("./db");
    const config = { habilitado: true, fechaDesde: "2026-06-01", fechaHasta: "2026-06-30" } as any;
    expect(moduloEstaHabilitadoAhora(config, mx(2026, 4, 31, 10, 0, 0))).toBe(false);
  });

  it("con ventana y hoy fuera del rango (despues), esta deshabilitado", async () => {
    const { moduloEstaHabilitadoAhora } = await import("./db");
    const config = { habilitado: true, fechaDesde: "2026-06-01", fechaHasta: "2026-06-30" } as any;
    expect(moduloEstaHabilitadoAhora(config, mx(2026, 6, 1, 10, 0, 0))).toBe(false);
  });

  it("los limites del rango (primer y ultimo dia) cuentan como dentro", async () => {
    const { moduloEstaHabilitadoAhora } = await import("./db");
    const config = { habilitado: false, fechaDesde: "2026-06-01", fechaHasta: "2026-06-30" } as any;
    expect(moduloEstaHabilitadoAhora(config, mx(2026, 5, 1, 0, 0, 1))).toBe(true);
    expect(moduloEstaHabilitadoAhora(config, mx(2026, 5, 30, 23, 59, 0))).toBe(true);
  });

  it("cerca de medianoche en Mexico, no se corre por la timezone del host (ej. UTC)", async () => {
    const { moduloEstaHabilitadoAhora } = await import("./db");
    const config = { habilitado: false, fechaDesde: "2026-06-01", fechaHasta: "2026-06-01" } as any;
    // 23:00 del 1-jun en Mexico = 05:00 UTC del 2-jun -- un host corriendo en
    // UTC con el bug viejo (getFullYear/getMonth/getDate del proceso) leeria
    // "2026-06-02" y diria que ya se salio de la ventana. Debe seguir true.
    expect(moduloEstaHabilitadoAhora(config, mx(2026, 5, 1, 23, 0, 0))).toBe(true);
    // Un minuto despues de medianoche en Mexico (2-jun) ya cae fuera.
    expect(moduloEstaHabilitadoAhora(config, mx(2026, 5, 2, 0, 1, 0))).toBe(false);
  });
});

describe("obtenerConfigModuloInconformidad", () => {
  beforeEach(() => vi.resetModules());

  it("regresa la fila si existe", async () => {
    const row = { id: 1, habilitado: true, fechaDesde: null, fechaHasta: null, actualizadoPor: 1, actualizadoPorNombre: "Admin Prueba", updatedAt: new Date() };
    const { tx } = makeTxRecorder([[row]], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { obtenerConfigModuloInconformidad } = await import("./db");
    const resultado = await obtenerConfigModuloInconformidad();
    expect(resultado).toEqual(row);
  });

  it("si falta la fila (seed no corrido), se defiende devolviendo habilitado:true en vez de romper el modulo", async () => {
    const { tx } = makeTxRecorder([[]], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { obtenerConfigModuloInconformidad } = await import("./db");
    const resultado = await obtenerConfigModuloInconformidad();
    expect(resultado.habilitado).toBe(true);
    expect(resultado.fechaDesde).toBeNull();
  });
});

describe("actualizarModuloInconformidadManual", () => {
  beforeEach(() => vi.resetModules());

  it("actualiza habilitado, limpia la ventana programada, y audita -- todo en una transaccion", async () => {
    const { tx, calls } = makeTxRecorder([], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { actualizarModuloInconformidadManual } = await import("./db");
    await actualizarModuloInconformidadManual(false, 1);

    expect(fakeDb.transaction).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["update", "insert"]);
  });
});

describe("programarVentanaModuloInconformidad", () => {
  beforeEach(() => vi.resetModules());

  it("guarda fechaDesde/fechaHasta y audita en una transaccion", async () => {
    const { tx, calls } = makeTxRecorder([], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { programarVentanaModuloInconformidad } = await import("./db");
    await programarVentanaModuloInconformidad("2026-06-01", "2026-06-30", 1);

    expect(fakeDb.transaction).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["update", "insert"]);
  });
});

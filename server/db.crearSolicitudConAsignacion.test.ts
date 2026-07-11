import { vi, describe, it, expect, beforeEach } from "vitest";
import { makeTxRecorder } from "./db.transaction-test-helpers";

vi.mock("mysql2/promise", () => ({
  default: { createPool: vi.fn(() => ({})) },
}));

vi.mock("drizzle-orm/mysql2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return { ...actual, drizzle: vi.fn() };
});

describe("crearSolicitudConAsignacion", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("usa la liga curso-institucion existente si ya hay una (no crea otra)", async () => {
    const { tx, calls } = makeTxRecorder(
      [
        [{ id: 2 }], // institucion predeterminada
        [{ id: 55 }], // liga curso_institucion ya existente
      ],
      [{ insertId: 900 }], // insert de la solicitud
    );
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };

    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { crearSolicitudConAsignacion } = await import("./db");
    const resultado = await crearSolicitudConAsignacion(4, 10);

    expect(fakeDb.transaction).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["select", "select", "insert"]);
    expect(resultado).toEqual({ ok: true, id: 900 });
  });

  it("crea la liga curso-institucion si no existe, luego crea la solicitud", async () => {
    const { tx, calls } = makeTxRecorder(
      [
        [{ id: 2 }], // institucion predeterminada
        [], // sin liga existente para este curso
      ],
      [{ insertId: 777 }, { insertId: 901 }], // insert liga, insert solicitud
    );
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };

    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { crearSolicitudConAsignacion } = await import("./db");
    const resultado = await crearSolicitudConAsignacion(4, 10);

    expect(fakeDb.transaction).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["select", "select", "insert", "insert"]);
    expect(resultado).toEqual({ ok: true, id: 901 });
  });

  it("retorna error si no hay ninguna institucion activa en el sistema", async () => {
    const { tx, calls } = makeTxRecorder([[]]); // select de institucion no encuentra nada
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };

    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { crearSolicitudConAsignacion } = await import("./db");
    const resultado = await crearSolicitudConAsignacion(4, 10);

    expect(fakeDb.transaction).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["select"]);
    expect(resultado).toEqual({ ok: false, error: "SIN_INSTITUCION" });
  });
});

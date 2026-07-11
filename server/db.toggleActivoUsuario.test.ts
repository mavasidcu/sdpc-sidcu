import { vi, describe, it, expect, beforeEach } from "vitest";
import { makeTxRecorder } from "./db.transaction-test-helpers";

vi.mock("mysql2/promise", () => ({
  default: { createPool: vi.fn(() => ({})) },
}));

vi.mock("drizzle-orm/mysql2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return { ...actual, drizzle: vi.fn() };
});

describe("toggleActivoUsuario", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("desactivar: select usuario + update usuario + update servidor, todo en una transaccion", async () => {
    const userRow = { id: 1, isActive: true, nombre: "Ana", email: "ana@test.com" };
    const { tx, calls } = makeTxRecorder([[userRow]]);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };

    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { toggleActivoUsuario } = await import("./db");
    await toggleActivoUsuario(1);

    expect(fakeDb.transaction).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["select", "update", "update"]);
  });

  it("activar sin servidor existente: select usuario + update usuario + select servidor + insert servidor", async () => {
    const userRow = { id: 2, isActive: false, nombre: "Beto", email: "beto@test.com" };
    const { tx, calls } = makeTxRecorder([[userRow], []]);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };

    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { toggleActivoUsuario } = await import("./db");
    await toggleActivoUsuario(2);

    expect(fakeDb.transaction).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["select", "update", "select", "insert"]);
  });

  it("usuario no encontrado: lanza error sin llamar update", async () => {
    const { tx, calls } = makeTxRecorder([[]]);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };

    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { toggleActivoUsuario } = await import("./db");
    await expect(toggleActivoUsuario(999)).rejects.toThrow("Usuario no encontrado");
    expect(calls).toEqual(["select"]);
  });
});

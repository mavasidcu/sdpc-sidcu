import { vi, describe, it, expect, beforeEach } from "vitest";
import { makeTxRecorder } from "./db.transaction-test-helpers";

vi.mock("mysql2/promise", () => ({
  default: { createPool: vi.fn(() => ({})) },
}));

vi.mock("drizzle-orm/mysql2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return { ...actual, drizzle: vi.fn() };
});

describe("eliminarCurso", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("borra solicitudes, asignaciones y curso en una sola transaccion", async () => {
    const { tx, calls } = makeTxRecorder();
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };

    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { eliminarCurso } = await import("./db");
    await eliminarCurso(5);

    expect(fakeDb.transaction).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["delete", "delete", "delete"]);
  });
});

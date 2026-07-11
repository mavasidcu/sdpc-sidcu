import { vi, describe, it, expect, beforeEach } from "vitest";
import { makeTxRecorder } from "./db.transaction-test-helpers";

vi.mock("mysql2/promise", () => ({
  default: { createPool: vi.fn(() => ({})) },
}));

vi.mock("drizzle-orm/mysql2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return { ...actual, drizzle: vi.fn() };
});

describe("eliminarInstitucion", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("borra asignaciones e institucion en una sola transaccion", async () => {
    const { tx, calls } = makeTxRecorder();
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };

    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { eliminarInstitucion } = await import("./db");
    await eliminarInstitucion(3);

    expect(fakeDb.transaction).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["delete", "delete"]);
  });
});

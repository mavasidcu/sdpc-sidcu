import { vi, describe, it, expect, beforeEach } from "vitest";
import { makeTxRecorder } from "./db.transaction-test-helpers";

vi.mock("mysql2/promise", () => ({
  default: { createPool: vi.fn(() => ({})) },
}));

vi.mock("drizzle-orm/mysql2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return { ...actual, drizzle: vi.fn() };
});

describe("eliminarUsuarioCompleto", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("performs all 4 writes inside a single transaction", async () => {
    const { tx, calls } = makeTxRecorder();
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };

    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { eliminarUsuarioCompleto } = await import("./db");
    await eliminarUsuarioCompleto(42);

    expect(fakeDb.transaction).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["update", "delete", "delete", "delete"]);
  });

  it("propagates an error from any write so the transaction rolls back", async () => {
    const fakeDb = {
      transaction: vi.fn(async (cb: any) => {
        const { tx } = makeTxRecorder();
        const throwingTx: any = new Proxy(tx, {
          get(target, prop: string) {
            if (prop === "delete") {
              return () => {
                throw new Error("simulated failure");
              };
            }
            return (target as any)[prop];
          },
        });
        return cb(throwingTx);
      }),
    };

    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { eliminarUsuarioCompleto } = await import("./db");
    await expect(eliminarUsuarioCompleto(42)).rejects.toThrow("simulated failure");
  });
});

import { vi, describe, it, expect, beforeEach } from "vitest";
import { makeTxRecorder } from "./db.transaction-test-helpers";

vi.mock("mysql2/promise", () => ({
  default: { createPool: vi.fn(() => ({})) },
}));

vi.mock("drizzle-orm/mysql2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return { ...actual, drizzle: vi.fn() };
});

async function setupFakeDb(selectResults: any[][]) {
  const { tx, calls } = makeTxRecorder(selectResults);
  const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
  const { drizzle } = await import("drizzle-orm/mysql2");
  vi.mocked(drizzle).mockReturnValue(fakeDb as any);
  return { fakeDb, calls };
}

describe("eliminarServidor", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("con userId asociado: select + delete + update, en una transaccion", async () => {
    const { fakeDb, calls } = await setupFakeDb([[{ userId: 7 }]]);

    const { eliminarServidor } = await import("./db");
    await eliminarServidor(10);

    expect(fakeDb.transaction).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["select", "delete", "update"]);
  });

  it("sin userId asociado: select + delete, sin update", async () => {
    const { fakeDb, calls } = await setupFakeDb([[]]);

    const { eliminarServidor } = await import("./db");
    await eliminarServidor(10);

    expect(fakeDb.transaction).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["select", "delete"]);
  });
});

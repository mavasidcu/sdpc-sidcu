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

describe("reintentarCorreoPromocion", () => {
  it("hace un solo update, regresando el correo a pendiente con intentos en 0", async () => {
    const { tx, calls } = makeTxRecorder([], []);
    const fakeDb = { update: tx.update };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { reintentarCorreoPromocion } = await import("./db");
    await reintentarCorreoPromocion(1);

    expect(calls).toEqual(["update"]);
  });
});

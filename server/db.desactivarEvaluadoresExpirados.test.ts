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

describe("desactivarEvaluadoresExpirados", () => {
  it("desactiva las cuentas vencidas y regresa cuantas fueron", async () => {
    const vencidas = [{ id: 10 }, { id: 11 }];
    const { tx, calls } = makeTxRecorder([vencidas], []);
    const fakeDb = { select: tx.select, update: tx.update };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { desactivarEvaluadoresExpirados } = await import("./db");
    const resultado = await desactivarEvaluadoresExpirados();

    expect(resultado).toBe(2);
    expect(calls).toEqual(["select", "update"]);
  });

  it("regresa 0 sin llamar update si no hay cuentas vencidas", async () => {
    const { tx, calls } = makeTxRecorder([[]], []);
    const fakeDb = { select: tx.select, update: tx.update };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { desactivarEvaluadoresExpirados } = await import("./db");
    const resultado = await desactivarEvaluadoresExpirados();

    expect(resultado).toBe(0);
    expect(calls).toEqual(["select"]);
  });
});

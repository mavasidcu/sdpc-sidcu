import { vi, describe, it, expect, beforeEach } from "vitest";
import { makeTxRecorder } from "./db.transaction-test-helpers";

vi.mock("mysql2/promise", () => ({ default: { createPool: vi.fn(() => ({})) } }));
vi.mock("drizzle-orm/mysql2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return { ...actual, drizzle: vi.fn() };
});

describe("enviarInconformidad", () => {
  beforeEach(() => vi.resetModules());

  it("envia cuando hay al menos un factor guardado", async () => {
    const { tx } = makeTxRecorder(
      [
        [{ id: 10, estado: "borrador" }],
        [{ id: 55 }], // al menos 1 factor existe
        [{ id: 3 }], // servidor
      ],
      [],
    );
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { enviarInconformidad } = await import("./db");
    expect(await enviarInconformidad(4)).toEqual({ ok: true });
  });

  it("rechaza si no hay ningun factor guardado", async () => {
    const { tx } = makeTxRecorder([[{ id: 10, estado: "borrador" }], []], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { enviarInconformidad } = await import("./db");
    expect(await enviarInconformidad(4)).toEqual({ ok: false, error: "SIN_FACTORES" });
  });

  it("rechaza si nunca se inicio ninguna inconformidad", async () => {
    const { tx } = makeTxRecorder([[]], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { enviarInconformidad } = await import("./db");
    expect(await enviarInconformidad(4)).toEqual({ ok: false, error: "NO_INICIADA" });
  });

  it("rechaza (idempotente) si ya estaba enviada -- ej. segunda pestana", async () => {
    const { tx } = makeTxRecorder([[{ id: 10, estado: "enviado" }]], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { enviarInconformidad } = await import("./db");
    expect(await enviarInconformidad(4)).toEqual({ ok: false, error: "YA_ENVIADA" });
  });
});

import { vi, describe, it, expect, beforeEach } from "vitest";
import { makeTxRecorder } from "./db.transaction-test-helpers";

vi.mock("mysql2/promise", () => ({ default: { createPool: vi.fn(() => ({})) } }));
vi.mock("drizzle-orm/mysql2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return { ...actual, drizzle: vi.fn() };
});

describe("quitarFactorInconformidad", () => {
  beforeEach(() => vi.resetModules());
  it("borra un factor sin PDF y no intenta tocar archivosCargados", async () => {
    const { tx } = makeTxRecorder(
      [
        [{ id: 10, estado: "borrador" }],
        [{ id: 55, factor: "capacitacion", archivoId: null }],
        [{ id: 3 }], // servidor
      ],
      [],
    );
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { quitarFactorInconformidad } = await import("./db");
    const resultado = await quitarFactorInconformidad(4, 55);

    expect(resultado).toEqual({ ok: true, s3KeyBorrado: null });
  });

  it("borra un factor con PDF y regresa el s3Key para limpiar despues del commit", async () => {
    const { tx } = makeTxRecorder(
      [
        [{ id: 10, estado: "borrador" }],
        [{ id: 55, factor: "capacitacion", archivoId: 9 }],
        [{ s3Key: "inconformidad/4/55/abc.pdf" }],
        [{ id: 3 }],
      ],
      [],
    );
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { quitarFactorInconformidad } = await import("./db");
    const resultado = await quitarFactorInconformidad(4, 55);

    expect(resultado).toEqual({ ok: true, s3KeyBorrado: "inconformidad/4/55/abc.pdf" });
  });

  it("rechaza si ya fue enviada", async () => {
    const { tx } = makeTxRecorder([[{ id: 10, estado: "enviado" }]], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { quitarFactorInconformidad } = await import("./db");
    expect(await quitarFactorInconformidad(4, 55)).toEqual({ ok: false, error: "YA_ENVIADA" });
  });
});

import { vi, describe, it, expect, beforeEach } from "vitest";
import { makeTxRecorder } from "./db.transaction-test-helpers";

vi.mock("mysql2/promise", () => ({ default: { createPool: vi.fn(() => ({})) } }));
vi.mock("drizzle-orm/mysql2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return { ...actual, drizzle: vi.fn() };
});

describe("confirmarSubidaInconformidad", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("linkea el archivo cuando el factor no tenia ninguno antes", async () => {
    const { tx } = makeTxRecorder(
      [
        [{ id: 10, estado: "borrador" }],
        [{ id: 55, archivoId: null, factor: "capacitacion" }],
        [{ cargadoPor: 4 }], // ownership check del archivo nuevo
        [{ id: 3 }], // servidor
      ],
      [],
    );
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { confirmarSubidaInconformidad } = await import("./db");
    const resultado = await confirmarSubidaInconformidad(4, 55, 99);

    expect(resultado).toEqual({ ok: true, s3KeyViejo: null });
  });

  it("reemplaza el archivo viejo y regresa su s3Key para borrarlo despues del commit", async () => {
    const { tx } = makeTxRecorder(
      [
        [{ id: 10, estado: "borrador" }],
        [{ id: 55, archivoId: 7, factor: "capacitacion" }],
        [{ cargadoPor: 4 }], // ownership check del archivo nuevo
        [{ s3Key: "inconformidad/4/55/viejo.pdf" }],
        [{ id: 3 }],
      ],
      [],
    );
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { confirmarSubidaInconformidad } = await import("./db");
    const resultado = await confirmarSubidaInconformidad(4, 55, 100);

    expect(resultado).toEqual({ ok: true, s3KeyViejo: "inconformidad/4/55/viejo.pdf" });
  });

  it("rechaza si la inconformidad ya fue enviada", async () => {
    const { tx } = makeTxRecorder([[{ id: 10, estado: "enviado" }]], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { confirmarSubidaInconformidad } = await import("./db");
    expect(await confirmarSubidaInconformidad(4, 55, 99)).toEqual({ ok: false, error: "YA_ENVIADA" });
  });

  it("rechaza si el factor no pertenece a esta inconformidad", async () => {
    const { tx } = makeTxRecorder([[{ id: 10, estado: "borrador" }], []], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { confirmarSubidaInconformidad } = await import("./db");
    expect(await confirmarSubidaInconformidad(4, 999, 99)).toEqual({ ok: false, error: "FACTOR_NO_ENCONTRADO" });
  });

  it("rechaza si el archivoId pertenece a otro usuario (IDOR)", async () => {
    const { tx } = makeTxRecorder(
      [
        [{ id: 10, estado: "borrador" }],
        [{ id: 55, archivoId: null, factor: "capacitacion" }],
        [{ cargadoPor: 999 }], // el archivo fue subido por otro usuario, no por userId=4
      ],
      [],
    );
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { confirmarSubidaInconformidad } = await import("./db");
    expect(await confirmarSubidaInconformidad(4, 55, 99)).toEqual({ ok: false, error: "ARCHIVO_NO_ES_TUYO" });
  });
});

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

describe("estadoRestriccionEvaluador", () => {
  it("regresa restringido:false si evaluadorCuentaExpiraEn es null (cuenta normal)", async () => {
    const { tx } = makeTxRecorder([[{ evaluadorCuentaExpiraEn: null }]], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { estadoRestriccionEvaluador } = await import("./db");
    const resultado = await estadoRestriccionEvaluador(1);
    expect(resultado).toEqual({ restringido: false });
  });

  it("regresa restringido:false si evaluadorCuentaExpiraEn ya paso (cuenta ya deberia estar desactivada, pero por si el worker no ha corrido)", async () => {
    const yaVencido = new Date(Date.now() - 1000 * 60 * 60);
    const { tx } = makeTxRecorder([[{ evaluadorCuentaExpiraEn: yaVencido }]], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { estadoRestriccionEvaluador } = await import("./db");
    const resultado = await estadoRestriccionEvaluador(1);
    expect(resultado).toEqual({ restringido: false });
  });

  it("regresa restringido:true si evaluadorCuentaExpiraEn sigue vigente", async () => {
    const vigente = new Date(Date.now() + 1000 * 60 * 60 * 24);
    const { tx } = makeTxRecorder([[{ evaluadorCuentaExpiraEn: vigente }]], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { estadoRestriccionEvaluador } = await import("./db");
    const resultado = await estadoRestriccionEvaluador(1);
    expect(resultado).toEqual({ restringido: true });
  });
});

import { vi, describe, it, expect, beforeEach } from "vitest";
import { makeTxRecorder } from "./db.transaction-test-helpers";

vi.mock("mysql2/promise", () => ({ default: { createPool: vi.fn(() => ({})) } }));
vi.mock("drizzle-orm/mysql2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return { ...actual, drizzle: vi.fn() };
});
vi.mock("./auth", () => ({
  generarPasswordTemporal: vi.fn(() => "PASSTEMP12AB"),
  hashPassword: vi.fn(async () => "hash-simulado"),
}));

beforeEach(() => {
  vi.resetModules();
});

describe("asignarEvaluador", () => {
  it("si ya tiene cuenta REAL (evaluadorCuentaExpiraEn null): solo actualiza el correo, nunca toca expiracion/isActive", async () => {
    const { tx, calls, setCalls } = makeTxRecorder([[{ id: 12, evaluadorCuentaExpiraEn: null }]], [{ insertId: 0 }]);
    const fakeDb = {};
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { asignarEvaluador } = await import("./db");
    const resultado = await asignarEvaluador(tx, "AAAA000101HDFXXX01", "Ana Lopez", "persona@example.com");
    expect(resultado).toEqual({ userId: 12, passwordTemporalEnClaro: null });
    expect(calls).toEqual(["select", "update"]);
    expect(setCalls[0]).toEqual({ email: "persona@example.com" });
  });

  it("si ya tiene cuenta ON-THE-FLY (evaluadorCuentaExpiraEn no null, ej. ya vencida): refresca expiracion 3 dias habiles y reactiva, en el mismo update", async () => {
    const expiroHaceRato = new Date("2020-01-01T00:00:00.000Z");
    const { tx, calls, setCalls } = makeTxRecorder([[{ id: 12, evaluadorCuentaExpiraEn: expiroHaceRato }]], [{ insertId: 0 }]);
    const fakeDb = {};
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { asignarEvaluador } = await import("./db");
    const antes = Date.now();
    const resultado = await asignarEvaluador(tx, "AAAA000101HDFXXX01", "Ana Lopez", "persona@example.com");
    expect(resultado).toEqual({ userId: 12, passwordTemporalEnClaro: null });
    expect(calls).toEqual(["select", "update"]);
    expect(setCalls[0].email).toBe("persona@example.com");
    expect(setCalls[0].isActive).toBe(true);
    expect(setCalls[0].evaluadorCuentaExpiraEn).toBeInstanceOf(Date);
    expect(setCalls[0].evaluadorCuentaExpiraEn.getTime()).toBeGreaterThan(antes);
  });

  it("si NO tiene cuenta: crea usuario con password temporal (única, no forzada a cambiar), sin tocar servidores_publicos", async () => {
    const { tx, calls } = makeTxRecorder([[]], [{ insertId: 77 }]);
    const fakeDb = {};
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { asignarEvaluador } = await import("./db");
    const resultado = await asignarEvaluador(tx, "BBBB000101HDFXXX02", "Beto Ruiz", "beto@example.com");
    expect(resultado).toEqual({ userId: 77, passwordTemporalEnClaro: "PASSTEMP12AB" });
    // Solo select + insert -- YA NO hay un segundo update a servidores_publicos
    // (esa tabla ni se toca en este flujo desde el rediseño 2026-09-26).
    expect(calls).toEqual(["select", "insert"]);
  });

  it("cuenta nueva usa el nombre/curp que vienen del pool, no de un lookup a servidores_publicos", async () => {
    const { tx, calls } = makeTxRecorder([[]], [{ insertId: 55 }]);
    const fakeDb = { select: tx.select, insert: tx.insert, update: tx.update };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { asignarEvaluador } = await import("./db");
    const resultado = await asignarEvaluador(tx as any, "TEST900101HDFRRR01", "Prueba Uno", "nuevo@ejemplo.com");

    expect(resultado.userId).toBe(55);
    expect(resultado.passwordTemporalEnClaro).not.toBeNull();
    expect(calls).toEqual(["select", "insert"]);
  });
});

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

describe("miAutoevaluacion", () => {
  it("regresa sin_promocion si el trabajador no tiene promocion confirmada", async () => {
    const { tx } = makeTxRecorder([[]], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { miAutoevaluacion } = await import("./db");
    const resultado = await miAutoevaluacion(1);
    expect(resultado).toEqual({ estado: "sin_promocion" });
  });

  it("regresa no_iniciada si tiene promocion pero no autoevaluacion todavia", async () => {
    const { tx } = makeTxRecorder([[{ id: 100 }], []], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { miAutoevaluacion } = await import("./db");
    const resultado = await miAutoevaluacion(1);
    expect(resultado).toEqual({ estado: "no_iniciada" });
  });

  it("regresa borrador con las preguntas sorteadas si ya inicio pero no ha enviado", async () => {
    const filaAutoevaluacion = { id: 5, estado: "borrador", puntaje: null, enviadoAt: null };
    const preguntas = [
      { preguntaId: 1, texto: "Pregunta 1", respuestaElegida: null },
      { preguntaId: 2, texto: "Pregunta 2", respuestaElegida: "siempre" },
    ];
    const { tx } = makeTxRecorder([[{ id: 100 }], [filaAutoevaluacion], preguntas], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { miAutoevaluacion } = await import("./db");
    const resultado = await miAutoevaluacion(1);
    expect(resultado).toEqual({ estado: "borrador", preguntas });
  });

  it("regresa enviado con el puntaje si ya se envio", async () => {
    const enviadoAt = new Date("2026-09-21T10:00:00Z");
    const filaAutoevaluacion = { id: 5, estado: "enviado", puntaje: 20, enviadoAt };
    const { tx } = makeTxRecorder([[{ id: 100 }], [filaAutoevaluacion]], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { miAutoevaluacion } = await import("./db");
    const resultado = await miAutoevaluacion(1);
    expect(resultado).toEqual({ estado: "enviado", puntaje: 20, enviadoAt });
  });
});

describe("iniciarAutoevaluacion", () => {
  it("regresa SIN_PROMOCION si el trabajador no tiene promocion confirmada", async () => {
    const { tx } = makeTxRecorder([[]], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { iniciarAutoevaluacion } = await import("./db");
    const resultado = await iniciarAutoevaluacion(1);
    expect(resultado).toEqual({ ok: false, error: "SIN_PROMOCION" });
  });

  it("sortea 28 preguntas, inserta la autoevaluacion y las 28 respuestas en blanco, todo en una transaccion", async () => {
    const idsBanco = Array.from({ length: 60 }, (_, i) => ({ id: i + 1 }));
    const { tx, calls } = makeTxRecorder([[{ id: 100 }], idsBanco], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { iniciarAutoevaluacion } = await import("./db");
    const resultado = await iniciarAutoevaluacion(1);

    expect(resultado).toEqual({ ok: true });
    expect(fakeDb.transaction).toHaveBeenCalledTimes(1);
    // select promocionId, select ids del banco, insert autoevaluaciones, insert respuestas
    expect(calls).toEqual(["select", "select", "insert", "insert"]);
  });

  it("regresa YA_INICIADA si ya existe una autoevaluacion para esa promocion (ER_DUP_ENTRY)", async () => {
    const idsBanco = Array.from({ length: 60 }, (_, i) => ({ id: i + 1 }));
    const { tx } = makeTxRecorder([[{ id: 100 }], idsBanco], []);
    tx.insert = vi.fn(() => {
      throw Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY" });
    });
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { iniciarAutoevaluacion } = await import("./db");
    const resultado = await iniciarAutoevaluacion(1);
    expect(resultado).toEqual({ ok: false, error: "YA_INICIADA" });
  });

  it("regresa BANCO_INSUFICIENTE sin insertar nada si el banco activo tiene menos de 28 preguntas", async () => {
    const idsBanco = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }));
    const { tx, calls } = makeTxRecorder([[{ id: 100 }], idsBanco], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { iniciarAutoevaluacion } = await import("./db");
    const resultado = await iniciarAutoevaluacion(1);
    expect(resultado).toEqual({ ok: false, error: "BANCO_INSUFICIENTE" });
    expect(calls).not.toContain("insert");
  });

  it("regresa BANCO_INSUFICIENTE sin insertar nada si el banco activo esta vacio", async () => {
    const { tx, calls } = makeTxRecorder([[{ id: 100 }], []], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { iniciarAutoevaluacion } = await import("./db");
    const resultado = await iniciarAutoevaluacion(1);
    expect(resultado).toEqual({ ok: false, error: "BANCO_INSUFICIENTE" });
    expect(calls).not.toContain("insert");
  });
});

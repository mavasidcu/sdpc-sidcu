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

describe("listarMisEvaluacionesPendientes", () => {
  it("regresa vacio si no tiene evaluaciones pendientes", async () => {
    const { tx } = makeTxRecorder([[]], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { listarMisEvaluacionesPendientes } = await import("./db");
    const resultado = await listarMisEvaluacionesPendientes(1);
    expect(resultado).toEqual([]);
  });

  it("regresa las evaluaciones en borrador con nombre de a quien evalua", async () => {
    const filas = [
      { evaluacionId: 5, rol: "jefe", nombreEvaluado: "Diego Torres Vega", fechaLimite: null },
    ];
    const { tx } = makeTxRecorder([filas], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { listarMisEvaluacionesPendientes } = await import("./db");
    const resultado = await listarMisEvaluacionesPendientes(1);
    expect(resultado).toEqual(filas);
  });
});

describe("miEvaluacion", () => {
  it("regresa no_encontrada si el id de evaluacion no existe", async () => {
    const { tx } = makeTxRecorder([[]], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { miEvaluacion } = await import("./db");
    const resultado = await miEvaluacion(1, 999);
    expect(resultado).toEqual({ estado: "no_encontrada" });
  });

  it("regresa ajena si la evaluacion existe pero no es del userId que pregunta", async () => {
    const fila = { id: 5, evaluadorUserId: 999, estado: "borrador", nombreEvaluado: "Diego" };
    const { tx } = makeTxRecorder([[fila]], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { miEvaluacion } = await import("./db");
    const resultado = await miEvaluacion(1, 5);
    expect(resultado).toEqual({ estado: "ajena" });
  });

  it("regresa borrador con las preguntas sorteadas si ya inicio pero no ha enviado", async () => {
    const fila = { id: 5, evaluadorUserId: 1, estado: "borrador", nombreEvaluado: "Diego" };
    const preguntas = [
      { preguntaId: 1, texto: "Pregunta 1", respuestaElegida: null },
    ];
    const { tx } = makeTxRecorder([[fila], preguntas], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { miEvaluacion } = await import("./db");
    const resultado = await miEvaluacion(1, 5);
    expect(resultado).toEqual({ estado: "borrador", nombreEvaluado: "Diego", preguntas });
  });

  it("regresa enviado SIN preguntas ni puntaje -- el evaluador nunca los ve", async () => {
    const fila = { id: 5, evaluadorUserId: 1, estado: "enviado", nombreEvaluado: "Diego" };
    const { tx } = makeTxRecorder([[fila]], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { miEvaluacion } = await import("./db");
    const resultado = await miEvaluacion(1, 5);
    expect(resultado).toEqual({ estado: "enviado" });
  });
});

describe("iniciarEvaluacion", () => {
  it("regresa NO_ENCONTRADA si el id no existe", async () => {
    const { tx } = makeTxRecorder([[]], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { iniciarEvaluacion } = await import("./db");
    const resultado = await iniciarEvaluacion(1, 999);
    expect(resultado).toEqual({ ok: false, error: "NO_ENCONTRADA" });
  });

  it("regresa AJENA si la evaluacion no pertenece a este userId", async () => {
    const fila = { id: 5, evaluadorUserId: 999, rol: "jefe" };
    const { tx } = makeTxRecorder([[fila]], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { iniciarEvaluacion } = await import("./db");
    const resultado = await iniciarEvaluacion(1, 5);
    expect(resultado).toEqual({ ok: false, error: "AJENA" });
  });

  it("regresa BANCO_INSUFICIENTE si el banco activo de ese rol tiene menos de 14 preguntas", async () => {
    const fila = { id: 5, evaluadorUserId: 1, rol: "jefe" };
    const bancoCorto = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }));
    const { tx } = makeTxRecorder([[fila], bancoCorto], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { iniciarEvaluacion } = await import("./db");
    const resultado = await iniciarEvaluacion(1, 5);
    expect(resultado).toEqual({ ok: false, error: "BANCO_INSUFICIENTE" });
  });

  it("sortea 14 preguntas del banco del rol correcto, inserta evaluacion en curso y 14 respuestas en blanco", async () => {
    const fila = { id: 5, evaluadorUserId: 1, rol: "companero" };
    const banco = Array.from({ length: 60 }, (_, i) => ({ id: i + 1 }));
    const { tx, calls } = makeTxRecorder([[fila], banco], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { iniciarEvaluacion } = await import("./db");
    const resultado = await iniciarEvaluacion(1, 5);

    expect(resultado).toEqual({ ok: true });
    expect(calls).toEqual(["select", "select", "insert"]);
  });

  it("regresa YA_INICIADA si ya existen respuestas para esa evaluacion (ER_DUP_ENTRY)", async () => {
    const fila = { id: 5, evaluadorUserId: 1, rol: "jefe" };
    const banco = Array.from({ length: 60 }, (_, i) => ({ id: i + 1 }));
    const { tx } = makeTxRecorder([[fila], banco], []);
    tx.insert = vi.fn(() => {
      throw Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY" });
    });
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { iniciarEvaluacion } = await import("./db");
    const resultado = await iniciarEvaluacion(1, 5);
    expect(resultado).toEqual({ ok: false, error: "YA_INICIADA" });
  });
});

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

describe("importarFilaPreguntaEvaluador", () => {
  it("rechaza texto vacio sin llegar a la DB", async () => {
    const { importarFilaPreguntaEvaluador } = await import("./db");
    const resultado = await importarFilaPreguntaEvaluador("jefe", "   ", "siempre");
    expect(resultado).toEqual({ ok: false, error: "Falta el texto de la pregunta" });
  });

  it("rechaza una respuesta_correcta que no sea una opcion Likert valida", async () => {
    const { importarFilaPreguntaEvaluador } = await import("./db");
    const resultado = await importarFilaPreguntaEvaluador("companero", "¿Colabora en equipo?", "tal vez");
    expect(resultado).toEqual({ ok: false, error: 'respuesta_correcta inválida: "tal vez" (usa siempre/frecuente/algunas_veces/nunca)' });
  });

  it("inserta con el rol correcto (jefe)", async () => {
    const { tx, calls } = makeTxRecorder([], []);
    const fakeDb = { insert: tx.insert };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { importarFilaPreguntaEvaluador } = await import("./db");
    const resultado = await importarFilaPreguntaEvaluador("jefe", "¿Delega tareas con claridad?", " Frecuente ");
    expect(resultado).toEqual({ ok: true });
    expect(calls).toEqual(["insert"]);
  });

  it("inserta con el rol correcto (companero)", async () => {
    const { tx, calls } = makeTxRecorder([], []);
    const fakeDb = { insert: tx.insert };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { importarFilaPreguntaEvaluador } = await import("./db");
    const resultado = await importarFilaPreguntaEvaluador("companero", "¿Comparte información relevante?", "nunca");
    expect(resultado).toEqual({ ok: true });
    expect(calls).toEqual(["insert"]);
  });
});

describe("contarPreguntasActivasEvaluador", () => {
  it("regresa el conteo de preguntas activas del rol pedido", async () => {
    const { tx } = makeTxRecorder([[{ count: 60 }]], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { contarPreguntasActivasEvaluador } = await import("./db");
    const resultado = await contarPreguntasActivasEvaluador("jefe");
    expect(resultado).toBe(60);
  });
});

describe("listarPreguntasEvaluador", () => {
  it("regresa las preguntas del rol pedido (activas e inactivas) ordenadas por id", async () => {
    const filas = [
      { id: 1, texto: "¿Delega tareas con claridad?", respuestaCorrecta: "siempre", activo: true },
      { id: 2, texto: "¿Da seguimiento poco claro?", respuestaCorrecta: "nunca", activo: false },
    ];
    const { tx } = makeTxRecorder([filas], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { listarPreguntasEvaluador } = await import("./db");
    const resultado = await listarPreguntasEvaluador("jefe");
    expect(resultado).toEqual(filas);
  });
});

describe("actualizarPreguntaEvaluador", () => {
  it("rechaza texto vacio sin llegar a la DB", async () => {
    const { tx } = makeTxRecorder([], []);
    const fakeDb = { update: tx.update };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { actualizarPreguntaEvaluador } = await import("./db");
    const resultado = await actualizarPreguntaEvaluador(1, "   ", "siempre", true);
    expect(resultado).toEqual({ ok: false, error: "Falta el texto de la pregunta" });
  });

  it("rechaza una respuestaCorrecta que no sea una opcion Likert valida", async () => {
    const { actualizarPreguntaEvaluador } = await import("./db");
    const resultado = await actualizarPreguntaEvaluador(1, "¿Delega tareas con claridad?", "tal vez" as any, true);
    expect(resultado).toEqual({ ok: false, error: 'respuesta_correcta inválida: "tal vez" (usa siempre/frecuente/algunas_veces/nunca)' });
  });

  it("actualiza texto, respuesta correcta y activo", async () => {
    const { tx, setCalls } = makeTxRecorder([], []);
    const fakeDb = { update: tx.update };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { actualizarPreguntaEvaluador } = await import("./db");
    const resultado = await actualizarPreguntaEvaluador(1, "¿Delega tareas con claridad?", "siempre", false);
    expect(resultado).toEqual({ ok: true });
    expect(setCalls).toEqual([{ texto: "¿Delega tareas con claridad?", respuestaCorrecta: "siempre", activo: false }]);
  });
});

describe("eliminarPreguntaEvaluador", () => {
  it("elimina la pregunta si nadie la ha usado", async () => {
    const { tx, calls } = makeTxRecorder([], []);
    const fakeDb = { delete: tx.delete };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { eliminarPreguntaEvaluador } = await import("./db");
    const resultado = await eliminarPreguntaEvaluador(1);
    expect(resultado).toEqual({ ok: true });
    expect(calls).toEqual(["delete"]);
  });

  it("regresa EN_USO si la pregunta ya fue sorteada (FK restrict bloquea el DELETE)", async () => {
    const fakeDb = {
      delete: () => {
        throw Object.assign(new Error("Cannot delete or update a parent row"), { code: "ER_ROW_IS_REFERENCED_2" });
      },
    };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { eliminarPreguntaEvaluador } = await import("./db");
    const resultado = await eliminarPreguntaEvaluador(1);
    expect(resultado).toEqual({ ok: false, error: "EN_USO" });
  });
});

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

describe("importarFilaPreguntaAutoevaluacion", () => {
  it("rechaza texto vacio sin llegar a la DB", async () => {
    const { tx } = makeTxRecorder([], []);
    const fakeDb = { insert: tx.insert };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { importarFilaPreguntaAutoevaluacion } = await import("./db");
    const resultado = await importarFilaPreguntaAutoevaluacion("   ", "siempre");
    expect(resultado).toEqual({ ok: false, error: "Falta el texto de la pregunta" });
  });

  it("rechaza una respuesta_correcta que no sea una opcion Likert valida", async () => {
    const { importarFilaPreguntaAutoevaluacion } = await import("./db");
    const resultado = await importarFilaPreguntaAutoevaluacion("¿Llegas puntual?", "tal vez");
    expect(resultado).toEqual({ ok: false, error: 'respuesta_correcta inválida: "tal vez" (usa siempre/frecuente/algunas_veces/nunca)' });
  });

  it("normaliza mayusculas/espacios de la columna correcta e inserta", async () => {
    const { tx, calls } = makeTxRecorder([], []);
    const fakeDb = { insert: tx.insert };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { importarFilaPreguntaAutoevaluacion } = await import("./db");
    const resultado = await importarFilaPreguntaAutoevaluacion("¿Llegas puntual?", " Algunas Veces ");
    expect(resultado).toEqual({ ok: true });
    expect(calls).toEqual(["insert"]);
  });
});

describe("contarPreguntasActivasAutoevaluacion", () => {
  it("regresa el conteo de preguntas activas", async () => {
    const { tx } = makeTxRecorder([[{ count: 45 }]], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { contarPreguntasActivasAutoevaluacion } = await import("./db");
    const resultado = await contarPreguntasActivasAutoevaluacion();
    expect(resultado).toBe(45);
  });
});

describe("listarPreguntasAutoevaluacion", () => {
  it("regresa todas las preguntas (activas e inactivas) ordenadas por id", async () => {
    const filas = [
      { id: 1, texto: "¿Llegas puntual?", respuestaCorrecta: "siempre", activo: true },
      { id: 2, texto: "¿Atiendes con descortesía?", respuestaCorrecta: "nunca", activo: false },
    ];
    const { tx } = makeTxRecorder([filas], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { listarPreguntasAutoevaluacion } = await import("./db");
    const resultado = await listarPreguntasAutoevaluacion();
    expect(resultado).toEqual(filas);
  });
});

describe("actualizarPreguntaAutoevaluacion", () => {
  it("rechaza texto vacio sin llegar a la DB", async () => {
    const { tx } = makeTxRecorder([], []);
    const fakeDb = { update: tx.update };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { actualizarPreguntaAutoevaluacion } = await import("./db");
    const resultado = await actualizarPreguntaAutoevaluacion(1, "   ", "siempre", true);
    expect(resultado).toEqual({ ok: false, error: "Falta el texto de la pregunta" });
  });

  it("rechaza una respuestaCorrecta que no sea una opcion Likert valida", async () => {
    const { actualizarPreguntaAutoevaluacion } = await import("./db");
    const resultado = await actualizarPreguntaAutoevaluacion(1, "¿Llegas puntual?", "tal vez" as any, true);
    expect(resultado).toEqual({ ok: false, error: 'respuesta_correcta inválida: "tal vez" (usa siempre/frecuente/algunas_veces/nunca)' });
  });

  it("actualiza texto, respuesta correcta y activo", async () => {
    const { tx, setCalls } = makeTxRecorder([], []);
    const fakeDb = { update: tx.update };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { actualizarPreguntaAutoevaluacion } = await import("./db");
    const resultado = await actualizarPreguntaAutoevaluacion(1, "¿Llegas puntual?", "siempre", false);
    expect(resultado).toEqual({ ok: true });
    expect(setCalls).toEqual([{ texto: "¿Llegas puntual?", respuestaCorrecta: "siempre", activo: false }]);
  });
});

describe("eliminarPreguntaAutoevaluacion", () => {
  it("elimina la pregunta si nadie la ha usado", async () => {
    const { tx, calls } = makeTxRecorder([], []);
    const fakeDb = { delete: tx.delete };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { eliminarPreguntaAutoevaluacion } = await import("./db");
    const resultado = await eliminarPreguntaAutoevaluacion(1);
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

    const { eliminarPreguntaAutoevaluacion } = await import("./db");
    const resultado = await eliminarPreguntaAutoevaluacion(1);
    expect(resultado).toEqual({ ok: false, error: "EN_USO" });
  });
});

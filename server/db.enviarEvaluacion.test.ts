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

const respuestasValidas = (aciertos: number) => [
  { preguntaId: 1, respuestaElegida: aciertos >= 1 ? "siempre" as const : "nunca" as const },
  { preguntaId: 2, respuestaElegida: aciertos >= 2 ? "nunca" as const : "siempre" as const },
];

describe("enviarEvaluacion", () => {
  it("regresa NO_ENCONTRADA si el id de evaluacion no existe", async () => {
    const { tx } = makeTxRecorder([[]], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { enviarEvaluacion } = await import("./db");
    const resultado = await enviarEvaluacion(1, 999, respuestasValidas(2));
    expect(resultado).toEqual({ ok: false, error: "NO_ENCONTRADA" });
  });

  it("regresa AJENA si la evaluacion no es de este userId", async () => {
    const fila = { id: 5, evaluadorUserId: 999, rol: "jefe", estado: "borrador" };
    const { tx } = makeTxRecorder([[fila]], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { enviarEvaluacion } = await import("./db");
    const resultado = await enviarEvaluacion(1, 5, respuestasValidas(2));
    expect(resultado).toEqual({ ok: false, error: "AJENA" });
  });

  it("regresa YA_ENVIADA si el estado ya no es borrador", async () => {
    const fila = { id: 5, evaluadorUserId: 1, rol: "jefe", estado: "enviado" };
    const { tx } = makeTxRecorder([[fila]], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { enviarEvaluacion } = await import("./db");
    const resultado = await enviarEvaluacion(1, 5, respuestasValidas(2));
    expect(resultado).toEqual({ ok: false, error: "YA_ENVIADA" });
  });

  it("regresa RESPUESTAS_INVALIDAS si el largo no coincide con el sorteo guardado (padding attack)", async () => {
    const fila = { id: 5, evaluadorUserId: 1, rol: "jefe", estado: "borrador" };
    const asignadas = [
      { preguntaId: 1, respuestaCorrecta: "siempre" },
      { preguntaId: 2, respuestaCorrecta: "nunca" },
    ];
    const { tx } = makeTxRecorder([[fila], asignadas], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { enviarEvaluacion } = await import("./db");
    // manda 3 respuestas para 2 preguntas asignadas -- length no coincide
    const resultado = await enviarEvaluacion(1, 5, [
      ...respuestasValidas(2),
      { preguntaId: 1, respuestaElegida: "siempre" },
    ]);
    expect(resultado).toEqual({ ok: false, error: "RESPUESTAS_INVALIDAS" });
  });

  it("regresa RESPUESTAS_INVALIDAS si el set de preguntaId no coincide con el sorteo guardado", async () => {
    const fila = { id: 5, evaluadorUserId: 1, rol: "jefe", estado: "borrador" };
    const asignadas = [
      { preguntaId: 1, respuestaCorrecta: "siempre" },
      { preguntaId: 2, respuestaCorrecta: "nunca" },
    ];
    const { tx } = makeTxRecorder([[fila], asignadas], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { enviarEvaluacion } = await import("./db");
    const resultado = await enviarEvaluacion(1, 5, [
      { preguntaId: 1, respuestaElegida: "siempre" },
      { preguntaId: 999, respuestaElegida: "nunca" },
    ]);
    expect(resultado).toEqual({ ok: false, error: "RESPUESTAS_INVALIDAS" });
  });

  it("rol jefe: califica con calcularPuntajeEvaluadorJefe y no regresa puntaje al llamador", async () => {
    const fila = { id: 5, evaluadorUserId: 1, rol: "jefe", estado: "borrador" };
    const asignadas = [
      { preguntaId: 1, respuestaCorrecta: "siempre" },
      { preguntaId: 2, respuestaCorrecta: "nunca" },
    ];
    const { tx, calls, setCalls } = makeTxRecorder([[fila], asignadas], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { enviarEvaluacion, calcularPuntajeEvaluadorJefe } = await import("./db");
    const resultado = await enviarEvaluacion(1, 5, respuestasValidas(2));

    expect(resultado).toEqual({ ok: true });
    expect(fakeDb.transaction).toHaveBeenCalledTimes(1);
    // select evaluacion, select asignadas, 2x update respuesta, update evaluacion, insert auditoria
    expect(calls).toEqual(["select", "select", "update", "update", "update", "insert"]);
    // setCalls: 2x .set() de las respuestas + 1x .set() del update final sobre
    // schema.evaluaciones (el ultimo) -- ese ultimo es el que trae puntajeFinal.
    const setEvaluacion = setCalls[setCalls.length - 1];
    expect(setEvaluacion.puntajeFinal).toBe(calcularPuntajeEvaluadorJefe(2));
    expect(setEvaluacion.puntajeFinal).toBe(2);
  });

  it("rol companero2 usa la misma formula que companero1 (calcularPuntajeEvaluadorCompaniero)", async () => {
    const fila = { id: 5, evaluadorUserId: 1, rol: "companero2", estado: "borrador" };
    const asignadas = [
      { preguntaId: 1, respuestaCorrecta: "siempre" },
      { preguntaId: 2, respuestaCorrecta: "nunca" },
    ];
    const { tx, setCalls } = makeTxRecorder([[fila], asignadas], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { enviarEvaluacion, calcularPuntajeEvaluadorCompaniero, calcularPuntajeEvaluadorJefe } = await import("./db");
    const resultado = await enviarEvaluacion(1, 5, respuestasValidas(2));
    expect(resultado).toEqual({ ok: true });

    const setEvaluacion = setCalls[setCalls.length - 1];
    expect(setEvaluacion.puntajeFinal).toBeCloseTo(calcularPuntajeEvaluadorCompaniero(2), 5);
    expect(setEvaluacion.puntajeFinal).toBeCloseTo(2 * (6 / 14), 5);
    // prueba que el dispatch por rol realmente cambia de formula: si alguien
    // por error usara calcularPuntajeEvaluadorJefe para companero2, este
    // valor seria 2 (distinto de ~0.857) y la asercion de arriba fallaria.
    expect(setEvaluacion.puntajeFinal).not.toBe(calcularPuntajeEvaluadorJefe(2));
  });
});

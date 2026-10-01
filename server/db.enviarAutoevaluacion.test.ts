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

const respuestasValidas = (aciertos: number) => {
  // 2 preguntas asignadas: la 1 correcta="siempre", la 2 correcta="nunca".
  // `aciertos` controla cuantas coinciden.
  return [
    { preguntaId: 1, respuestaElegida: aciertos >= 1 ? "siempre" as const : "nunca" as const },
    { preguntaId: 2, respuestaElegida: aciertos >= 2 ? "nunca" as const : "siempre" as const },
  ];
};

describe("enviarAutoevaluacion", () => {
  it("regresa NO_INICIADA si el trabajador no tiene autoevaluacion en curso", async () => {
    const { tx } = makeTxRecorder([[]], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { enviarAutoevaluacion } = await import("./db");
    const resultado = await enviarAutoevaluacion(1, respuestasValidas(2));
    expect(resultado).toEqual({ ok: false, error: "NO_INICIADA" });
  });

  it("regresa YA_ENVIADA si el estado ya no es borrador", async () => {
    const autoevaluacion = { id: 5, estado: "enviado" };
    const { tx } = makeTxRecorder([[autoevaluacion]], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { enviarAutoevaluacion } = await import("./db");
    const resultado = await enviarAutoevaluacion(1, respuestasValidas(2));
    expect(resultado).toEqual({ ok: false, error: "YA_ENVIADA" });
  });

  it("regresa RESPUESTAS_INVALIDAS si el set de preguntaId no coincide con el sorteo guardado", async () => {
    const autoevaluacion = { id: 5, estado: "borrador" };
    const asignadas = [
      { preguntaId: 1, respuestaCorrecta: "siempre" },
      { preguntaId: 2, respuestaCorrecta: "nunca" },
    ];
    const { tx } = makeTxRecorder([[autoevaluacion], asignadas], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { enviarAutoevaluacion } = await import("./db");
    // manda preguntaId=999, que no esta en el sorteo guardado (1 y 2)
    const resultado = await enviarAutoevaluacion(1, [
      { preguntaId: 1, respuestaElegida: "siempre" },
      { preguntaId: 999, respuestaElegida: "nunca" },
    ]);
    expect(resultado).toEqual({ ok: false, error: "RESPUESTAS_INVALIDAS" });
  });

  it("regresa RESPUESTAS_INVALIDAS si el arreglo trae un preguntaId real duplicado (padding para inflar aciertos)", async () => {
    const autoevaluacion = { id: 5, estado: "borrador" };
    const asignadas = [
      { preguntaId: 1, respuestaCorrecta: "siempre" },
      { preguntaId: 2, respuestaCorrecta: "nunca" },
    ];
    const { tx } = makeTxRecorder([[autoevaluacion], asignadas], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { enviarAutoevaluacion } = await import("./db");
    // trae los 2 preguntaId reales (1 y 2), pero repite el 1 -- el Set de ids
    // coincidiria (mismo tamano/contenido), pero el arreglo es mas largo que
    // el sorteo guardado.
    const resultado = await enviarAutoevaluacion(1, [
      { preguntaId: 1, respuestaElegida: "siempre" },
      { preguntaId: 1, respuestaElegida: "siempre" },
      { preguntaId: 2, respuestaElegida: "nunca" },
    ]);
    expect(resultado).toEqual({ ok: false, error: "RESPUESTAS_INVALIDAS" });
  });

  it("califica correctamente, guarda el puntaje y marca enviado -- todo en una transaccion", async () => {
    const autoevaluacion = { id: 5, estado: "borrador" };
    const asignadas = [
      { preguntaId: 1, respuestaCorrecta: "siempre" },
      { preguntaId: 2, respuestaCorrecta: "nunca" },
    ];
    const { tx, calls } = makeTxRecorder([[autoevaluacion], asignadas], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { enviarAutoevaluacion } = await import("./db");
    // 2 aciertos: pregunta 1 responde "siempre" (correcta), pregunta 2 responde "nunca" (correcta)
    // Formula confirmada 2026-09-22: cada acierto vale 0.5 puntos.
    const resultado = await enviarAutoevaluacion(1, respuestasValidas(2));

    expect(resultado).toEqual({ ok: true, puntaje: 1 });
    expect(fakeDb.transaction).toHaveBeenCalledTimes(1);
    // select autoevaluacion, select asignadas, 2x update respuesta, update autoevaluacion, insert auditoria
    expect(calls).toEqual(["select", "select", "update", "update", "update", "insert"]);
  });
});

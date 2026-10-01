import { describe, it, expect } from "vitest";

describe("sortearPreguntasAutoevaluacion (funcion pura, sin DB)", () => {
  it("regresa exactamente `cantidad` ids, todos distintos", async () => {
    const { sortearPreguntasAutoevaluacion } = await import("./db");
    const disponibles = Array.from({ length: 60 }, (_, i) => i + 1);
    const resultado = sortearPreguntasAutoevaluacion(disponibles, 28);
    expect(resultado).toHaveLength(28);
    expect(new Set(resultado).size).toBe(28);
  });

  it("todos los ids sorteados vienen del set disponible", async () => {
    const { sortearPreguntasAutoevaluacion } = await import("./db");
    const disponibles = [10, 20, 30, 40, 50];
    const resultado = sortearPreguntasAutoevaluacion(disponibles, 3);
    for (const id of resultado) {
      expect(disponibles).toContain(id);
    }
  });

  it("si cantidad >= disponibles, regresa todos (sin duplicar ni tronar)", async () => {
    const { sortearPreguntasAutoevaluacion } = await import("./db");
    const disponibles = [1, 2, 3];
    const resultado = sortearPreguntasAutoevaluacion(disponibles, 28);
    expect(resultado).toHaveLength(3);
    expect(new Set(resultado)).toEqual(new Set([1, 2, 3]));
  });

  it("no muta el array de entrada", async () => {
    const { sortearPreguntasAutoevaluacion } = await import("./db");
    const disponibles = [1, 2, 3, 4, 5];
    const copiaOriginal = [...disponibles];
    sortearPreguntasAutoevaluacion(disponibles, 3);
    expect(disponibles).toEqual(copiaOriginal);
  });
});

describe("calcularPuntajeAutoevaluacion (funcion pura, sin DB)", () => {
  // Formula confirmada por el cliente 2026-09-22: 28 preguntas, si todas
  // correctas = 14 puntos -- cada acierto vale medio punto (no 1 como se
  // asumia antes de esta confirmacion).
  it("cada acierto vale 0.5 puntos, maximo 14 con las 28 correctas", async () => {
    const { calcularPuntajeAutoevaluacion } = await import("./db");
    expect(calcularPuntajeAutoevaluacion(0)).toBe(0);
    expect(calcularPuntajeAutoevaluacion(1)).toBe(0.5);
    expect(calcularPuntajeAutoevaluacion(14)).toBe(7);
    expect(calcularPuntajeAutoevaluacion(27)).toBe(13.5);
    expect(calcularPuntajeAutoevaluacion(28)).toBe(14);
  });
});

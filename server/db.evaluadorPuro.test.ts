import { describe, it, expect } from "vitest";

describe("calcularPuntajeEvaluadorJefe (funcion pura, sin DB)", () => {
  it("1 punto por acierto, maximo 14 con los 14 correctos -- formula confirmada por el cliente 2026-09-22", async () => {
    const { calcularPuntajeEvaluadorJefe } = await import("./db");
    expect(calcularPuntajeEvaluadorJefe(0)).toBe(0);
    expect(calcularPuntajeEvaluadorJefe(7)).toBe(7);
    expect(calcularPuntajeEvaluadorJefe(14)).toBe(14);
  });
});

describe("calcularPuntajeEvaluadorCompaniero (funcion pura, sin DB)", () => {
  it("6/14 de punto por acierto, maximo 6 con los 14 correctos -- formula confirmada por el cliente 2026-09-22", async () => {
    const { calcularPuntajeEvaluadorCompaniero } = await import("./db");
    expect(calcularPuntajeEvaluadorCompaniero(0)).toBe(0);
    expect(calcularPuntajeEvaluadorCompaniero(7)).toBeCloseTo(3, 5);
    expect(calcularPuntajeEvaluadorCompaniero(14)).toBeCloseTo(6, 5);
  });
});

describe("calcularExpiracion3DiasHabiles (funcion pura, sin DB)", () => {
  it("lunes + 3 dias habiles = jueves (sin cruzar fin de semana)", async () => {
    const { calcularExpiracion3DiasHabiles } = await import("./db");
    const lunes = new Date("2026-09-21T10:00:00.000Z"); // lunes
    const resultado = calcularExpiracion3DiasHabiles(lunes);
    expect(resultado.toISOString()).toBe("2026-09-24T10:00:00.000Z"); // jueves
  });

  it("jueves + 3 dias habiles cruza el fin de semana = martes siguiente", async () => {
    const { calcularExpiracion3DiasHabiles } = await import("./db");
    const jueves = new Date("2026-09-24T10:00:00.000Z"); // jueves
    const resultado = calcularExpiracion3DiasHabiles(jueves);
    expect(resultado.toISOString()).toBe("2026-09-29T10:00:00.000Z"); // martes siguiente (viernes, sabado y domingo no cuentan como habiles añadidos, pero el dia de salida jueves tampoco cuenta -- viernes=1, lunes=2, martes=3)
  });

  it("viernes + 3 dias habiles = miercoles siguiente", async () => {
    const { calcularExpiracion3DiasHabiles } = await import("./db");
    const viernes = new Date("2026-09-25T10:00:00.000Z"); // viernes
    const resultado = calcularExpiracion3DiasHabiles(viernes);
    expect(resultado.toISOString()).toBe("2026-09-30T10:00:00.000Z"); // miercoles (lunes=1, martes=2, miercoles=3)
  });
});

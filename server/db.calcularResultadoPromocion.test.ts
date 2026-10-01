import { describe, it, expect } from "vitest";
import { calcularResultadoPromocion } from "./db";

describe("calcularResultadoPromocion", () => {
  it("los 4 componentes enviados: suma el total real y marca completo", () => {
    const resultado = calcularResultadoPromocion({
      autoevaluacion: { estado: "enviado", puntaje: 14 },
      jefe: { estado: "enviado", puntaje: 14 },
      companero1: { estado: "enviado", puntaje: 5.571 },
      companero2: { estado: "enviado", puntaje: 2.571 },
    });
    expect(resultado.total).toBeCloseTo(36.142, 3);
    expect(resultado.completo).toBe(true);
  });

  it("todos pendientes (borrador o null): total 0, no completo", () => {
    const resultado = calcularResultadoPromocion({
      autoevaluacion: { estado: "borrador", puntaje: null },
      jefe: null,
      companero1: { estado: "borrador", puntaje: null },
      companero2: null,
    });
    expect(resultado.total).toBe(0);
    expect(resultado.completo).toBe(false);
  });

  it("mezcla: solo suma lo enviado, total parcial, no completo", () => {
    const resultado = calcularResultadoPromocion({
      autoevaluacion: { estado: "enviado", puntaje: 14 },
      jefe: { estado: "enviado", puntaje: 10 },
      companero1: { estado: "borrador", puntaje: null },
      companero2: null,
    });
    expect(resultado.total).toBe(24);
    expect(resultado.completo).toBe(false);
  });

  it("componente enviado con puntaje 0 real: suma 0 pero SI cuenta como enviado para completo", () => {
    const resultado = calcularResultadoPromocion({
      autoevaluacion: { estado: "enviado", puntaje: 0 },
      jefe: { estado: "enviado", puntaje: 0 },
      companero1: { estado: "enviado", puntaje: 0 },
      companero2: { estado: "enviado", puntaje: 0 },
    });
    expect(resultado.total).toBe(0);
    expect(resultado.completo).toBe(true);
  });
});

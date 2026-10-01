import { describe, it, expect } from "vitest";
import { calcularElegibilidadPromocion } from "./db";

describe("calcularElegibilidadPromocion (funcion pura)", () => {
  it("elegible: 2 cursos, ambos >=70", () => {
    expect(calcularElegibilidadPromocion([70, 85])).toEqual({ elegible: true, calificacion1: 70, calificacion2: 85 });
  });

  it("elegible: es PROMEDIO -- 100 y 50 promedian 75, pasa aunque el 50 solo no aprobaria", () => {
    expect(calcularElegibilidadPromocion([100, 50])).toEqual({ elegible: true, calificacion1: 100, calificacion2: 50 });
  });

  it("no elegible: promedio exacto por debajo de 70 (6.9 equivalente) -- pero regresa las calificaciones para mostrarlas", () => {
    expect(calcularElegibilidadPromocion([65, 74])).toEqual({ elegible: false, calificacion1: 65, calificacion2: 74 });
  });

  it("elegible: promedio justo en el limite 70", () => {
    expect(calcularElegibilidadPromocion([60, 80])).toEqual({ elegible: true, calificacion1: 60, calificacion2: 80 });
  });

  it("no elegible: solo 1 curso completado", () => {
    expect(calcularElegibilidadPromocion([85])).toEqual({ elegible: false });
  });

  it("no elegible: 0 cursos completados", () => {
    expect(calcularElegibilidadPromocion([])).toEqual({ elegible: false });
  });

  it("3+ cursos completados: usa los primeros 2", () => {
    expect(calcularElegibilidadPromocion([60, 65, 90])).toEqual({ elegible: false, calificacion1: 60, calificacion2: 65 });
  });
});

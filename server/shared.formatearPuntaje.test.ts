import { describe, it, expect } from "vitest";
import { formatearPuntaje } from "../shared/utils";

describe("formatearPuntaje", () => {
  it("quita ceros de cola: 9.500 -> '9.5'", () => {
    expect(formatearPuntaje(9.5)).toBe("9.5");
  });

  it("quita todos los decimales si son cero: 3.000 -> '3'", () => {
    expect(formatearPuntaje(3)).toBe("3");
  });

  it("conserva una fraccion real no-terminante: 4.571 se queda igual", () => {
    expect(formatearPuntaje(4.571)).toBe("4.571");
  });

  it("redondea a 3 decimales antes de quitar ceros (evita artefactos de punto flotante)", () => {
    expect(formatearPuntaje(2.5709999999999997)).toBe("2.571");
  });

  it("cero real se muestra como '0', no '0.000'", () => {
    expect(formatearPuntaje(0)).toBe("0");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

// Igual que server/db.listarInscripcionesPromocion.test.ts: mysql2/promise
// se mockea para que getDb() nunca abra un pool real (createPool real
// truena sin DATABASE_URL), y drizzle-orm/mysql2 se mockea para poder
// inyectar un fakeDb encadenable via drizzle(pool, ...).mockReturnValue().
// El mock sugerido en el brief (vi.spyOn sobre el objeto namespace de
// "./db") no funciona: getDb() llama a la funcion local del modulo, no al
// binding exportado, asi que el spy nunca intercepta la llamada interna
// -- se ajusto al patron real ya probado por listarInscripcionesPromocion.
vi.mock("mysql2/promise", () => ({ default: { createPool: vi.fn(() => ({})) } }));
vi.mock("drizzle-orm/mysql2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return { ...actual, drizzle: vi.fn() };
});

function encadenable(resultado: any) {
  const q: any = {};
  q.select = vi.fn(() => q);
  q.from = vi.fn(() => q);
  q.innerJoin = vi.fn(() => q);
  q.leftJoin = vi.fn(() => q);
  q.where = vi.fn(() => q);
  q.orderBy = vi.fn(() => Promise.resolve(resultado));
  return q;
}

beforeEach(() => {
  vi.resetModules();
});

describe("listarResultadosPromocion", () => {
  it("regresa items con total/completo calculados y metadatos de paginacion", async () => {
    const filasCrudas = [
      {
        promocionId: 1,
        trabajadorNombre: "Ana Torres",
        trabajadorCurp: "AAAA000101MDFXXX01",
        autoEstado: "enviado", autoPuntaje: 14,
        jefeEstado: "enviado", jefePuntaje: 14,
        c1Estado: "enviado", c1Puntaje: 5.571,
        c2Estado: "borrador", c2Puntaje: null,
      },
    ];
    const dbFake = {
      select: vi.fn()
        .mockReturnValueOnce(encadenable(filasCrudas))
        .mockReturnValueOnce({ from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([{ count: 1 }])) })) }),
    };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(dbFake as any);

    const { listarResultadosPromocion } = await import("./db");
    const resultado = await listarResultadosPromocion({ page: 1, limit: 20 });

    expect(resultado.items).toHaveLength(1);
    expect(resultado.items[0].total).toBeCloseTo(33.571, 3);
    expect(resultado.items[0].completo).toBe(false);
    expect(resultado.total).toBe(1);
    expect(resultado.page).toBe(1);
  });

  it("filtro estado=completo excluye a los que no tienen los 4 componentes enviados", async () => {
    const filasCrudas = [
      { promocionId: 1, trabajadorNombre: "Ana", trabajadorCurp: "X1", autoEstado: "enviado", autoPuntaje: 14, jefeEstado: "enviado", jefePuntaje: 14, c1Estado: "enviado", c1Puntaje: 6, c2Estado: "enviado", c2Puntaje: 6 },
      { promocionId: 2, trabajadorNombre: "Beto", trabajadorCurp: "X2", autoEstado: "borrador", autoPuntaje: null, jefeEstado: "enviado", jefePuntaje: 14, c1Estado: "enviado", c1Puntaje: 6, c2Estado: "enviado", c2Puntaje: 6 },
    ];
    const dbFake = {
      select: vi.fn()
        .mockReturnValueOnce(encadenable(filasCrudas))
        .mockReturnValueOnce({ from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([{ count: 2 }])) })) }),
    };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(dbFake as any);

    const { listarResultadosPromocion } = await import("./db");
    const resultado = await listarResultadosPromocion({ page: 1, limit: 20, estado: "completo" });

    expect(resultado.items).toHaveLength(1);
    expect(resultado.items[0].trabajadorNombre).toBe("Ana");
  });

  it("con totales empatados, ordena por promocionId de forma estable sin importar el orden en que la DB regreso las filas", async () => {
    // Ninguno de los 2 tiene ningun componente enviado -- total 0 para
    // ambos, empate real. Las filas crudas llegan en orden DESCENDENTE de
    // promocionId (5 antes que 3) a proposito, simulando que MySQL no
    // garantiza orden sin ORDER BY -- el comparador debe desempatar por
    // promocionId ascendente pase lo que pase con el orden de entrada.
    const filasCrudas = [
      { promocionId: 5, trabajadorNombre: "Carla", trabajadorCurp: "X5", autoEstado: null, autoPuntaje: null, jefeEstado: null, jefePuntaje: null, c1Estado: null, c1Puntaje: null, c2Estado: null, c2Puntaje: null },
      { promocionId: 3, trabajadorNombre: "Beto", trabajadorCurp: "X3", autoEstado: null, autoPuntaje: null, jefeEstado: null, jefePuntaje: null, c1Estado: null, c1Puntaje: null, c2Estado: null, c2Puntaje: null },
    ];
    const dbFake = {
      select: vi.fn()
        .mockReturnValueOnce(encadenable(filasCrudas))
        .mockReturnValueOnce({ from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([{ count: 2 }])) })) }),
    };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(dbFake as any);

    const { listarResultadosPromocion } = await import("./db");
    const resultado = await listarResultadosPromocion({ page: 1, limit: 20, ordenTotal: "desc" });

    expect(resultado.items.map((i) => i.promocionId)).toEqual([3, 5]);
  });

  it("filtro estado=pendiente excluye a los que SI tienen los 4 componentes enviados", async () => {
    const filasCrudas = [
      { promocionId: 1, trabajadorNombre: "Ana", trabajadorCurp: "X1", autoEstado: "enviado", autoPuntaje: 14, jefeEstado: "enviado", jefePuntaje: 14, c1Estado: "enviado", c1Puntaje: 6, c2Estado: "enviado", c2Puntaje: 6 },
      { promocionId: 2, trabajadorNombre: "Beto", trabajadorCurp: "X2", autoEstado: "borrador", autoPuntaje: null, jefeEstado: "enviado", jefePuntaje: 14, c1Estado: "enviado", c1Puntaje: 6, c2Estado: "enviado", c2Puntaje: 6 },
    ];
    const dbFake = {
      select: vi.fn()
        .mockReturnValueOnce(encadenable(filasCrudas))
        .mockReturnValueOnce({ from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([{ count: 2 }])) })) }),
    };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(dbFake as any);

    const { listarResultadosPromocion } = await import("./db");
    const resultado = await listarResultadosPromocion({ page: 1, limit: 20, estado: "pendiente" });

    expect(resultado.items).toHaveLength(1);
    expect(resultado.items[0].trabajadorNombre).toBe("Beto");
  });

  it("ordenTotal=asc ordena de menor a mayor total", async () => {
    const filasCrudas = [
      { promocionId: 1, trabajadorNombre: "Ana", trabajadorCurp: "X1", autoEstado: "enviado", autoPuntaje: 14, jefeEstado: null, jefePuntaje: null, c1Estado: null, c1Puntaje: null, c2Estado: null, c2Puntaje: null },
      { promocionId: 2, trabajadorNombre: "Beto", trabajadorCurp: "X2", autoEstado: "enviado", autoPuntaje: 4, jefeEstado: null, jefePuntaje: null, c1Estado: null, c1Puntaje: null, c2Estado: null, c2Puntaje: null },
    ];
    const dbFake = {
      select: vi.fn()
        .mockReturnValueOnce(encadenable(filasCrudas))
        .mockReturnValueOnce({ from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([{ count: 2 }])) })) }),
    };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(dbFake as any);

    const { listarResultadosPromocion } = await import("./db");
    const resultado = await listarResultadosPromocion({ page: 1, limit: 20, ordenTotal: "asc" });

    expect(resultado.items.map((i) => i.trabajadorNombre)).toEqual(["Beto", "Ana"]);
  });

  it("pagina 2 regresa el resto de las filas y totalPages refleja el total real, no solo la pagina actual", async () => {
    const filasCrudas = Array.from({ length: 5 }, (_, i) => ({
      promocionId: i + 1,
      trabajadorNombre: `Servidor ${i + 1}`,
      trabajadorCurp: `CURP${i + 1}`,
      autoEstado: null, autoPuntaje: null,
      jefeEstado: null, jefePuntaje: null,
      c1Estado: null, c1Puntaje: null,
      c2Estado: null, c2Puntaje: null,
    }));
    const dbFake = {
      select: vi.fn()
        .mockReturnValueOnce(encadenable(filasCrudas))
        .mockReturnValueOnce({ from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([{ count: 5 }])) })) }),
    };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(dbFake as any);

    const { listarResultadosPromocion } = await import("./db");
    const resultado = await listarResultadosPromocion({ page: 2, limit: 2 });

    expect(resultado.items.map((i) => i.promocionId)).toEqual([3, 4]);
    expect(resultado.total).toBe(5);
    expect(resultado.totalPages).toBe(3);
    expect(resultado.page).toBe(2);
  });
});

import { vi, describe, it, expect, beforeEach } from "vitest";
import { makeTxRecorder } from "./db.transaction-test-helpers";

vi.mock("mysql2/promise", () => ({ default: { createPool: vi.fn(() => ({})) } }));
vi.mock("drizzle-orm/mysql2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return { ...actual, drizzle: vi.fn() };
});

describe("guardarFactorInconformidad", () => {
  beforeEach(() => vi.resetModules());

  it("crea la inconformidad y el factor cuando no existe nada todavia", async () => {
    const { tx, calls } = makeTxRecorder(
      [
        [], // FOR UPDATE sobre inconformidades por userId -- no existe
        [{ habilitado: true }], // config del factor -- ya no se consulta factorExistente cuando no hay cabecera
      ],
      [{ insertId: 10 }, { insertId: 55 }, { insertId: 1 }], // insert inconformidad, insert factor, insert auditoria
    );
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { guardarFactorInconformidad } = await import("./db");
    const resultado = await guardarFactorInconformidad(4, "capacitacion", "Mi reclamo tiene mas de diez caracteres");

    expect(fakeDb.transaction).toHaveBeenCalledTimes(1);
    expect(resultado).toEqual({ ok: true, id: 55 });
  });

  it("rechaza si el factor esta deshabilitado y aun no existe una fila para el", async () => {
    const { tx } = makeTxRecorder(
      [
        [{ id: 10, estado: "borrador" }], // ya existe la cabecera
        [], // el factor no existe todavia para esta inconformidad
        [{ habilitado: false }], // config: deshabilitado
      ],
      [],
    );
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { guardarFactorInconformidad } = await import("./db");
    const resultado = await guardarFactorInconformidad(4, "antiguedad", "Texto valido de mas de diez caracteres");

    expect(resultado).toEqual({ ok: false, error: "FACTOR_DESHABILITADO" });
  });

  it("permite editar un factor ya habilitado antes, aunque el admin lo haya apagado despues", async () => {
    const { tx, calls } = makeTxRecorder(
      [
        [{ id: 10, estado: "borrador" }], // cabecera existente
        [{ id: 55 }], // el factor YA existe -- no se vuelve a chequear habilitado
      ],
      [{ insertId: 1 }], // update no pasa por insertResults, pero el insert de auditoria si
    );
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { guardarFactorInconformidad } = await import("./db");
    const resultado = await guardarFactorInconformidad(4, "antiguedad", "Texto editado de mas de diez caracteres");

    expect(resultado).toEqual({ ok: true, id: 55 });
    // 3 selects (cabecera, factorExistente, servidor) -- si fueran 4, el 4to seria
    // la config del factor, probando que SI se re-checo habilitado en un edit (no debe).
    expect(calls.filter((c) => c === "select")).toHaveLength(3);
  });

  it("rechaza si la inconformidad ya fue enviada", async () => {
    const { tx } = makeTxRecorder([[{ id: 10, estado: "enviado" }]], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { guardarFactorInconformidad } = await import("./db");
    const resultado = await guardarFactorInconformidad(4, "capacitacion", "Texto valido de mas de diez caracteres");

    expect(resultado).toEqual({ ok: false, error: "YA_ENVIADA" });
  });

  // Los 3 tests siguientes fijan el comportamiento encontrado con una prueba
  // de concurrencia real contra MySQL de verdad (ver ledger): dos guardados
  // simultaneos del primer factor de un usuario pueden chocar con
  // ER_DUP_ENTRY o con ER_LOCK_DEADLOCK (InnoDB aborta la transaccion
  // COMPLETA en un deadlock, no solo el statement) -- drizzle-orm ademas
  // envuelve el error real de mysql2 en `.cause`, nunca en `.code` directo.

  it("reintenta la transaccion completa si MySQL reporta un deadlock (ER_LOCK_DEADLOCK en .cause)", async () => {
    const { tx } = makeTxRecorder(
      [[], [{ habilitado: true }]],
      [{ insertId: 20 }, { insertId: 77 }, { insertId: 1 }],
    );
    let intentos = 0;
    const fakeDb = {
      transaction: vi.fn((cb: any) => {
        intentos++;
        if (intentos === 1) {
          const err: any = new Error("Failed query: insert into inconformidades ...");
          err.cause = { code: "ER_LOCK_DEADLOCK", errno: 1213, sqlState: "40001" };
          return Promise.reject(err);
        }
        return cb(tx);
      }),
    };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { guardarFactorInconformidad } = await import("./db");
    const resultado = await guardarFactorInconformidad(4, "capacitacion", "Texto valido de mas de diez caracteres");

    expect(fakeDb.transaction).toHaveBeenCalledTimes(2);
    expect(resultado).toEqual({ ok: true, id: 77 });
  });

  it("se rinde y propaga el error si el deadlock persiste en los 3 intentos (no reintenta para siempre)", async () => {
    const fakeDb = {
      transaction: vi.fn(() => {
        const err: any = new Error("Failed query: insert into inconformidades ...");
        err.cause = { code: "ER_LOCK_DEADLOCK", errno: 1213 };
        return Promise.reject(err);
      }),
    };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { guardarFactorInconformidad } = await import("./db");
    await expect(guardarFactorInconformidad(4, "capacitacion", "Texto valido de mas de diez caracteres"))
      .rejects.toThrow("Failed query");
    expect(fakeDb.transaction).toHaveBeenCalledTimes(3);
  });

  it("NO reintenta si el error de MySQL no es de los codigos conocidos como transitorios", async () => {
    const fakeDb = {
      transaction: vi.fn(() => {
        const err: any = new Error("Failed query: syntax error");
        err.cause = { code: "ER_PARSE_ERROR" };
        return Promise.reject(err);
      }),
    };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { guardarFactorInconformidad } = await import("./db");
    await expect(guardarFactorInconformidad(4, "capacitacion", "Texto valido de mas de diez caracteres"))
      .rejects.toThrow("Failed query");
    expect(fakeDb.transaction).toHaveBeenCalledTimes(1);
  });
});

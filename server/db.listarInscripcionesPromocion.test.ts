import { vi, describe, it, expect, beforeEach } from "vitest";
import { makeTxRecorder } from "./db.transaction-test-helpers";

vi.mock("mysql2/promise", () => ({ default: { createPool: vi.fn(() => ({})) } }));
vi.mock("drizzle-orm/mysql2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return { ...actual, drizzle: vi.fn() };
});
// I3: reasignarEvaluadorPromocion ahora valida formato+MX del correo
// capturado ANTES de abrir la transaccion -- default ok:true, los tests que
// quieren probar el rechazo lo sobreescriben.
vi.mock("./lib/validarCorreo", () => ({
  validarCorreoEvaluador: vi.fn(async () => ({ ok: true })),
}));

beforeEach(() => {
  vi.resetModules();
});

describe("listarInscripcionesPromocion", () => {
  // El mock de makeTxRecorder regresa arrays pre-encolados sin importar los
  // argumentos reales de .limit()/.offset() -- este test solo prueba el
  // shape del resultado dado un mock, no el LIMIT/OFFSET real. El
  // comportamiento real de paginacion se verifico en vivo contra MySQL real
  // en el Task 9 de este plan (ver progress.md).
  it("regresa items y metadatos de paginación con el shape correcto", async () => {
    const filaEjemplo = { id: 1, enviadoAt: new Date(), trabajadorNombre: "Ana", trabajadorCurp: "X", jefeNombre: "Jefe", companero1Nombre: "C1", companero2Nombre: "C2", jefePuntaje: 5, companero1Puntaje: null, companero2Puntaje: 2.571 };
    const { tx } = makeTxRecorder([[filaEjemplo], [{ count: 1 }], [{ count: 0 }]], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { listarInscripcionesPromocion } = await import("./db");
    const resultado = await listarInscripcionesPromocion({ page: 1, limit: 20 });
    expect(resultado.items).toEqual([filaEjemplo]);
    expect(resultado.total).toBe(1);
    expect(resultado.totalPages).toBe(1);
    expect(resultado.conReferenciaRota).toBe(0);
  });

  it("cuenta inscripciones con referencia de evaluador rota, sin importar el filtro de busqueda", async () => {
    const { tx } = makeTxRecorder([[], [{ count: 0 }], [{ count: 3 }]], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { listarInscripcionesPromocion } = await import("./db");
    const resultado = await listarInscripcionesPromocion({ search: "algo que no matchea nada", page: 1, limit: 20 });
    expect(resultado.conReferenciaRota).toBe(3);
  });
});

describe("reasignarEvaluadorPromocion", () => {
  it("rechaza si el nuevo CURP no esta en el pool del rol correcto", async () => {
    const { tx } = makeTxRecorder([[]], []); // curpEnPool: no encontrado
    const fakeDb = { select: tx.select, transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { reasignarEvaluadorPromocion } = await import("./db");
    const resultado = await reasignarEvaluadorPromocion(1, "companero1", "CURPQUENOESTA0001", "Nombre X", "nuevo@example.com", 1);
    expect(resultado).toEqual({ ok: false, error: "SELECCION_INVALIDA" });
  });

  it("rechaza si el servidor/usuario esta inactivo (simulado por MySQL sin regresar fila)", async () => {
    const { tx } = makeTxRecorder([[]], []); // curpEnPool: excluido por activo/isActive
    const fakeDb = { select: tx.select, transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { reasignarEvaluadorPromocion } = await import("./db");
    const resultado = await reasignarEvaluadorPromocion(1, "companero1", "CCCC000101HDFXXX05", "Nombre X", "nuevo@example.com", 1);
    expect(resultado).toEqual({ ok: false, error: "SELECCION_INVALIDA" });
  });

  it("rechaza con CORREO_INVALIDO sin abrir transaccion ni consultar el pool", async () => {
    const { validarCorreoEvaluador } = await import("./lib/validarCorreo");
    vi.mocked(validarCorreoEvaluador).mockResolvedValueOnce({ ok: false, error: "formato de correo inválido" });
    const fakeDb = { select: vi.fn(), transaction: vi.fn() };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { reasignarEvaluadorPromocion } = await import("./db");
    const resultado = await reasignarEvaluadorPromocion(1, "companero1", "CCCC000101HDFXXX05", "Nombre X", "no-es-correo", 1);
    expect(resultado).toEqual({ ok: false, error: "CORREO_INVALIDO" });
    expect(fakeDb.transaction).not.toHaveBeenCalled();
  });

  it("rechaza si la promocion no existe", async () => {
    const { tx } = makeTxRecorder([[{ curp: "CCCC000101HDFXXX05", nombre: "Nombre X" }], []], []);
    const fakeDb = { select: tx.select, transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { reasignarEvaluadorPromocion } = await import("./db");
    const resultado = await reasignarEvaluadorPromocion(999, "companero1", "CCCC000101HDFXXX05", "Nombre X", "nuevo@example.com", 1);
    expect(resultado).toEqual({ ok: false, error: "PROMOCION_NO_ENCONTRADA" });
  });

  it("reasigna via asignarEvaluador y audita en una transaccion", async () => {
    const promoExistente = { id: 1, userId: 1, jefeAsignadoId: 10, companero1Id: 20, companero2Id: 30 };
    const { tx, calls } = makeTxRecorder([
      [{ curp: "CCCC000101HDFXXX05", nombre: "Nombre X" }], // curpEnPool: valido
      [promoExistente],
      [{ id: 55 }], // chequeo de conflicto pre-asignarEvaluador: ya vinculado, sin conflicto
      [{ id: 55, evaluadorCuentaExpiraEn: null }], // asignarEvaluador: select interno, ya tiene cuenta
    ], []);
    const fakeDb = { select: tx.select, transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { reasignarEvaluadorPromocion } = await import("./db");
    const resultado = await reasignarEvaluadorPromocion(1, "companero1", "CCCC000101HDFXXX05", "Nombre X", "nuevo@example.com", 1);
    expect(resultado).toEqual({ ok: true });
    expect(calls).toContain("update");
    expect(calls).toContain("insert");
  });

  it("reasignar borra la evaluacion en borrador del slot viejo y crea una nueva para el evaluador nuevo", async () => {
    const promoExistente = { id: 1, userId: 1, jefeAsignadoId: 10, companero1Id: 20, companero2Id: 30 };
    const { tx, calls } = makeTxRecorder([
      [{ curp: "CCCC000101HDFXXX05", nombre: "Nombre X" }],
      [promoExistente],
      [{ id: 55 }],
      [{ id: 55, evaluadorCuentaExpiraEn: null }],
    ], []);
    const fakeDb = { select: tx.select, transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { reasignarEvaluadorPromocion } = await import("./db");
    const resultado = await reasignarEvaluadorPromocion(1, "companero1", "CCCC000101HDFXXX05", "Nombre X", "nuevo@example.com", 1);

    expect(resultado).toEqual({ ok: true });
    expect(calls).toContain("delete");
  });

  it("regresa EVALUACION_YA_ENVIADA si el slot reasignado ya tenia una evaluacion enviada", async () => {
    const promoExistente = { id: 1, userId: 1, jefeAsignadoId: 10, companero1Id: 20, companero2Id: 30 };
    const { tx } = makeTxRecorder([
      [{ curp: "CCCC000101HDFXXX05", nombre: "Nombre X" }],
      [promoExistente],
      [{ id: 55 }],
      [{ id: 55, evaluadorCuentaExpiraEn: null }],
      [{ estado: "enviado" }], // post-catch: distingue la causa real del ER_DUP_ENTRY
    ], []);
    tx.insert = vi.fn(() => {
      throw Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY" });
    });
    const fakeDb = { select: tx.select, transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { reasignarEvaluadorPromocion } = await import("./db");
    const resultado = await reasignarEvaluadorPromocion(1, "companero1", "CCCC000101HDFXXX05", "Nombre X", "nuevo@example.com", 1);
    expect(resultado).toEqual({ ok: false, error: "EVALUACION_YA_ENVIADA" });
  });

  it("regresa REASIGNACION_CONCURRENTE si el ER_DUP_ENTRY NO fue por una evaluacion ya enviada", async () => {
    const promoExistente = { id: 1, userId: 1, jefeAsignadoId: 10, companero1Id: 20, companero2Id: 30 };
    const { tx } = makeTxRecorder([
      [{ curp: "CCCC000101HDFXXX05", nombre: "Nombre X" }],
      [promoExistente],
      [{ id: 55 }],
      [{ id: 55, evaluadorCuentaExpiraEn: null }],
      [{ estado: "borrador" }], // la fila que gano la carrera ya existe, pero sigue sin contestar
    ], []);
    tx.insert = vi.fn(() => {
      throw Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY" });
    });
    const fakeDb = { select: tx.select, transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { reasignarEvaluadorPromocion } = await import("./db");
    const resultado = await reasignarEvaluadorPromocion(1, "companero1", "CCCC000101HDFXXX05", "Nombre X", "nuevo@example.com", 1);
    expect(resultado).toEqual({ ok: false, error: "REASIGNACION_CONCURRENTE" });
  });

  it("rechaza por conflicto SIN llamar asignarEvaluador si el CURP ya vinculado coincide con otro puesto (no debe tocar users.email)", async () => {
    const promoExistente = { id: 1, userId: 1, jefeAsignadoId: 10, companero1Id: 20, companero2Id: 30 };
    const { tx, calls } = makeTxRecorder([
      [{ curp: "CCCC000101HDFXXX05", nombre: "Nombre X" }], // curpEnPool: valido
      [promoExistente],
      [{ id: 30 }], // users.id ya vinculado a ese CURP: coincide con companero2Id -> conflicto
    ], []);
    const fakeDb = { select: tx.select, transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { reasignarEvaluadorPromocion } = await import("./db");
    const resultado = await reasignarEvaluadorPromocion(1, "companero1", "CCCC000101HDFXXX05", "Nombre X", "nuevo@example.com", 1);
    expect(resultado).toEqual({ ok: false, error: "SELECCION_INVALIDA" });
    expect(calls).not.toContain("update");
    expect(calls).not.toContain("insert");
  });
});

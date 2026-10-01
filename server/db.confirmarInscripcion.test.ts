import { vi, describe, it, expect } from "vitest";
import { makeTxRecorder } from "./db.transaction-test-helpers";

vi.mock("mysql2/promise", () => ({ default: { createPool: vi.fn(() => ({})) } }));
vi.mock("drizzle-orm/mysql2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return { ...actual, drizzle: vi.fn() };
});
vi.mock("./auth", () => ({
  generarPasswordTemporal: vi.fn(() => "PASSTEMP12AB"),
  hashPassword: vi.fn(async () => "hash-simulado"),
}));
vi.mock("./lib/validarCorreo", () => ({
  validarCorreoEvaluador: vi.fn(async () => ({ ok: true })),
}));

const seleccionValida = {
  jefe: { curp: "JEFE000101HDFXXX01", nombre: "Jefe Ejemplo", correo: "jefe@example.com" },
  companero1: { curp: "COMP000101HDFXXX02", nombre: "Companero Uno", correo: "c1@example.com" },
  companero2: { curp: "COMP000101HDFXXX03", nombre: "Companero Dos", correo: "c2@example.com" },
};

describe("confirmarInscripcion", () => {
  it("no elegible: promedio de los 2 cursos completados por debajo de 70", async () => {
    vi.resetModules();
    const { tx } = makeTxRecorder([[{ calificacion: 50 }, { calificacion: 60 }]], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { confirmarInscripcion } = await import("./db");
    const resultado = await confirmarInscripcion(1, seleccionValida);
    expect(resultado).toEqual({ ok: false, error: "NO_ELEGIBLE" });
  });

  it("seleccion invalida: alguno de los 3 no esta en el pool del rol correcto", async () => {
    vi.resetModules();
    const { tx } = makeTxRecorder([
      [{ calificacion: 75 }, { calificacion: 90 }], // cursos completados
      [], // pool jefe: no encontro el CURP como jefe activo
    ], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { confirmarInscripcion } = await import("./db");
    const resultado = await confirmarInscripcion(1, seleccionValida);
    expect(resultado).toEqual({ ok: false, error: "SELECCION_INVALIDA" });
  });

  it("confirma: crea promocion + 3 correos pendientes + evaluaciones + auditoria en una transaccion", async () => {
    vi.resetModules();
    const { tx, calls } = makeTxRecorder([
      [{ calificacion: 75 }, { calificacion: 90 }], // cursos
      [{ curp: "JEFE000101HDFXXX01", nombre: "Jefe Ejemplo" }], // pool jefe valido
      [{ curp: "COMP000101HDFXXX02", nombre: "Companero Uno" }], // pool companero1 valido
      [{ curp: "COMP000101HDFXXX03", nombre: "Companero Dos" }], // pool companero2 valido
      [{ id: 42, curp: "OTRO000101HDFXXX99" }], // servidorPropio (no coincide con ninguno) -- se reusa para auditoria
      [{ id: 100, evaluadorCuentaExpiraEn: null }], // asignarEvaluador jefe: ya tiene cuenta
      [{ id: 200, evaluadorCuentaExpiraEn: null }], // asignarEvaluador companero1: ya tiene cuenta
      [{ id: 300, evaluadorCuentaExpiraEn: null }], // asignarEvaluador companero2: ya tiene cuenta
    ], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { confirmarInscripcion } = await import("./db");
    const resultado = await confirmarInscripcion(1, seleccionValida);
    expect(resultado).toEqual({ ok: true });
    // insert: promociones + promocionCorreosPendientes (batch) + evaluaciones
    // (batch) + auditoria = 4 -- ninguno de los 3 evaluadores necesito
    // cuenta nueva en este fixture (ya tenian cuenta).
    expect(calls.filter((c) => c === "insert")).toHaveLength(4);
  });

  it("auto-seleccion: rechaza con SELECCION_INVALIDA SIN llamar asignarEvaluador para ningun slot (transaccion completa, sin escritura parcial)", async () => {
    vi.resetModules();
    const { tx, calls } = makeTxRecorder([
      [{ calificacion: 75 }, { calificacion: 90 }], // cursos
      [{ curp: "JEFE000101HDFXXX01", nombre: "Jefe Ejemplo" }], // pool jefe valido
      [{ curp: "COMP000101HDFXXX02", nombre: "Companero Uno" }], // pool companero1 valido
      [{ curp: "COMP000101HDFXXX03", nombre: "Companero Dos" }], // pool companero2 valido
      [{ id: 20, curp: "COMP000101HDFXXX02" }], // servidorPropio.curp == companero1.curp -> auto-seleccion
    ], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { confirmarInscripcion } = await import("./db");
    const resultado = await confirmarInscripcion(1, seleccionValida);
    expect(resultado).toEqual({ ok: false, error: "SELECCION_INVALIDA" });
    expect(calls).not.toContain("insert");
    expect(calls).not.toContain("update");
  });

  it("servidor/usuario inactivo: se excluye del pool (simulado por MySQL sin regresar fila) y se rechaza", async () => {
    vi.resetModules();
    const { tx } = makeTxRecorder([
      [{ calificacion: 75 }, { calificacion: 90 }], // cursos
      [], // pool jefe: curpEnPool no regresa fila -- excluido por activo/isActive
    ], []);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { confirmarInscripcion } = await import("./db");
    const resultado = await confirmarInscripcion(1, seleccionValida);
    expect(resultado).toEqual({ ok: false, error: "SELECCION_INVALIDA" });
  });

  it("servidor con cuenta on-the-fly expirada: pool SI regresa fila (recuperable) y no rechaza por eso", async () => {
    vi.resetModules();
    const { tx, calls } = makeTxRecorder([
      [{ calificacion: 75 }, { calificacion: 90 }], // cursos completados
      [{ curp: "JEFE000101HDFXXX01", nombre: "Jefe Ejemplo" }], // pool jefe: SI regresa fila pese a isActive=false
      [{ curp: "COMP000101HDFXXX02", nombre: "Companero Uno" }], // pool companero1
      [{ curp: "COMP000101HDFXXX03", nombre: "Companero Dos" }], // pool companero2
      [{ id: 1, curp: "PROPIO0101HDFXXX00" }], // servidorPropio (sin coincidir, auto-seleccion check)
      [], // asignarEvaluador jefe: sin cuenta
      [], // asignarEvaluador companero1: sin cuenta
      [], // asignarEvaluador companero2: sin cuenta
    ], [{ insertId: 900 }]);
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { confirmarInscripcion } = await import("./db");
    const resultado = await confirmarInscripcion(1, seleccionValida);
    expect(resultado).toEqual({ ok: true });
    expect(calls).not.toEqual([]);
  });

  it("correo invalido: rechaza con CORREO_INVALIDO sin abrir transaccion", async () => {
    vi.resetModules();
    const { validarCorreoEvaluador } = await import("./lib/validarCorreo");
    vi.mocked(validarCorreoEvaluador).mockResolvedValueOnce({ ok: false, error: "el dominio del correo no existe" });
    const fakeDb = { transaction: vi.fn() };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { confirmarInscripcion } = await import("./db");
    const resultado = await confirmarInscripcion(1, seleccionValida);
    expect(resultado).toEqual({ ok: false, error: "CORREO_INVALIDO" });
    expect(fakeDb.transaction).not.toHaveBeenCalled();
  });

  it("crea las 3 filas de evaluaciones (jefe, companero1, companero2) junto con la inscripcion", async () => {
    vi.resetModules();
    const completadas = [{ calificacion: 80 }, { calificacion: 90 }];
    const { tx, calls } = makeTxRecorder(
      [
        completadas,
        [{ activo: true, nombre: "Jefe De Prueba" }], // pool jefe
        [{ activo: true, nombre: "Companero Uno" }], // pool companero1
        [{ activo: true, nombre: "Companero Dos" }], // pool companero2
        [{ id: 1, curp: "PROPIO0101HDFXXX00" }], // servidorPropio (distinto -> sin auto-seleccion)
        [], // asignarEvaluador jefe: sin cuenta
        [], // asignarEvaluador companero1: sin cuenta
        [], // asignarEvaluador companero2: sin cuenta
      ],
      [{ insertId: 200 }],
    );
    const fakeDb = { transaction: vi.fn((cb: any) => cb(tx)) };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { confirmarInscripcion } = await import("./db");
    const resultado = await confirmarInscripcion(1, {
      jefe: { curp: "AAAA000101HDFRRN01", nombre: "Jefe De Prueba", correo: "jefe@ejemplo.com" },
      companero1: { curp: "BBBB000101HDFRRN02", nombre: "Companero Uno", correo: "c1@ejemplo.com" },
      companero2: { curp: "CCCC000101HDFRRN03", nombre: "Companero Dos", correo: "c2@ejemplo.com" },
    });

    expect(resultado).toEqual({ ok: true });
    // 3x insert de asignarEvaluador (cuenta nueva cada uno) + insert
    // promociones + insert promocionCorreosPendientes + insert evaluaciones +
    // insert auditoria = 7 inserts exactos con este fixture.
    expect(calls.filter((c) => c === "insert")).toHaveLength(7);
  });

  it("doble inscripcion: ER_DUP_ENTRY se traduce a YA_INSCRITO", async () => {
    vi.resetModules();
    const fakeDb = {
      transaction: vi.fn(async () => {
        const err: any = new Error("Duplicate entry");
        err.cause = { code: "ER_DUP_ENTRY" };
        throw err;
      }),
    };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { confirmarInscripcion } = await import("./db");
    const resultado = await confirmarInscripcion(1, seleccionValida);
    expect(resultado).toEqual({ ok: false, error: "YA_INSCRITO" });
  });
});

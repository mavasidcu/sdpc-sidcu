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

describe("listarTodasSolicitudes", () => {
  it("regresa items y metadatos de paginacion con el shape correcto", async () => {
    const fila = { solicitudes_curso: { id: 1 }, cursos: { id: 1, nombre: "Curso" }, users: { id: 1, nombre: "Ana", curp: "X", email: null, role: "user", isActive: true } };
    const { tx } = makeTxRecorder([[fila], [{ count: 1 }]], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { listarTodasSolicitudes } = await import("./db");
    const resultado = await listarTodasSolicitudes({ page: 1, limit: 20 });
    expect(resultado.items).toEqual([fila]);
    expect(resultado.total).toBe(1);
  });

  it("busca por nombre o CURP del usuario (search)", async () => {
    const { tx, calls } = makeTxRecorder([[], [{ count: 0 }]], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { listarTodasSolicitudes } = await import("./db");
    const resultado = await listarTodasSolicitudes({ search: "Ana", page: 1, limit: 20 });
    expect(resultado.items).toEqual([]);
    expect(calls).toContain("select");
  });
});

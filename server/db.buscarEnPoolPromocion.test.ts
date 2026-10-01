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

describe("buscarEnPoolPromocion", () => {
  it("regresa coincidencias del rol pedido con tieneCuenta calculado", async () => {
    const fila = { curp: "AAAA000101HDFXXX01", nombre: "Ana Lopez", userId: 12, emailCuenta: null };
    // Primer select: resolver el curp del excluirUserId (aqui sin curp -- no excluye nada).
    // Segundo select: la busqueda real en el pool.
    const { tx } = makeTxRecorder([[], [fila]], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { buscarEnPoolPromocion } = await import("./db");
    const resultado = await buscarEnPoolPromocion("Ana", "companero", 1);
    expect(resultado).toEqual([{ curp: "AAAA000101HDFXXX01", nombre: "Ana Lopez", tieneCuenta: true, correoPrellenado: null }]);
  });

  it("tieneCuenta es false si userId viene null (sin cuenta creada todavia)", async () => {
    const fila = { curp: "BBBB000101HDFXXX02", nombre: "Beto Ruiz", userId: null, emailCuenta: null };
    const { tx } = makeTxRecorder([[], [fila]], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { buscarEnPoolPromocion } = await import("./db");
    const [resultado] = await buscarEnPoolPromocion("Beto", "jefe", 1);
    expect(resultado.tieneCuenta).toBe(false);
  });

  // Decision de producto 2026-09-26: correoPrellenado SOLO sale de
  // users.email (cuenta real verificada) -- correoSugerido (CSV del roster,
  // sin verificar) ya no se usa como fallback, para no precargar al
  // trabajador un correo no confirmado como si fuera confiable.
  it("correoPrellenado usa users.email si tiene cuenta", async () => {
    const fila = { curp: "CCCC000101HDFXXX03", nombre: "Carla Diaz", userId: 20, emailCuenta: "cuenta@example.com" };
    const { tx } = makeTxRecorder([[], [fila]], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { buscarEnPoolPromocion } = await import("./db");
    const [resultado] = await buscarEnPoolPromocion("Carla", "jefe", 1);
    expect(resultado.correoPrellenado).toBe("cuenta@example.com");
  });

  it("correoPrellenado es null si no hay cuenta, aunque el pool tenga correoSugerido", async () => {
    const fila = { curp: "DDDD000101HDFXXX04", nombre: "Dario Ruiz", userId: null, emailCuenta: null };
    const { tx } = makeTxRecorder([[], [fila]], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { buscarEnPoolPromocion } = await import("./db");
    const [resultado] = await buscarEnPoolPromocion("Dario", "companero", 1);
    expect(resultado.correoPrellenado).toBeNull();
  });

  it("correoPrellenado es null si tiene cuenta pero users.email tambien es null", async () => {
    const fila = { curp: "FFFF000101HDFXXX06", nombre: "Fabian Sosa", userId: 40, emailCuenta: null };
    const { tx } = makeTxRecorder([[], [fila]], []);
    const fakeDb = { select: tx.select };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);

    const { buscarEnPoolPromocion } = await import("./db");
    const [resultado] = await buscarEnPoolPromocion("Fabian", "companero", 1);
    expect(resultado.correoPrellenado).toBeNull();
  });
});

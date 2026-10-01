import { vi, describe, it, expect, beforeEach } from "vitest";
import { makeTxRecorder } from "./db.transaction-test-helpers";

vi.mock("mysql2/promise", () => ({ default: { createPool: vi.fn(() => ({})) } }));
vi.mock("drizzle-orm/mysql2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return { ...actual, drizzle: vi.fn() };
});
vi.mock("./lib/email", () => ({ enviarCorreoEvaluador: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
});

describe("procesarLotePendientesCorreo", () => {
  it("marca enviado en exito, usa el password de la fila (no de users) y lo limpia al terminar", async () => {
    const pendiente = { id: 1, promocionId: 1, destinatarioUserId: 100, rol: "jefe", intentos: 0, passwordTemporalEnClaro: "PASSTEMP12AB" };
    const destinatario = { email: "jefe@example.com", nombre: "Ana Lopez", curp: "AAAA000101HDFXXX01" };
    const trabajador = { nombreCompleto: "Beto Ruiz" };
    const { tx } = makeTxRecorder([[pendiente], [destinatario], [trabajador]], []);
    const fakeDb = { select: tx.select, update: tx.update };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);
    const { enviarCorreoEvaluador } = await import("./lib/email");
    vi.mocked(enviarCorreoEvaluador).mockResolvedValue({ ok: true });

    const { procesarLotePendientesCorreo } = await import("./db");
    const resultado = await procesarLotePendientesCorreo();
    expect(resultado).toEqual({ procesados: 1, enviados: 1, fallidos: 0 });
    expect(enviarCorreoEvaluador).toHaveBeenCalledWith(
      "jefe@example.com",
      "evaluador_nueva_cuenta",
      expect.objectContaining({ passwordTemporal: "PASSTEMP12AB", trabajador: "Beto Ruiz" }),
    );
  });

  it("usa la plantilla sin credenciales cuando passwordTemporalEnClaro es null", async () => {
    const pendiente = { id: 2, promocionId: 1, destinatarioUserId: 200, rol: "companero1", intentos: 0, passwordTemporalEnClaro: null };
    const destinatario = { email: "companero@example.com", nombre: "Carlos Diaz", curp: "CCCC000101HDFXXX03" };
    const trabajador = { nombreCompleto: "Beto Ruiz" };
    const { tx } = makeTxRecorder([[pendiente], [destinatario], [trabajador]], []);
    const fakeDb = { select: tx.select, update: tx.update };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);
    const { enviarCorreoEvaluador } = await import("./lib/email");
    vi.mocked(enviarCorreoEvaluador).mockResolvedValue({ ok: true });

    const { procesarLotePendientesCorreo } = await import("./db");
    await procesarLotePendientesCorreo();
    expect(enviarCorreoEvaluador).toHaveBeenCalledWith("companero@example.com", "evaluador_cuenta_existente", expect.anything());
  });

  it("incrementa intentos en fallo, sin llegar todavia al tope, y conserva el password para el reintento", async () => {
    const pendiente = { id: 1, promocionId: 1, destinatarioUserId: 100, rol: "jefe", intentos: 2, passwordTemporalEnClaro: "PASSTEMP12AB" };
    const destinatario = { email: "jefe@example.com", nombre: "Ana Lopez", curp: "AAAA000101HDFXXX01" };
    const trabajador = { nombreCompleto: "Beto Ruiz" };
    const { tx, calls } = makeTxRecorder([[pendiente], [destinatario], [trabajador]], []);
    const fakeDb = { select: tx.select, update: tx.update };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);
    const { enviarCorreoEvaluador } = await import("./lib/email");
    vi.mocked(enviarCorreoEvaluador).mockResolvedValue({ ok: false, error: "timeout" });

    const { procesarLotePendientesCorreo } = await import("./db");
    const resultado = await procesarLotePendientesCorreo();
    expect(resultado).toEqual({ procesados: 1, enviados: 0, fallidos: 1 });
    expect(calls).toContain("update");
  });

  // Hallazgo de auditoria DBA: antes, cuando un fallo real agotaba los 5
  // reintentos (estado="fallido" definitivo), passwordTemporalEnClaro se
  // quedaba en la fila para siempre -- un password real y vigente de una
  // cuenta on-the-fly visible en texto plano indefinidamente para cualquiera
  // con lectura de la DB. Solo el camino de exito (estado="enviado") lo
  // limpiaba. El admin ya puede reasignar/reintentar desde el panel de
  // correos fallidos sin necesitar releer este valor.
  it("al agotar los reintentos (fallido definitivo) limpia passwordTemporalEnClaro, no lo deja en claro para siempre", async () => {
    // intentos:4 -- el proximo fallo suma 5, que es TOPE_INTENTOS_CORREO (privado en db.ts, no exportado).
    const pendiente = { id: 1, promocionId: 1, destinatarioUserId: 100, rol: "jefe", intentos: 4, passwordTemporalEnClaro: "PASSTEMP12AB" };
    const destinatario = { email: "jefe@example.com", nombre: "Ana Lopez", curp: "AAAA000101HDFXXX01" };
    const trabajador = { nombreCompleto: "Beto Ruiz" };
    const { tx, setCalls } = makeTxRecorder([[pendiente], [destinatario], [trabajador]], []);
    const fakeDb = { select: tx.select, update: tx.update };
    const { drizzle } = await import("drizzle-orm/mysql2");
    vi.mocked(drizzle).mockReturnValue(fakeDb as any);
    const { enviarCorreoEvaluador } = await import("./lib/email");
    vi.mocked(enviarCorreoEvaluador).mockResolvedValue({ ok: false, error: "dominio no existe" });

    const { procesarLotePendientesCorreo } = await import("./db");
    const resultado = await procesarLotePendientesCorreo();
    expect(resultado).toEqual({ procesados: 1, enviados: 0, fallidos: 1 });
    expect(setCalls[0]).toEqual(expect.objectContaining({ estado: "fallido", passwordTemporalEnClaro: null }));
  });

  // I6 (revision final de rama): antes, un RESEND_API_KEY/RESEND_FROM_EMAIL
  // faltante regresaba la MISMA forma que una falla real de envio -- el
  // worker incrementaba `intentos` igual, y a los 5 ciclos (10 minutos,
  // corre cada 2 min) dead-letteraba TODA la cola con estado "fallido" aunque
  // no hubiera nada roto en los correos mismos, solo en la configuracion.
  // Ahora enviarCorreoEvaluador distingue este caso con
  // `configuracionFaltante: true`, y procesarLotePendientesCorreo no debe
  // tocar `intentos` ni `estado` en ese caso -- se repite el mismo tick 10
  // veces para probar que jamas escala a "fallido" ni incrementa intentos,
  // sin importar cuantas veces se corra.
  it("config faltante (RESEND_API_KEY/RESEND_FROM_EMAIL): no incrementa intentos ni marca fallido, sin importar cuantos ticks pasen", async () => {
    for (let tick = 0; tick < 10; tick++) {
      // vi.resetModules() por iteracion -- db.ts cachea `db` (el resultado de
      // getDb()) a nivel de modulo; sin resetear, las iteraciones 2+
      // reusarian el mock de drizzle de la iteracion 1 (ya agotado) en vez
      // del fakeDb fresco de este tick, y procesados terminaria en 0.
      vi.resetModules();
      const { enviarCorreoEvaluador } = await import("./lib/email");
      vi.mocked(enviarCorreoEvaluador).mockResolvedValue({ ok: false, error: "RESEND_API_KEY no configurada", configuracionFaltante: true });

      const pendiente = { id: 1, promocionId: 1, destinatarioUserId: 100, rol: "jefe", intentos: 0, passwordTemporalEnClaro: "PASSTEMP12AB" };
      const destinatario = { email: "jefe@example.com", nombre: "Ana Lopez", curp: "AAAA000101HDFXXX01" };
      const trabajador = { nombreCompleto: "Beto Ruiz" };
      const { tx, calls, setCalls } = makeTxRecorder([[pendiente], [destinatario], [trabajador]], []);
      const fakeDb = { select: tx.select, update: tx.update };
      const { drizzle } = await import("drizzle-orm/mysql2");
      vi.mocked(drizzle).mockReturnValue(fakeDb as any);

      const { procesarLotePendientesCorreo } = await import("./db");
      const resultado = await procesarLotePendientesCorreo();
      expect(resultado).toEqual({ procesados: 1, enviados: 0, fallidos: 1 });
      expect(calls).toContain("update");

      // El update que si ocurre solo debe tocar ultimoError -- nunca estado
      // ni intentos (fila.intentos se mantiene en 0 en cada iteracion, no se
      // reusa entre ticks, asi que un incremento real se veria aqui mismo).
      expect(setCalls).toHaveLength(1);
      expect(setCalls[0]).not.toHaveProperty("intentos");
      expect(setCalls[0]).not.toHaveProperty("estado");
      expect(setCalls[0]).toHaveProperty("ultimoError");
    }
  });
});

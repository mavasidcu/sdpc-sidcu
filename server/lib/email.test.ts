import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// vi.hoisted: vi.mock se sube al tope del archivo antes que cualquier otra
// declaracion -- si sendMock se declarara con un simple `const` fuera de
// vi.hoisted, la factory de vi.mock la veria como undefined al momento de
// ejecutarse (la inicializacion real de esa const ocurre despues del hoist).
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
}));

describe("enviarCorreoEvaluador", () => {
  const envOriginal = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    sendMock.mockReset();
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
  });

  afterEach(() => {
    process.env = { ...envOriginal };
  });

  it("regresa configuracionFaltante si falta RESEND_API_KEY (I6: no debe contar como intento real)", async () => {
    process.env.RESEND_FROM_EMAIL = "SIDCU <no-reply@dominio-verificado.mx>";
    const { enviarCorreoEvaluador } = await import("./email");
    const resultado = await enviarCorreoEvaluador("persona@example.com", "evaluador_cuenta_existente", {});
    expect(resultado).toEqual({ ok: false, error: "RESEND_API_KEY no configurada", configuracionFaltante: true });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("regresa configuracionFaltante si falta RESEND_FROM_EMAIL", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const { enviarCorreoEvaluador } = await import("./email");
    const resultado = await enviarCorreoEvaluador("persona@example.com", "evaluador_cuenta_existente", {});
    expect(resultado).toEqual({ ok: false, error: "RESEND_FROM_EMAIL no configurada", configuracionFaltante: true });
    expect(sendMock).not.toHaveBeenCalled();
  });

  // C2: el remitente estaba hardcodeado a "notificaciones@resend.dev" (el
  // sandbox de Resend, que no entrega a destinatarios reales) -- ahora debe
  // venir SIEMPRE de RESEND_FROM_EMAIL, sin ningun fallback hardcodeado.
  it("manda desde RESEND_FROM_EMAIL, nunca desde el sandbox notificaciones@resend.dev", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "SIDCU <no-reply@dominio-verificado.mx>";
    sendMock.mockResolvedValue({ data: { id: "abc" }, error: null });

    const { enviarCorreoEvaluador } = await import("./email");
    const resultado = await enviarCorreoEvaluador("persona@example.com", "evaluador_cuenta_existente", { nombre: "Ana", trabajador: "Beto" });

    expect(resultado).toEqual({ ok: true });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: "SIDCU <no-reply@dominio-verificado.mx>", to: ["persona@example.com"] }),
    );
    const llamada = sendMock.mock.calls[0][0];
    expect(llamada.from).not.toContain("resend.dev");
  });

  it("propaga el error real de Resend (fallo de envio genuino) sin marcar configuracionFaltante", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "SIDCU <no-reply@dominio-verificado.mx>";
    sendMock.mockResolvedValue({ data: null, error: { message: "dominio no verificado" } });

    const { enviarCorreoEvaluador } = await import("./email");
    const resultado = await enviarCorreoEvaluador("persona@example.com", "evaluador_cuenta_existente", {});
    expect(resultado).toEqual({ ok: false, error: "dominio no verificado" });
  });

  // Hallazgo de auditoria de seguridad 2026-09-21: `datos.trabajador` viene
  // de servidoresPublicos.nombreCompleto, que un trabajador controla 100%
  // desde su propio registro publico (authRouter.register solo exige
  // min(2), sin escapar HTML). Sin escapar, un nombre malicioso se inyecta
  // crudo en el HTML del correo que llega a evaluadores reales (terceros,
  // via Resend) -- vector de phishing sobre un canal transaccional
  // confiable. Mismo riesgo para `datos.nombre` (nombre de cuenta, tambien
  // editable via CSV de evaluadores/registro).
  it("escapa HTML de datos.nombre y datos.trabajador antes de mandarlos (previene inyeccion HTML en correo a terceros)", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "SIDCU <no-reply@dominio-verificado.mx>";
    sendMock.mockResolvedValue({ data: { id: "abc" }, error: null });

    const { enviarCorreoEvaluador } = await import("./email");
    await enviarCorreoEvaluador("persona@example.com", "evaluador_nueva_cuenta", {
      nombre: "Ana",
      trabajador: '<img src=x onerror=alert(1)><a href="http://phishing.example">click</a>',
      curp: "AAAA800101HDFXXX01",
      passwordTemporal: "abc123",
    });

    const html = sendMock.mock.calls[0][0].html;
    expect(html).not.toContain("<img");
    // El template legitimo SI trae su propio <a href> (boton "Ingresar a
    // SIDCU") -- lo que nunca debe aparecer es el href malicioso SIN escapar.
    expect(html).not.toContain('href="http://phishing.example"');
    expect(html).toContain("&lt;img");
    expect(html).toContain("&lt;a href=&quot;http://phishing.example&quot;&gt;click&lt;/a&gt;");
  });
});

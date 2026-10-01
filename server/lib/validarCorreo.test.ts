import { vi, describe, it, expect } from "vitest";

vi.mock("dns/promises", () => ({ resolveMx: vi.fn(), resolve4: vi.fn(), resolve6: vi.fn() }));

describe("validarCorreoEvaluador", () => {
  it("rechaza formato invalido sin llegar a consultar DNS", async () => {
    const dns = await import("dns/promises");
    const { validarCorreoEvaluador } = await import("./validarCorreo");
    const resultado = await validarCorreoEvaluador("no-es-correo");
    expect(resultado).toEqual({ ok: false, error: "formato de correo inválido" });
    expect(dns.resolveMx).not.toHaveBeenCalled();
  });

  it("acepta si el dominio tiene registro MX", async () => {
    const dns = await import("dns/promises");
    vi.mocked(dns.resolveMx).mockResolvedValue([{ exchange: "mx.example.com", priority: 10 }]);
    const { validarCorreoEvaluador } = await import("./validarCorreo");
    const resultado = await validarCorreoEvaluador("persona@example.com");
    expect(resultado).toEqual({ ok: true });
  });

  // Bug real detectado en uso: sdpc-sidcu.com.mx (dominio propio del
  // proyecto, ya en produccion) no tiene registro MX pero SI resuelve por A
  // -- rechazaba correos institucionales legitimos. RFC 5321 §5 permite
  // entregar correo al registro A cuando no hay MX (MX implicito) -- sin
  // este fallback, cualquier dominio configurado asi (comun en dominios
  // nuevos o dedicados solo a web) se rechaza aunque sea real.
  it("acepta si el dominio no tiene MX pero SI tiene registro A (fallback RFC 5321, MX implicito)", async () => {
    const dns = await import("dns/promises");
    vi.mocked(dns.resolveMx).mockRejectedValue(Object.assign(new Error("ENODATA"), { code: "ENODATA" }));
    vi.mocked(dns.resolve4).mockResolvedValue(["1.2.3.4"]);
    const { validarCorreoEvaluador } = await import("./validarCorreo");
    const resultado = await validarCorreoEvaluador("persona@sdpc-sidcu.com.mx");
    expect(resultado).toEqual({ ok: true });
  });

  it("acepta si el dominio no tiene MX ni A pero SI tiene AAAA", async () => {
    const dns = await import("dns/promises");
    vi.mocked(dns.resolveMx).mockRejectedValue(new Error("ENOTFOUND"));
    vi.mocked(dns.resolve4).mockRejectedValue(new Error("ENOTFOUND"));
    vi.mocked(dns.resolve6).mockResolvedValue(["::1"]);
    const { validarCorreoEvaluador } = await import("./validarCorreo");
    const resultado = await validarCorreoEvaluador("persona@solo-ipv6.example.com");
    expect(resultado).toEqual({ ok: true });
  });

  it("rechaza si el dominio no tiene registro MX, A ni AAAA", async () => {
    const dns = await import("dns/promises");
    vi.mocked(dns.resolveMx).mockRejectedValue(new Error("ENOTFOUND"));
    vi.mocked(dns.resolve4).mockRejectedValue(new Error("ENOTFOUND"));
    vi.mocked(dns.resolve6).mockRejectedValue(new Error("ENOTFOUND"));
    const { validarCorreoEvaluador } = await import("./validarCorreo");
    const resultado = await validarCorreoEvaluador("persona@dominio-inventado-xyz.com");
    expect(resultado).toEqual({ ok: false, error: "el dominio del correo no existe" });
  });
});

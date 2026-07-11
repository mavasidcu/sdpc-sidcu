import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verificarTurnstile } from "./turnstile";

describe("verificarTurnstile", () => {
  const originalSecret = process.env.TURNSTILE_SECRET_KEY;
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env.TURNSTILE_SECRET_KEY = originalSecret;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("omite la verificacion (retorna true) si no hay TURNSTILE_SECRET_KEY configurada", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;

    const resultado = await verificarTurnstile("cualquier-token");

    expect(resultado).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("retorna false si el token viene vacio, con secret configurada", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;

    const resultado = await verificarTurnstile("");

    expect(resultado).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("retorna true cuando Cloudflare responde success:true", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    }) as any;

    const resultado = await verificarTurnstile("token-valido", "1.2.3.4");

    expect(resultado).toBe(true);
  });

  it("retorna false cuando Cloudflare responde success:false", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: false, "error-codes": ["invalid-input-response"] }),
    }) as any;

    const resultado = await verificarTurnstile("token-invalido");

    expect(resultado).toBe(false);
  });

  it("retorna false si la llamada a Cloudflare falla (red caida)", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    global.fetch = vi.fn().mockRejectedValue(new Error("network error")) as any;

    const resultado = await verificarTurnstile("token-cualquiera");

    expect(resultado).toBe(false);
  });
});

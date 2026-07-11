import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request } from "express";
import { extraerCurp, keyPorCuentaOIp } from "./middleware/rateLimiter";
import { verifyToken } from "./auth";

vi.mock("./auth", () => ({
  verifyToken: vi.fn(),
}));

function makeReq(body: any, query: Record<string, string> = {}): Request {
  return { body, query } as unknown as Request;
}

function makeReqConCookie(cookies: Record<string, string>, ip = "1.2.3.4"): Request {
  return { cookies, ip } as unknown as Request;
}

describe("extraerCurp", () => {
  it("extrae curp de un body directo (no batched)", () => {
    expect(extraerCurp(makeReq({ curp: "peju900101hdfrxn01", password: "x" }))).toBe("PEJU900101HDFRXN01");
  });

  it("extrae curp de un body batched con superjson (body['0'].json.curp, ?batch=1)", () => {
    expect(
      extraerCurp(
        makeReq({ "0": { json: { curp: "peju900101hdfrxn01", password: "x" } } }, { batch: "1" }),
      ),
    ).toBe("PEJU900101HDFRXN01");
  });

  it("ignora un curp decoy en el top-level si la request es batched (?batch=1) -- ahi tRPC solo lee body['0'].json, el decoy nunca se usa para el login real", () => {
    expect(
      extraerCurp(
        makeReq(
          { curp: "DECOY", "0": { json: { curp: "peju900101hdfrxn01", password: "x" } } },
          { batch: "1" },
        ),
      ),
    ).toBe("PEJU900101HDFRXN01");
  });

  it("ignora el shape batched si la request NO es batched -- usa el top-level, que es lo que tRPC realmente lee sin ?batch=1", () => {
    expect(
      extraerCurp(
        makeReq({ curp: "peju900101hdfrxn01", "0": { json: { curp: "OTRO_CURP_IGNORADO" } } }),
      ),
    ).toBe("PEJU900101HDFRXN01");
  });

  it("extrae curp de un body envuelto directo en json (sin indice de batch)", () => {
    expect(extraerCurp(makeReq({ json: { curp: "peju900101hdfrxn01" } }))).toBe("PEJU900101HDFRXN01");
  });

  it("retorna null si no hay body", () => {
    expect(extraerCurp(makeReq(undefined))).toBeNull();
  });

  it("retorna null si el body no trae curp en ninguna forma reconocida", () => {
    expect(extraerCurp(makeReq({ foo: "bar" }))).toBeNull();
  });

  it("retorna null si curp viene vacio o solo espacios", () => {
    expect(extraerCurp(makeReq({ curp: "   " }))).toBeNull();
  });

  it("recorta espacios y normaliza a mayusculas", () => {
    expect(extraerCurp(makeReq({ curp: "  peju900101hdfrxn01  " }))).toBe("PEJU900101HDFRXN01");
  });
});

describe("keyPorCuentaOIp", () => {
  beforeEach(() => {
    vi.mocked(verifyToken).mockReset();
  });

  it("usa user:{id} cuando la cookie trae un token valido", () => {
    vi.mocked(verifyToken).mockReturnValue({ id: 42, email: null, role: "user", nombre: "Ana" });
    const req = makeReqConCookie({ casa_cultura_session: "token-valido" });
    expect(keyPorCuentaOIp(req)).toBe("user:42");
  });

  it("cae a IP si no hay cookie de sesion", () => {
    const req = makeReqConCookie({});
    expect(keyPorCuentaOIp(req)).toBe("1.2.3.4");
  });

  it("cae a IP si el token es invalido/expirado", () => {
    vi.mocked(verifyToken).mockReturnValue(null);
    const req = makeReqConCookie({ casa_cultura_session: "token-invalido" });
    expect(keyPorCuentaOIp(req)).toBe("1.2.3.4");
  });

  it("dos usuarios distintos con la misma IP obtienen keys distintas", () => {
    vi.mocked(verifyToken).mockReturnValueOnce({ id: 1, email: null, role: "user", nombre: "A" });
    const reqA = makeReqConCookie({ casa_cultura_session: "token-a" }, "10.0.0.5");
    const keyA = keyPorCuentaOIp(reqA);

    vi.mocked(verifyToken).mockReturnValueOnce({ id: 2, email: null, role: "user", nombre: "B" });
    const reqB = makeReqConCookie({ casa_cultura_session: "token-b" }, "10.0.0.5");
    const keyB = keyPorCuentaOIp(reqB);

    expect(keyA).not.toBe(keyB);
  });
});

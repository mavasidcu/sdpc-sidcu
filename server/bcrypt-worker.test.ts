import { describe, it, expect } from "vitest";
import Piscina from "piscina";
import os from "node:os";
import { fileURLToPath } from "node:url";

function newPool() {
  return new Piscina({
    filename: fileURLToPath(new URL("./workers/bcrypt-worker.mjs", import.meta.url)),
  });
}

describe("bcrypt-worker pool", () => {
  it("is sized to use more than one thread when multiple cores are available", () => {
    const pool = newPool();
    if (os.cpus().length > 1) {
      expect(pool.maxThreads).toBeGreaterThan(1);
    } else {
      expect(pool.maxThreads).toBeGreaterThanOrEqual(1);
    }
  });

  it("hashes and verifies a password correctly via the worker", async () => {
    const pool = newPool();
    const hash = await pool.run({ action: "hash", password: "test123", saltRounds: 10 });
    expect(hash).not.toBe("test123");
    expect(await pool.run({ action: "compare", password: "test123", hash })).toBe(true);
    expect(await pool.run({ action: "compare", password: "wrong", hash })).toBe(false);
  });

  it("rejects an unknown action", async () => {
    const pool = newPool();
    await expect(pool.run({ action: "bogus" })).rejects.toThrow(/unknown action/i);
  });
});

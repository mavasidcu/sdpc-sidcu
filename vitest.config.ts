import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["server/**/*.test.ts"],
    // JWT_SECRET ya no tiene fallback silencioso en server/auth.ts (riesgo
    // de seguridad real -- ver commit). Los tests que importan ese modulo
    // necesitan la variable presente aunque no toquen JWT de verdad.
    env: {
      JWT_SECRET: "test-secret-solo-para-vitest",
    },
  },
});

import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./middleware/auth";
import { generalLimiter, authLimiter, authIpBackstopLimiter } from "./middleware/rateLimiter";

const app = express();
// Railway (y la mayoría de PaaS) ponen la app detrás de un solo proxy reverso.
// Sin esto, req.ip ve la IP del proxy para todos los requests — el rate limiting
// por IP (login/register) queda inútil, todo el tráfico cae en un solo bucket.
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // challenges.cloudflare.com: script + iframe del widget de Turnstile (CAPTCHA de registro).
      // static.cloudflareinsights.com: beacon de analiticas que Cloudflare inyecta
      // solo -- automatico al estar el dominio detras de su proxy, bloquearlo no
      // evita que se inyecte, solo genera ruido de CSP y consumo extra sin sentido.
      scriptSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com", "https://challenges.cloudflare.com", "https://static.cloudflareinsights.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
      fontSrc: ["'self'", "fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "https://challenges.cloudflare.com", "https://cloudflareinsights.com"],
      frameSrc: ["https://challenges.cloudflare.com"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cookieParser());
app.use(express.json({ limit: "50mb" }));

// Health check — Railway/Load Balancer monitorea este endpoint
app.get("/api/health", async (_req, res) => {
  try {
    const { getDb } = await import("./db");
    const { dbCircuitBreaker } = await import("./middleware/circuitBreaker");
    const { sql } = await import("drizzle-orm");
    const d = await getDb();
    await d.execute(sql`SELECT 1`);
    const circuit = dbCircuitBreaker.getState();
    res.json({
      status: "ok",
      uptime: Math.floor(process.uptime()),
      memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      db: circuit.state === "OPEN" ? "degraded" : "connected",
      circuit: circuit.state,
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({ status: "error", db: "disconnected" });
  }
});

app.use("/api/trpc/auth.login", authIpBackstopLimiter, authLimiter);
app.use("/api/trpc/auth.register", authIpBackstopLimiter, authLimiter);

app.use("/api/trpc", generalLimiter);

app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);

if (process.env.NODE_ENV === "production") {
  const path = await import("path");
  app.use(express.static(path.resolve("dist/client")));
  app.get("*", (_req, res) => {
    res.sendFile(path.resolve("dist/client/index.html"));
  });
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

const PORT = parseInt(process.env.PORT || "3000", 10);
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

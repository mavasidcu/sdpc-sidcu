import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { verifyToken } from "../auth";
import { COOKIE_NAME } from "../../shared/const";

export async function createContext({ req, res }: CreateExpressContextOptions) {
  const token = req.cookies?.[COOKIE_NAME];
  const user = token ? verifyToken(token) : null;
  return { req, res, user };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

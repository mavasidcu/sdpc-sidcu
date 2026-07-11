// scripts/seed-load-test-users.mjs — correr una vez antes del load test
import mysql from "mysql2/promise";
import "dotenv/config";
import { hashPassword } from "../server/auth.ts"; // requiere tsx para correr

const db = await mysql.createConnection(process.env.DATABASE_URL);
const hash = await hashPassword("LoadTest12345");
for (let i = 0; i < 300; i++) {
  const curp = `PWTS900101HDF${String(i).padStart(3, "0")}01`;
  await db.query(
    "INSERT IGNORE INTO users (nombre, curp, password_hash, role, is_active) VALUES (?, ?, ?, 'user', 1)",
    [`PWTEST LoadTest ${i}`, curp, hash],
  );
}
console.log("300 usuarios PWTEST_ sembrados");
await db.end();

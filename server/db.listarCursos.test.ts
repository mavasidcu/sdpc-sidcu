import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("listarCursos", () => {
  it("aplica un limite para evitar result sets sin acotar", () => {
    const dbFilePath = path.join(__dirname, "db.ts");
    const content = fs.readFileSync(dbFilePath, "utf-8");

    // Find the listarCursos function and verify it has .limit(500)
    const listarCursosMatch = content.match(
      /export async function listarCursos\([\s\S]*?\.limit\(500\)[\s\S]*?\n\}/
    );

    expect(listarCursosMatch).toBeTruthy();
  });
});

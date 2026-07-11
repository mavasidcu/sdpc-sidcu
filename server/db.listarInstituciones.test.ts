import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("listarInstituciones", () => {
  it("aplica un limite para evitar result sets sin acotar", () => {
    const dbFilePath = path.join(__dirname, "db.ts");
    const content = fs.readFileSync(dbFilePath, "utf-8");

    // Find the listarInstituciones function and verify it has .limit(500)
    const listarInstitucionesMatch = content.match(
      /export async function listarInstituciones\([\s\S]*?\n\}/
    );

    expect(listarInstitucionesMatch).toBeTruthy();
    expect(listarInstitucionesMatch![0]).toContain(".limit(500)");
  });
});

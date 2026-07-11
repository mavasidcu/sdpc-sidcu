export function limpiarTexto(text: string): string {
  return text
    .replace(/�/g, "")
    .replace(/Ã¡/g, "á").replace(/Ã©/g, "é").replace(/Ã­/g, "í").replace(/Ã³/g, "ó").replace(/Ãº/g, "ú")
    .replace(/Ã±/g, "ñ").replace(/Ã¼/g, "ü").replace(/Ã'/g, "Ñ")
    .replace(/Ã\x81/g, "Á").replace(/Ã\x89/g, "É").replace(/Ã\x8D/g, "Í").replace(/Ã\x93/g, "Ó").replace(/Ã\x9A/g, "Ú")
    .trim();
}

export function deduplicarHeaders(headers: string[]): string[] {
  const counts: Record<string, number> = {};
  return headers.map((h) => {
    if (!h) return h;
    counts[h] = (counts[h] ?? 0) + 1;
    return counts[h] === 1 ? h : `${h}_${counts[h]}`;
  });
}

// Parser carácter por carácter: respeta comillas que envuelven saltos de línea
// (celdas multilínea de Excel exportadas a CSV), a diferencia de un split por línea.
export function parseCSVRaw(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else if (inQuotes || current === "") {
        // Solo alterna modo-comillas si está al inicio del campo. Una comilla a media
        // palabra (ej. ANALISTA "B") es texto literal, no un delimitador de campo.
        inQuotes = !inQuotes;
      } else {
        current += ch;
      }
    } else if (ch === "," && !inQuotes) {
      row.push(current);
      current = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(current);
      current = "";
      rows.push(row);
      row = [];
    } else {
      current += ch;
    }
  }
  if (current !== "" || row.length > 0) {
    row.push(current);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

export function parseCSV(text: string): Record<string, string>[] {
  const rows = parseCSVRaw(text.trim());
  if (rows.length < 2) return [];
  // parseCSVRaw ya quita las comillas que envuelven el campo durante el parseo —
  // no volver a recortar comillas aquí, o se come comillas literales del valor (ej. ANALISTA "B").
  const rawHeaders = rows[0].map((h) => limpiarTexto(h));
  const headers = deduplicarHeaders(rawHeaders);
  return rows.slice(1).map((values) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = limpiarTexto(values[i] ?? "");
    });
    return obj;
  });
}

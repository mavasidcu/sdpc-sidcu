// Redondea a 3 decimales y quita ceros de cola -- 9.500 -> "9.5", 3.000 ->
// "3", 4.571 se queda igual (fraccion real no-terminante del puntaje de
// Compañero en Promoción). toFixed(3) primero evita artefactos de punto
// flotante (ej. 2.5709999999...) antes de convertir de vuelta a Number.
export function formatearPuntaje(valor: number): string {
  return Number(valor.toFixed(3)).toString();
}

// Normaliza nombres a "Primera Mayúscula" por palabra: "JUAREZ lopez maria" -> "Juarez Lopez Maria"
export function capitalizarNombre(nombre: string): string {
  return nombre
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((palabra) => (palabra ? palabra.charAt(0).toUpperCase() + palabra.slice(1) : palabra))
    .join(" ");
}

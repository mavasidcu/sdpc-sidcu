// Normaliza nombres a "Primera Mayúscula" por palabra: "JUAREZ lopez maria" -> "Juarez Lopez Maria"
export function capitalizarNombre(nombre: string): string {
  return nombre
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((palabra) => (palabra ? palabra.charAt(0).toUpperCase() + palabra.slice(1) : palabra))
    .join(" ");
}

// Entrada estandar de cada pagina (fadeUp) y de listas dentro de ellas
// (stagger). Antes vivian duplicados literal en ~24 archivos -- centralizado
// aqui para que un solo ajuste de valores se propague a todo el sistema.
//
// Valores suavizados (2026-09-24): wouter desmonta/monta cada pagina en cada
// navegacion, asi que esta animacion se reproduce entera en CADA clic del
// nav -- con opacity:0 de partida y 0.4s de duracion se leia como un
// parpadeo/flash en vez de una transicion, sobre todo navegando rapido entre
// secciones. Partir de opacity 0.6 (nunca pantalla en blanco), menos
// desplazamiento vertical (y:6 en vez de 12) y menor duracion (0.25s) para
// que el realce siga ahi pero deje de sentirse como un parpadeo completo.
export const fadeUp = {
  hidden: { opacity: 0.6, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const } },
};

// staggerChildren: 0 (2026-10-01) -- con 0.05s cada pagina anima 5+ secciones
// (header, stats, graficas, tablas) en cascada secuencial de arriba a abajo,
// se lee como "cargando por partes" en vez de una transicion cohesiva
// (retroalimentacion directa del cliente tras ver el fix de fadeUp en vivo).
// Con delay 0 los mismos hijos fadeUp siguen "realzando" pero casi al mismo
// tiempo, un solo momento coordinado -- sin tocar DashboardLayout.tsx para
// nada, a proposito: el intento anterior de resolver esto con un
// AnimatePresence a nivel de layout competia contra el fadeUp de cada
// pagina (doble capa de animacion, exit+enter sumando tiempo muerto) y no
// mejoro nada en vivo -- este cambio es deliberadamente aislado.
export const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0 } },
};

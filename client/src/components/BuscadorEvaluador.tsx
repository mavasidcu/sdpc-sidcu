import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";

interface BuscadorEvaluadorProps {
  // correoPrellenado SOLO viene de users.email (cuenta SIDCU real) -- nunca
  // del correoSugerido del CSV, sin verificar (decision 2026-09-26, evita
  // que el trabajador confie en un correo que nadie confirmo). El caller
  // decide que hacer si viene null (ej. Promocion.tsx cae a "").
  onElegir: (curp: string, nombre: string, correoPrellenado: string | null) => void;
  placeholder?: string;
  rol: "jefe" | "companero";
  excluirUserId?: number;
}

// Mismo look que ComboInput, pero busca en el servidor en vez de filtrar una
// lista precargada -- ComboInput carga TODAS las opciones al cliente, no
// escala a miles de personas (ver spec, seccion "Frontend admin"). Antes
// tambien soportaba una busqueda sin `rol` (todo el padron, para el admin) --
// se quito (M3, revision final de rama): esa variante (buscarEvaluador) ya no
// tenia ningun caller real, todos pasan rol y usan el pool curado.
const ETIQUETA_ROL: Record<"jefe" | "companero", string> = { jefe: "Jefes", companero: "Compañeros" };

export default function BuscadorEvaluador({ onElegir, placeholder, rol, excluirUserId }: BuscadorEvaluadorProps) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: resultados } = trpc.promocion.buscarEnPool.useQuery({ q, rol, excluirUserId }, { enabled: q.length >= 2 });
  // Distingue "catálogo vacío" (nadie de este rol cargado por el admin
  // todavía) de "sin coincidencias para esta búsqueda" (catálogo con gente,
  // solo no encontró lo que escribiste) -- antes ambos casos se veían
  // igual (dropdown vacío, sin ningún mensaje). Se consulta una sola vez al
  // abrir, independiente de lo que se escriba.
  const { data: tieneRegistros } = trpc.promocion.poolTieneRegistros.useQuery({ rol }, { enabled: open });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder ?? "Buscar por nombre o CURP..."}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
      />
      {open && tieneRegistros === false && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-gray-500 shadow-lg">
          Todavía no hay {ETIQUETA_ROL[rol]} cargados en el catálogo. Contacta al administrador.
        </div>
      )}
      {open && tieneRegistros !== false && q.length >= 2 && resultados && resultados.length === 0 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-gray-500 shadow-lg">
          No se encontró nadie con ese nombre o CURP.
        </div>
      )}
      {open && tieneRegistros !== false && q.length >= 2 && resultados && resultados.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {resultados.map((r) => (
            <button
              key={r.curp}
              type="button"
              onClick={() => { onElegir(r.curp, r.nombre, r.correoPrellenado); setQ(""); setOpen(false); }}
              className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <span className="font-medium text-slate-700">{r.nombre}</span>
              <span className="text-xs text-slate-400">{r.curp}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

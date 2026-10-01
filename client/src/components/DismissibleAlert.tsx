import { motion } from "framer-motion";
import { X, type LucideIcon } from "lucide-react";
import { fadeUp } from "@/lib/animations";

interface DismissibleAlertProps {
  mensaje: string;
  onCerrar: () => void;
  accion?: { label: string; onClick: () => void; icon?: LucideIcon };
}

export default function DismissibleAlert({ mensaje, onCerrar, accion }: DismissibleAlertProps) {
  const AccionIcon = accion?.icon;
  return (
    <motion.div
      variants={fadeUp}
      role="alert"
      className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex-1">{mensaje}</span>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="shrink-0 text-rose-400 hover:text-rose-600"
        >
          <X size={14} />
        </button>
      </div>
      {accion && (
        <button
          type="button"
          onClick={accion.onClick}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold underline"
        >
          {AccionIcon && <AccionIcon size={12} />}
          {accion.label}
        </button>
      )}
    </motion.div>
  );
}

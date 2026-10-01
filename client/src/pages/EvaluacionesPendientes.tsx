import { motion } from "framer-motion";
import { stagger, fadeUp } from "@/lib/animations";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { ClipboardList, ChevronRight } from "lucide-react";

const ROL_LABELS: Record<string, string> = {
  jefe: "Jefe inmediato",
  companero1: "Compañero",
  companero2: "Compañero",
};

export default function EvaluacionesPendientes() {
  const { data, isLoading } = trpc.evaluadores.misPendientes.useQuery();

  if (isLoading || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={fadeUp}>
        <h1 className="text-2xl font-bold text-gray-900">Evaluaciones pendientes</h1>
      </motion.div>

      {data.length === 0 && (
        <motion.div variants={fadeUp} className="rounded-2xl bg-white p-8 text-center shadow-card-rest border border-gray-100">
          <ClipboardList className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 font-medium text-gray-700">No tienes evaluaciones pendientes</p>
        </motion.div>
      )}

      {data.map((ev) => (
        <motion.div key={ev.evaluacionId} variants={fadeUp}>
          <Link
            href={`/portal/evaluaciones/${ev.evaluacionId}`}
            className="flex items-center justify-between rounded-2xl bg-white p-5 shadow-card-rest border border-gray-100 hover:border-primary-200 transition-colors"
          >
            <div>
              <p className="font-semibold text-gray-800">{ev.nombreEvaluado}</p>
              <p className="text-sm text-gray-500">{ROL_LABELS[ev.rol] ?? ev.rol}</p>
              {ev.fechaLimite && (
                <p className="mt-1 text-xs text-amber-600">
                  Vence: {new Date(ev.fechaLimite).toLocaleDateString("es-MX", { day: "numeric", month: "long" })}
                </p>
              )}
            </div>
            <ChevronRight className="h-5 w-5 text-gray-400" />
          </Link>
        </motion.div>
      ))}
    </motion.div>
  );
}

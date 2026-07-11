import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, LogOut, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";
import ConfirmModal from "@/components/ConfirmModal";

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
};

function formatFecha(date: string | Date | null) {
  if (!date) return "Nunca";
  const d = new Date(date);
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SolicitudesBajaSection() {
  const { data: bajas, isLoading } = trpc.perfil.listarBajas.useQuery();
  const utils = trpc.useUtils();
  const [confirmBaja, setConfirmBaja] = useState<{ userId: number; nombre: string } | null>(null);

  const aprobarMut = trpc.perfil.aprobarBaja.useMutation({
    onSuccess: () => {
      utils.perfil.listarBajas.invalidate();
      utils.usuarios.listar.invalidate();
    },
  });

  if (isLoading || !bajas?.length) return null;

  return (
    <motion.div variants={fadeUp} className="rounded-2xl border border-amber-200/60 bg-amber-50/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle size={16} className="text-amber-600" />
        <h2 className="text-sm font-bold text-amber-800">
          Solicitudes de Baja ({bajas.length})
        </h2>
      </div>
      <div className="space-y-2">
        {(bajas as any[]).map((item) => {
          const perfil = item.perfiles_servidor;
          const user = item.users;
          return (
            <div
              key={perfil.id}
              className="flex items-center justify-between rounded-xl border border-amber-200/60 bg-white p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800">{user.nombre}</p>
                <p className="text-xs text-slate-400">{user.email} — {perfil.cargo}</p>
                <p className="mt-1 text-xs text-amber-700">
                  <LogOut size={10} className="mr-1 inline" />
                  {perfil.motivoBaja}
                </p>
                {perfil.fechaSolicitudBaja && (
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    Solicitado: {formatFecha(perfil.fechaSolicitudBaja)}
                  </p>
                )}
              </div>
              <button
                onClick={() => setConfirmBaja({ userId: perfil.userId, nombre: user.nombre })}
                disabled={aprobarMut.isPending}
                className="ml-3 flex shrink-0 items-center gap-1.5 rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-600 disabled:opacity-50 transition-colors"
              >
                <Check size={12} />
                Aprobar baja
              </button>
            </div>
          );
        })}
      </div>

      <ConfirmModal
        open={!!confirmBaja}
        title="Aprobar baja"
        message={`¿Aprobar baja de "${confirmBaja?.nombre ?? ""}"? Se desactivará su cuenta y registro de servidor.`}
        confirmLabel="Aprobar baja"
        variant="danger"
        loading={aprobarMut.isPending}
        onConfirm={() => {
          if (confirmBaja) {
            aprobarMut.mutate({ userId: confirmBaja.userId }, { onSuccess: () => setConfirmBaja(null) });
          }
        }}
        onCancel={() => setConfirmBaja(null)}
      />
    </motion.div>
  );
}

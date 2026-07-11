import { useState } from "react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import {
  ClipboardList,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  FileText,
  Plus,
  Pencil,
  Trash2,
  X,
  Eye,
} from "lucide-react";

const ACCION_CONFIG: Record<string, { icon: React.ElementType; bg: string; text: string; label: string }> = {
  crear: { icon: Plus, bg: "bg-emerald-50", text: "text-emerald-600", label: "Creado" },
  actualizar: { icon: Pencil, bg: "bg-amber-50", text: "text-amber-600", label: "Actualizado" },
  eliminar: { icon: Trash2, bg: "bg-rose-50", text: "text-rose-600", label: "Eliminado" },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
};

function formatFecha(date: string | Date) {
  const d = new Date(date);
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTimeAgo(date: string | Date) {
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return "Ahora";
  if (mins < 60) return `hace ${mins}m`;
  if (hours < 24) return `hace ${hours}h`;
  if (days < 7) return `hace ${days}d`;
  return formatFecha(date);
}

export default function Auditoria() {
  const [page, setPage] = useState(1);
  const [accionFilter, setAccionFilter] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [detailItem, setDetailItem] = useState<any>(null);

  const { data, isLoading } = trpc.servidores.auditoria.useQuery(
    {
      page,
      limit: 15,
      accion: accionFilter || undefined,
      search: searchTerm || undefined,
    },
    { retry: false, placeholderData: (prev: any) => prev }
  );

  const filteredItems = data?.items ?? [];

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={fadeUp} className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Auditoría
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Historial de cambios en servidores públicos
          </p>
        </div>
        <div className="hidden items-center gap-2 rounded-xl bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-600 sm:flex">
          <ClipboardList size={14} />
          {data?.total ?? 0} registros
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div
        variants={fadeUp}
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar en descripciones..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-700 placeholder-slate-400 outline-none transition-all focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
          />
        </div>

        <div className="flex gap-2">
          {["", "crear", "actualizar", "eliminar"].map((accion) => {
            const active = accionFilter === accion;
            const label = accion
              ? ACCION_CONFIG[accion]?.label ?? accion
              : "Todos";
            return (
              <button
                key={accion}
                onClick={() => {
                  setAccionFilter(accion);
                  setPage(1);
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  active
                    ? "bg-primary-500 text-white shadow-sm shadow-primary-500/25"
                    : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Timeline */}
      {isLoading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-slate-200 border-t-primary-500" />
        </div>
      ) : filteredItems.length === 0 ? (
        <motion.div
          variants={fadeUp}
          className="flex flex-col items-center py-16 text-center"
        >
          <div className="rounded-2xl bg-slate-50 p-5">
            <ClipboardList size={28} className="text-slate-300" />
          </div>
          <p className="mt-4 text-sm font-medium text-slate-400">
            Sin registros de auditoría
          </p>
        </motion.div>
      ) : (
        <motion.div variants={fadeUp} className="space-y-2">
          {filteredItems.map((item: any, index: number) => {
            const config = ACCION_CONFIG[item.accion] ?? {
              icon: FileText,
              bg: "bg-slate-50",
              text: "text-slate-500",
              label: item.accion,
            };
            const Icon = config.icon;

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.03, duration: 0.3 }}
                className="group relative flex gap-4 rounded-2xl border border-slate-200/60 bg-white p-4 shadow-card-rest transition-all hover:shadow-card-hover hover:border-slate-200"
              >
                {/* Icon */}
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${config.bg}`}>
                  <Icon size={16} className={config.text} />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${config.bg} ${config.text}`}
                        >
                          {config.label}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          ID Servidor: {item.servidorId}
                        </span>
                      </div>
                      <p className="mt-1.5 truncate text-sm text-slate-700">
                        {item.descripcion ?? `Acción: ${item.accion}`}
                      </p>
                    </div>

                    <button
                      onClick={() => setDetailItem(item)}
                      className="shrink-0 rounded-lg p-1.5 text-slate-400 opacity-0 transition-all hover:bg-slate-50 hover:text-primary-500 group-hover:opacity-100"
                      title="Ver detalles"
                    >
                      <Eye size={14} />
                    </button>
                  </div>

                  <div className="mt-2 flex items-center gap-4 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <User size={11} />
                      Usuario #{item.usuarioId}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      {formatTimeAgo(item.createdAt)}
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <motion.div
          variants={fadeUp}
          className="flex items-center justify-between rounded-2xl border border-slate-200/60 bg-white px-4 py-3 shadow-card-rest"
        >
          <p className="text-xs text-slate-400">
            Página {data.page} de {data.totalPages} · {data.total} registros
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>

            {Array.from({ length: Math.min(5, data.totalPages) }, (_, i) => {
              let pageNum: number;
              if (data.totalPages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= data.totalPages - 2) {
                pageNum = data.totalPages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`h-8 w-8 rounded-lg text-xs font-semibold transition-all ${
                    page === pageNum
                      ? "bg-primary-500 text-white shadow-sm shadow-primary-500/25"
                      : "text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page >= data.totalPages}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </motion.div>
      )}

      {/* Detail modal */}
      {detailItem && (
        <DetailModal item={detailItem} onClose={() => setDetailItem(null)} />
      )}
    </motion.div>
  );
}

function DetailModal({ item, onClose }: { item: any; onClose: () => void }) {
  const config = ACCION_CONFIG[item.accion] ?? {
    icon: FileText,
    bg: "bg-slate-50",
    text: "text-slate-500",
    label: item.accion,
  };

  let cambiosAntes: any = null;
  let cambiosDespues: any = null;
  try {
    if (item.cambiosAnteriores) cambiosAntes = JSON.parse(item.cambiosAnteriores);
  } catch {}
  try {
    if (item.cambiosPosterior) cambiosDespues = JSON.parse(item.cambiosPosterior);
  } catch {}

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="mx-4 w-full max-w-lg rounded-2xl border border-slate-200/60 bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className={`inline-flex rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${config.bg} ${config.text}`}>
              {config.label}
            </span>
            <span className="text-sm font-semibold text-slate-700">
              Detalle de auditoría
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] space-y-4 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3">
            <InfoField label="ID Registro" value={`#${item.id}`} />
            <InfoField label="ID Servidor" value={`#${item.servidorId}`} />
            <InfoField label="Usuario" value={`#${item.usuarioId}`} />
            <InfoField label="Fecha" value={formatFecha(item.createdAt)} />
          </div>

          {item.descripcion && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Descripción
              </p>
              <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
                {item.descripcion}
              </p>
            </div>
          )}

          {cambiosAntes && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-rose-400">
                Estado anterior
              </p>
              <pre className="max-h-40 overflow-auto rounded-xl bg-rose-50 px-3 py-2.5 text-xs text-rose-700">
                {JSON.stringify(cambiosAntes, null, 2)}
              </pre>
            </div>
          )}

          {cambiosDespues && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
                Estado posterior
              </p>
              <pre className="max-h-40 overflow-auto rounded-xl bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700">
                {JSON.stringify(cambiosDespues, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-5 py-3">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-slate-100 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200"
          >
            Cerrar
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium text-slate-700">{value}</p>
    </div>
  );
}

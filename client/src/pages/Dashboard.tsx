import { useEffect } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  Users,
  UserCheck,
  UserX,
  Building2,
  TrendingUp,
  Activity,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const NIVEL_LABELS: Record<string, string> = {
  federal: "Federal",
  estatal: "Estatal",
  municipal: "Municipal",
  otro: "Otro",
};

const GRUPO_LABELS: Record<string, string> = {
  ADMO: "Administrativo",
  TECN: "Técnico",
  SERV: "Servicios",
  COMUN: "Comunicación",
  PROFE: "Profesional",
  EDU: "Educación",
};

const CHART_COLORS = ["#6366f1", "#8b5cf6", "#3b82f6", "#06b6d4", "#10b981", "#f59e0b"];

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

function StatCard({
  label,
  value,
  icon: Icon,
  gradient,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  gradient: string;
}) {
  return (
    <motion.div
      variants={fadeUp}
      className="group relative h-full overflow-hidden rounded-2xl border border-slate-200/60 bg-white p-5 shadow-card-rest transition-shadow hover:shadow-card-hover"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-label">
            {label}
          </p>
          <p className="text-stat mt-2 text-slate-900">
            {value}
          </p>
        </div>
        <div className={`rounded-xl p-2.5 ${gradient} shadow-lg`}>
          <Icon size={18} className="text-white" />
        </div>
      </div>
      <div className="absolute -bottom-4 -right-4 h-24 w-24 rounded-full bg-gradient-to-br from-slate-100 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
    </motion.div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      variants={fadeUp}
      className="h-full rounded-2xl border border-slate-200/60 bg-white p-5 shadow-card-rest"
    >
      <h3 className="text-section-title mb-4 text-slate-700">
        {title}
      </h3>
      {children}
    </motion.div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const canViewStats = user && ["admin", "capturista", "consultor"].includes(user.role);
  const isUserRole = user?.role === "user";

  const { data: perfil, isLoading: perfilLoading } = trpc.perfil.obtener.useQuery(undefined, {
    enabled: isUserRole,
    retry: false,
  });

  useEffect(() => {
    if (!isUserRole || perfilLoading) return;
    if (perfil?.completado) {
      navigate("/portal");
    } else {
      navigate("/onboarding");
    }
  }, [isUserRole, perfil, perfilLoading, navigate]);

  const { data: stats, isLoading } = trpc.servidores.estadisticas.useQuery(
    undefined,
    { enabled: !!canViewStats, retry: false }
  );

  const activos = stats?.byEstatus.find((e) => e.estatus === "activo")?.count ?? 0;
  const inactivos = stats?.byEstatus.find((e) => e.estatus === "inactivo")?.count ?? 0;

  const nivelData = (stats?.byNivel ?? []).map((n) => ({
    name: NIVEL_LABELS[n.nivel] ?? n.nivel,
    value: Number(n.count),
  }));

  const grupoData = (stats?.byGrupo ?? []).map((g) => ({
    name: GRUPO_LABELS[g.grupoFuncion] ?? g.grupoFuncion,
    value: Number(g.count),
  }));

  if (!canViewStats) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-slate-200 border-t-primary-500" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-slate-200 border-t-primary-500" />
      </div>
    );
  }

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
            Dashboard
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Resumen del registro de servidores públicos
          </p>
        </div>
        <div className="hidden items-center gap-2 rounded-xl bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-600 sm:flex">
          <Activity size={14} />
          En tiempo real
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total"
          value={stats?.total ?? 0}
          icon={Users}
          gradient="bg-gradient-to-br from-primary-500 to-primary-600 shadow-primary-500/25"
        />
        <StatCard
          label="Activos"
          value={activos}
          icon={UserCheck}
          gradient="bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/25"
        />
        <StatCard
          label="Inactivos"
          value={inactivos}
          icon={UserX}
          gradient="bg-gradient-to-br from-rose-500 to-rose-600 shadow-rose-500/25"
        />
        <StatCard
          label="Sol. Activas"
          value={stats?.solicitudesActivas ?? 0}
          icon={Building2}
          gradient="bg-gradient-to-br from-accent-500 to-accent-600 shadow-accent-500/25"
        />
      </div>

      {/* Charts */}
      <div className="bento-grid">
        <div className="bento-md">
        <ChartCard title="Distribución por nivel de gobierno">
          {nivelData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={nivelData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={4}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {nivelData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                    fontSize: "13px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
          {nivelData.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-3">
              {nivelData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs text-slate-500">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                  />
                  {d.name} ({d.value})
                </div>
              ))}
            </div>
          )}
        </ChartCard>
        </div>

        <div className="bento-md">
        <ChartCard title="Servidores por grupo de función">
          {grupoData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={grupoData} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  width={95}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                    fontSize: "13px",
                  }}
                />
                <Bar dataKey="value" name="Servidores" radius={[0, 6, 6, 0]}>
                  {grupoData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </ChartCard>
        </div>
      </div>
    </motion.div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-[250px] flex-col items-center justify-center text-center">
      <div className="rounded-2xl bg-slate-50 p-4">
        <TrendingUp size={22} className="text-slate-300" />
      </div>
      <p className="mt-3 text-sm text-slate-400">
        Sin datos para mostrar
      </p>
    </div>
  );
}

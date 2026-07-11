import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import {
  BarChart3,
  PieChart as PieIcon,
  TrendingUp,
  Building2,
  Users,
  UserCheck,
  UserX,
  Download,
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
  AreaChart,
  Area,
  Legend,
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

const MES_LABELS: Record<string, string> = {
  "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic",
};

const CHART_COLORS = ["#6366f1", "#8b5cf6", "#3b82f6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#14b8a6", "#f97316"];

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

const tooltipStyle = {
  borderRadius: "12px",
  border: "1px solid #e2e8f0",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  fontSize: "13px",
};

function StatCard({
  label,
  value,
  icon: Icon,
  gradient,
  subtitle,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  gradient: string;
  subtitle?: string;
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
          {subtitle && (
            <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
          )}
        </div>
        <div className={`rounded-xl p-2.5 ${gradient} shadow-lg`}>
          <Icon size={18} className="text-white" />
        </div>
      </div>
    </motion.div>
  );
}

function ChartCard({
  title,
  icon: Icon,
  children,
  className = "",
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={fadeUp}
      className={`h-full rounded-2xl border border-slate-200/60 bg-white p-5 shadow-card-rest ${className}`}
    >
      <div className="mb-4 flex items-center gap-2">
        <Icon size={16} className="text-primary-500" />
        <h3 className="text-section-title text-slate-700">{title}</h3>
      </div>
      {children}
    </motion.div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-[280px] flex-col items-center justify-center text-center">
      <div className="rounded-2xl bg-slate-50 p-4">
        <TrendingUp size={22} className="text-slate-300" />
      </div>
      <p className="mt-3 text-sm text-slate-400">Sin datos para mostrar</p>
    </div>
  );
}

export default function Reportes() {
  const { data: stats, isLoading } = trpc.servidores.estadisticas.useQuery(
    undefined,
    { retry: false }
  );

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-slate-200 border-t-primary-500" />
      </div>
    );
  }

  const activos = stats?.byEstatus?.find((e: any) => e.estatus === "activo")?.count ?? 0;
  const inactivos = stats?.byEstatus?.find((e: any) => e.estatus === "inactivo")?.count ?? 0;
  const total = stats?.total ?? 0;
  const porcentajeActivos = total > 0 ? Math.round((Number(activos) / Number(total)) * 100) : 0;

  const nivelData = (stats?.byNivel ?? []).map((n: any) => ({
    name: NIVEL_LABELS[n.nivel] ?? n.nivel,
    value: Number(n.count),
  }));

  const grupoData = (stats?.byGrupo ?? []).map((g: any) => ({
    name: GRUPO_LABELS[g.grupoFuncion] ?? g.grupoFuncion,
    value: Number(g.count),
  }));

  const dependenciaData = ((stats as any)?.byDependencia ?? []).map((d: any) => ({
    name: d.dependencia?.length > 20 ? d.dependencia.slice(0, 20) + "…" : d.dependencia,
    fullName: d.dependencia,
    value: Number(d.count),
  }));

  const mesData = ((stats as any)?.byMes ?? []).map((m: any) => {
    const [year, month] = (m.mes as string).split("-");
    return {
      name: `${MES_LABELS[month] ?? month} ${year?.slice(2)}`,
      value: Number(m.count),
    };
  });

  const estatusData = [
    { name: "Activos", value: Number(activos), color: "#10b981" },
    { name: "Inactivos", value: Number(inactivos), color: "#ef4444" },
  ];

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
            Reportes
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Análisis y distribución de servidores públicos
          </p>
        </div>
        <div className="hidden items-center gap-2 rounded-xl bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-600 sm:flex">
          <BarChart3 size={14} />
          {total} registros analizados
        </div>
      </motion.div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total registrados"
          value={total}
          icon={Users}
          gradient="bg-gradient-to-br from-primary-500 to-primary-600 shadow-primary-500/25"
        />
        <StatCard
          label="Activos"
          value={activos}
          icon={UserCheck}
          gradient="bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/25"
          subtitle={`${porcentajeActivos}% del total`}
        />
        <StatCard
          label="Inactivos"
          value={inactivos}
          icon={UserX}
          gradient="bg-gradient-to-br from-rose-500 to-rose-600 shadow-rose-500/25"
          subtitle={`${100 - porcentajeActivos}% del total`}
        />
        <StatCard
          label="Dependencias"
          value={dependenciaData.length}
          icon={Building2}
          gradient="bg-gradient-to-br from-accent-500 to-accent-600 shadow-accent-500/25"
          subtitle="Instituciones registradas"
        />
      </div>

      {/* Row 1: Estatus pie + Nivel pie */}
      <div className="bento-grid">
        <div className="bento-md">
        <ChartCard title="Distribución por estatus" icon={PieIcon}>
          {estatusData.some((d) => d.value > 0) ? (
            <>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={estatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={105}
                    paddingAngle={4}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {estatusData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend
                    verticalAlign="bottom"
                    formatter={(value: string) => (
                      <span className="text-xs text-slate-600">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
        </div>

        <div className="bento-md">
        <ChartCard title="Distribución por nivel de gobierno" icon={PieIcon}>
          {nivelData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={nivelData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={105}
                    paddingAngle={4}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {nivelData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 flex flex-wrap gap-3">
                {nivelData.map((d: any, i: number) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs text-slate-500">
                    <div
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                    {d.name} ({d.value})
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
        </div>
      </div>

      {/* Row 2: Grupo función bar */}
      <ChartCard title="Servidores por grupo de función" icon={BarChart3}>
        {grupoData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={grupoData} margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" name="Servidores" radius={[8, 8, 0, 0]}>
                {grupoData.map((_: any, i: number) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart />
        )}
      </ChartCard>

      {/* Row 3: Tendencia mensual + Top dependencias */}
      <div className="bento-grid">
        <div className="bento-md">
        <ChartCard title="Tendencia de registro mensual" icon={TrendingUp}>
          {mesData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={mesData} margin={{ left: 0, right: 10 }}>
                <defs>
                  <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Area
                  type="monotone"
                  dataKey="value"
                  name="Registros"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  fill="url(#areaGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
        </div>

        <div className="bento-md">
        <ChartCard title="Top dependencias" icon={Building2}>
          {dependenciaData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={dependenciaData} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  width={130}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: number) => [value, "Servidores"]}
                  labelFormatter={(label: string) => {
                    const item = dependenciaData.find((d: any) => d.name === label);
                    return item?.fullName ?? label;
                  }}
                />
                <Bar dataKey="value" name="Servidores" radius={[0, 6, 6, 0]}>
                  {dependenciaData.map((_: any, i: number) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
        </div>
      </div>
    </motion.div>
  );
}

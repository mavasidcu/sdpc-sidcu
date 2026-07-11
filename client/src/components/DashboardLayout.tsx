import { type ReactNode, useState, useEffect, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";
import {
  LayoutDashboard,
  Users,
  UserCog,
  Upload,
  FileUp,
  FileText,
  ClipboardList,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Home,
  BookOpen,
  ClipboardCheck,
  GraduationCap,
  Building,
  Inbox,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles: string[];
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["admin", "capturista", "consultor"] },
  { label: "Portal", href: "/portal", icon: Home, roles: ["user"] },
  { label: "Catálogo Cursos", href: "/portal/cursos", icon: BookOpen, roles: ["user"] },
  { label: "Mis Solicitudes", href: "/portal/solicitudes", icon: ClipboardCheck, roles: ["user"] },
  { label: "Servidores", href: "/servidores", icon: Users, roles: ["admin", "capturista"] },
  { label: "Importar CSV", href: "/importar", icon: FileUp, roles: ["admin", "capturista"] },
  // { label: "Archivos", href: "/archivos", icon: Upload, roles: ["admin", "capturista"] }, // En construcción
  { label: "Cursos", href: "/cursos", icon: GraduationCap, roles: ["admin"] },
  { label: "Instituciones", href: "/instituciones", icon: Building, roles: ["admin"] },
  { label: "Solicitudes", href: "/solicitudes", icon: Inbox, roles: ["admin"] },
  { label: "Usuarios", href: "/usuarios", icon: UserCog, roles: ["admin"] },
  { label: "Auditoría", href: "/auditoria", icon: ClipboardList, roles: ["admin"] },
  { label: "Reportes", href: "/reportes", icon: FileText, roles: ["admin", "consultor"] },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  capturista: "Capturista",
  consultor: "Consultor",
  user: "Usuario",
};

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [location, navigate] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showIdleWarn, setShowIdleWarn] = useState(false);

  const role = user?.role ?? "user";
  const visibleItems = navItems.filter((item) => item.roles.includes(role));

  const { data: perfil, isLoading: perfilLoading } = trpc.perfil.obtener.useQuery(undefined, {
    enabled: role === "user",
  });

  useEffect(() => {
    if (role !== "user" || perfilLoading) return;
    if (!perfil?.completado && location !== "/onboarding") {
      navigate("/onboarding");
    }
  }, [role, perfil, perfilLoading, location]);

  const handleLogout = useCallback(async () => {
    await logout();
    window.location.href = "/";
  }, [logout]);

  const handleIdleLogout = useCallback(async () => {
    setShowIdleWarn(false);
    await logout();
    window.location.href = "/?idle=1";
  }, [logout]);

  useIdleTimeout(
    handleIdleLogout,
    () => setShowIdleWarn(true),
    () => setShowIdleWarn(false),
  );

  if (role === "user" && !perfilLoading && !perfil?.completado && location !== "/onboarding") {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Idle warning modal */}
      {showIdleWarn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-1 text-2xl">⏱️</div>
            <h2 className="mb-1 text-lg font-bold text-slate-800">¿Sigues ahí?</h2>
            <p className="mb-5 text-sm text-slate-500">
              Tu sesión se cerrará en 1 minuto por inactividad.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowIdleWarn(false)}
                className="flex-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
              >
                Continuar sesión
              </button>
              <button
                onClick={handleIdleLogout}
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex flex-col bg-primary-500 transition-all duration-300 lg:static lg:translate-x-0 ${
          collapsed ? "lg:w-18" : "lg:w-60"
        } w-60 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Logo + toggle */}
        <div className={`flex h-16 items-center ${collapsed ? "justify-center px-2" : "px-4"}`}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-500 text-micro font-extrabold text-white shadow-md shadow-black/20">
            SC
          </div>
          {!collapsed && (
            <div className="ml-3 min-w-0 flex-1">
              <span className="block text-[13px] font-bold text-white leading-tight">
                Secretaría<br />de Cultura
              </span>
              <span className="block text-micro font-medium text-white/50">
                Panel de gestión
              </span>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex ml-1 h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15 text-white/70 hover:bg-white/25 hover:text-white transition-colors"
          >
            {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
          </button>
        </div>

        <div className={`h-px bg-white/10 ${collapsed ? "mx-3" : "mx-4"}`} />

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3 scrollbar-none">
          {visibleItems.map((item) => {
            const active = location === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                title={collapsed ? item.label : undefined}
                className={`group flex items-center rounded-lg transition-all ${
                  collapsed ? "justify-center px-2 py-2.5" : "gap-2.5 px-3 py-2"
                } text-[13px] font-medium ${
                  active
                    ? "bg-white/15 text-white font-semibold shadow-sm shadow-black/10"
                    : "text-white/70 hover:bg-white/12 hover:text-white"
                }`}
              >
                <Icon
                  size={collapsed ? 18 : 16}
                  className={`shrink-0 ${active ? "text-white" : "text-white/50 group-hover:text-white/70"}`}
                />
                {!collapsed && item.label}
                {!collapsed && active && (
                  <div className="ml-auto h-1.5 w-1.5 rounded-full bg-white" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className={`border-t border-white/10 ${collapsed ? "p-2" : "p-3"}`}>
          {collapsed ? (
            <>
              <div className="flex justify-center mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-500 text-micro font-bold text-white" title={user?.nombre ?? "Usuario"}>
                  {user?.nombre?.charAt(0)?.toUpperCase() ?? "U"}
                </div>
              </div>
              <button
                onClick={handleLogout}
                title="Cerrar sesión"
                className="flex w-full justify-center rounded-lg py-1.5 text-white/40 hover:bg-white/12 hover:text-rose-300 transition-colors"
              >
                <LogOut size={14} />
              </button>
            </>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-2.5 rounded-lg bg-white/12 px-2.5 py-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-500 text-micro font-bold text-white">
                  {user?.nombre?.charAt(0)?.toUpperCase() ?? "U"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-white">
                    {user?.nombre}
                  </p>
                  <p className="text-micro font-medium text-white/50">
                    {ROLE_LABELS[role] ?? role}
                  </p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-caption font-medium text-white/50 transition-colors hover:bg-white/12 hover:text-rose-300"
              >
                <LogOut size={14} />
                Cerrar sesión
              </button>
            </>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
        <header className="flex h-14 items-center gap-4 border-b border-slate-200/80 bg-white px-5 lg:hidden">
          <button onClick={() => setSidebarOpen(true)} className="text-slate-600">
            <Menu size={22} />
          </button>
          <span className="text-sm font-bold text-slate-800">Secretaría de Cultura</span>
        </header>
        <main className="flex-1 min-w-0 overflow-y-auto p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

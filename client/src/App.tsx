import { Component, type ReactNode } from "react";
import { Route, Switch, Redirect, useLocation } from "wouter";
import { useAuthState } from "@/hooks/useAuth";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import Home from "@/pages/Home";
import RecuperarContrasena from "@/pages/RecuperarContrasena";
import RestablecerContrasena from "@/pages/RestablecerContrasena";
import NotFound from "@/pages/NotFound";
import Servidores from "@/pages/Servidores";
import Dashboard from "@/pages/Dashboard";
import Auditoria from "@/pages/Auditoria";
import Reportes from "@/pages/Reportes";
import Importacion from "@/pages/Importacion";
import Usuarios from "@/pages/Usuarios";
import Onboarding from "@/pages/Onboarding";
import Portal from "@/pages/Portal";
import CatalogoCursos from "@/pages/CatalogoCursos";
import MisSolicitudes from "@/pages/MisSolicitudes";
import GestionCursos from "@/pages/GestionCursos";
import Instituciones from "@/pages/Instituciones";
import GestionSolicitudes from "@/pages/GestionSolicitudes";

class PageErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-sm font-semibold text-rose-500">Error al cargar la sección</p>
          <p className="mt-1 text-xs text-slate-400">{(this.state.error as Error).message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-4 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      <p className="mt-2 text-gray-500">Esta sección está en construcción.</p>
    </div>
  );
}

function ProtectedRoute({
  component: Component,
  path: routePath,
  isAuthenticated,
  isLoading,
}: {
  component: React.ComponentType<any>;
  path: string;
  isAuthenticated: boolean;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Route path={routePath}>
        <div className="flex h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
        </div>
      </Route>
    );
  }

  if (!isAuthenticated) {
    return (
      <Route path={routePath}>
        <Redirect to="/" />
      </Route>
    );
  }

  return (
    <Route path={routePath}>
      <DashboardLayout>
        <PageErrorBoundary>
          <Component />
        </PageErrorBoundary>
      </DashboardLayout>
    </Route>
  );
}

function AuthRoute({ isAuthenticated, isLoading }: { isAuthenticated: boolean; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Redirect to="/dashboard" />;
  }

  return <Home />;
}

export default function App() {
  const { isAuthenticated, isLoading } = useAuthState();

  return (
    <ThemeProvider>
      <Switch>
        <Route path="/">
          <AuthRoute isAuthenticated={isAuthenticated} isLoading={isLoading} />
        </Route>
        <ProtectedRoute
          path="/dashboard"
          component={Dashboard}
          isAuthenticated={isAuthenticated}
          isLoading={isLoading}
        />
        <ProtectedRoute
          path="/servidores"
          component={Servidores}
          isAuthenticated={isAuthenticated}
          isLoading={isLoading}
        />
        <ProtectedRoute
          path="/archivos"
          component={() => <PlaceholderPage title="Carga de Archivos" />}
          isAuthenticated={isAuthenticated}
          isLoading={isLoading}
        />
        <ProtectedRoute
          path="/usuarios"
          component={Usuarios}
          isAuthenticated={isAuthenticated}
          isLoading={isLoading}
        />
        <ProtectedRoute
          path="/importar"
          component={Importacion}
          isAuthenticated={isAuthenticated}
          isLoading={isLoading}
        />
        <ProtectedRoute
          path="/auditoria"
          component={Auditoria}
          isAuthenticated={isAuthenticated}
          isLoading={isLoading}
        />
        <ProtectedRoute
          path="/reportes"
          component={Reportes}
          isAuthenticated={isAuthenticated}
          isLoading={isLoading}
        />
        <ProtectedRoute
          path="/onboarding"
          component={Onboarding}
          isAuthenticated={isAuthenticated}
          isLoading={isLoading}
        />
        <ProtectedRoute
          path="/cursos"
          component={GestionCursos}
          isAuthenticated={isAuthenticated}
          isLoading={isLoading}
        />
        <ProtectedRoute
          path="/instituciones"
          component={Instituciones}
          isAuthenticated={isAuthenticated}
          isLoading={isLoading}
        />
        <ProtectedRoute
          path="/solicitudes"
          component={GestionSolicitudes}
          isAuthenticated={isAuthenticated}
          isLoading={isLoading}
        />
        <ProtectedRoute
          path="/portal/cursos"
          component={CatalogoCursos}
          isAuthenticated={isAuthenticated}
          isLoading={isLoading}
        />
        <ProtectedRoute
          path="/portal/solicitudes"
          component={MisSolicitudes}
          isAuthenticated={isAuthenticated}
          isLoading={isLoading}
        />
        <ProtectedRoute
          path="/portal"
          component={Portal}
          isAuthenticated={isAuthenticated}
          isLoading={isLoading}
        />
        <Route path="/recuperar-contrasena" component={RecuperarContrasena} />
        <Route path="/restablecer-contrasena/:token" component={RestablecerContrasena} />
        <Route component={NotFound} />
      </Switch>
    </ThemeProvider>
  );
}

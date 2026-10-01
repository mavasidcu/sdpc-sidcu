import { Component, type ReactNode, useEffect } from "react";
import { Route, Switch, Redirect, useLocation } from "wouter";
import { Toaster } from "sonner";
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
import Inconformidad from "@/pages/Inconformidad";
import Promocion from "@/pages/Promocion";
import Autoevaluacion from "@/pages/Autoevaluacion";
import EvaluacionesPendientes from "@/pages/EvaluacionesPendientes";
import Evaluacion from "@/pages/Evaluacion";
import GestionInconformidades from "@/pages/GestionInconformidades";
import GestionPromocion from "@/pages/GestionPromocion";
import PromocionResultados from "@/pages/PromocionResultados";
import GestionAutoevaluacion from "@/pages/GestionAutoevaluacion";
import GestionEvaluadores from "@/pages/GestionEvaluadores";
import CentroModulos from "@/pages/CentroModulos";

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
  const { isAuthenticated, isLoading, user } = useAuthState();
  const [location, navigate] = useLocation();
  const restriccion = user?.restriccionEvaluador;
  // startsWith, no ===: la ruta del wizard es /portal/evaluaciones/:id -- un
  // match exacto contra "/portal/evaluaciones" rebotaba al evaluador de
  // vuelta a la lista en cuanto entraba a SU PROPIA evaluacion, dejandolo
  // sin poder completarla nunca (hallazgo real del Task 16, verificacion e2e).
  const debeIrAEvaluaciones = restriccion?.restringido === true && !location.startsWith("/portal/evaluaciones");

  // useEffect con `navigate` imperativo, NO <Redirect> declarativo -- varias
  // paginas (Dashboard, CatalogoCursos, Inconformidad, MisSolicitudes,
  // Portal) tienen su PROPIO redirect a /onboarding cuando el perfil no
  // existe, sin saber nada de la restriccion de evaluador. Una cuenta
  // on-the-fly nunca tiene perfilesServidor, asi que ese redirect a
  // /onboarding SIEMPRE dispara para ella. Con <Redirect> (efecto que solo
  // corre una vez por valor de `to`, sin re-evaluar cuando `location` vuelve
  // a cambiar por otro componente) esa segunda navegacion le ganaba la
  // carrera a este gate y lo dejaba varado en /onboarding para siempre, sin
  // loop infinito pero sin poder volver jamas a /portal/evaluaciones
  // (hallazgo real del Task 16, verificacion e2e -- distinto del bug de
  // startsWith de arriba). Este efecto tiene `location` en deps, asi que se
  // re-evalua en CADA cambio de ruta sin importar quien lo haya disparado, y
  // se autocorrige aunque alguien mas gane la carrera una vez.
  useEffect(() => {
    if (debeIrAEvaluaciones) {
      navigate("/portal/evaluaciones", { replace: true });
    }
  }, [debeIrAEvaluaciones, location, navigate]);

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
          path="/inconformidades"
          component={GestionInconformidades}
          isAuthenticated={isAuthenticated}
          isLoading={isLoading}
        />
        <ProtectedRoute
          path="/promociones"
          component={GestionPromocion}
          isAuthenticated={isAuthenticated}
          isLoading={isLoading}
        />
        <ProtectedRoute
          path="/promocion-resultados"
          component={PromocionResultados}
          isAuthenticated={isAuthenticated}
          isLoading={isLoading}
        />
        <ProtectedRoute
          path="/autoevaluaciones"
          component={GestionAutoevaluacion}
          isAuthenticated={isAuthenticated}
          isLoading={isLoading}
        />
        <ProtectedRoute
          path="/evaluadores"
          component={GestionEvaluadores}
          isAuthenticated={isAuthenticated}
          isLoading={isLoading}
        />
        <ProtectedRoute
          path="/modulos"
          component={CentroModulos}
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
          path="/portal/inconformidad"
          component={Inconformidad}
          isAuthenticated={isAuthenticated}
          isLoading={isLoading}
        />
        <ProtectedRoute
          path="/portal/promocion"
          component={Promocion}
          isAuthenticated={isAuthenticated}
          isLoading={isLoading}
        />
        <ProtectedRoute
          path="/portal/autoevaluacion"
          component={Autoevaluacion}
          isAuthenticated={isAuthenticated}
          isLoading={isLoading}
        />
        <ProtectedRoute
          path="/portal/evaluaciones"
          component={EvaluacionesPendientes}
          isAuthenticated={isAuthenticated}
          isLoading={isLoading}
        />
        <ProtectedRoute
          path="/portal/evaluaciones/:id"
          component={Evaluacion}
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
      <Toaster position="bottom-right" richColors />
    </ThemeProvider>
  );
}

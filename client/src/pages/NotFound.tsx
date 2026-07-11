import { Link } from "wouter";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4 text-center">
      <h1 className="text-6xl font-bold text-gray-300">404</h1>
      <p className="mt-4 text-lg font-medium text-gray-600">
        Página no encontrada
      </p>
      <p className="mt-1 text-sm text-gray-400">
        La página que buscas no existe o fue movida.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700"
      >
        <Home size={16} />
        Volver al inicio
      </Link>
    </div>
  );
}

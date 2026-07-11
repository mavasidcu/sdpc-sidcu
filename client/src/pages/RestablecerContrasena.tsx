import { useState, type FormEvent } from "react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { ArrowLeft, CheckCircle } from "lucide-react";

export default function RestablecerContrasena({ params }: { params: { token: string } }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const mutation = trpc.auth.restablecerContrasena.useMutation();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setLoading(true);
    try {
      await mutation.mutateAsync({ token: params.token, password });
      setDone(true);
    } catch (err: any) {
      setError(err.message ?? "Error al restablecer contraseña");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 to-blue-100 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-modal">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} />
          Volver al inicio
        </Link>

        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">
            Nueva contraseña
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Ingresa tu nueva contraseña
          </p>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-3 rounded-lg bg-green-50 p-6 text-center">
            <CheckCircle size={32} className="text-green-600" />
            <p className="text-sm text-green-700">
              Tu contraseña ha sido restablecida exitosamente.
            </p>
            <Link
              href="/"
              className="mt-2 text-sm font-medium text-primary-600 hover:text-primary-700"
            >
              Iniciar sesión
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Nueva contraseña
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                placeholder="Mínimo 8 caracteres"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Confirmar contraseña
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                placeholder="Repetir contraseña"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
            >
              {loading ? "Restableciendo..." : "Restablecer contraseña"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

import { useState, type FormEvent } from "react";
import { useAuth } from "@/hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, User, ArrowRight, Eye, EyeOff } from "lucide-react";
import TurnstileWidget from "@/components/TurnstileWidget";

export default function Home() {
  const [tab, setTab] = useState<"login" | "register">("login");

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Left Panel — Mobile: vertical blanco, Desktop: horizontal guinda */}

      {/* Mobile/Tablet: vertical, fondo blanco */}
      <div className="flex flex-col items-center bg-white px-6 py-8 sm:py-10 lg:hidden">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center text-center"
        >
          <img src="/joven-mexicana.png" alt="Joven Mexicana" className="h-[140px] w-auto object-contain sm:h-[200px]" />
          <img src="/gobierno.png" alt="Gobierno de México" className="mt-6 h-20 w-auto object-contain sm:h-25" />
        </motion.div>
        <div className="mt-6 w-full max-w-xs">
          <div className="h-px w-full bg-inst-gray/20" />
          <p className="mt-2 text-center text-micro font-medium tracking-wide text-inst-gray">
            © 2026 Secretaría de Cultura
          </p>
        </div>
      </div>

      {/* Desktop: fondo blanco + pleca guinda (guía de identidad gráfica) */}
      <div className="relative hidden w-[48%] flex-col lg:flex lg:sticky lg:top-0 lg:h-screen bg-white overflow-hidden">
        {/* Pleca guinda superior — entrada desde arriba */}
        <motion.div
          initial={{ y: -64 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative h-16 w-full bg-primary-500 shrink-0 flex items-center px-8 xl:px-12"
        >
          <motion.div
            className="rounded-lg bg-white px-3 py-1.5 shadow-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            <img
              src="/logo-secretaria-cultura.jpeg"
              alt="Secretaría de Cultura"
              className="h-8 w-auto object-contain"
            />
          </motion.div>
        </motion.div>

        {/* Contenido centrado — stagger secuencial */}
        <div className="flex flex-1 flex-col items-center justify-center px-10 xl:px-14">
          <motion.img
            src="/joven-mexicana.png"
            alt="Joven Mexicana"
            className="max-h-[32vh] w-auto object-contain"
            style={{ mixBlendMode: "multiply" }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          />

          <motion.img
            src="/logo-secretaria-cultura.jpeg"
            alt="Secretaría de Cultura"
            className="mt-4 max-h-[8vh] w-auto object-contain"
            style={{ mixBlendMode: "multiply" }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          />

          <motion.div
            className="mt-3 text-center"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.85, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="text-micro font-semibold tracking-[0.15em] text-accent-500 uppercase">
              SIDCU
            </p>
            <p className="mt-0.5 text-subheading font-bold leading-tight text-primary-500 xl:text-heading">
              Sistema Informático de SPDC – SIDCU
            </p>
          </motion.div>
        </div>

        {/* Línea inferior guinda */}
        <motion.div
          className="h-1 w-full bg-primary-500 shrink-0"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 1.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformOrigin: "left" }}
        />

        {/* Footer */}
        <motion.div
          className="px-10 py-3 xl:px-14"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.3, duration: 0.5 }}
        >
          <p className="text-center text-micro font-medium tracking-wide text-inst-gray">
            © 2026 Secretaría de Cultura · Plataforma Institucional
          </p>
        </motion.div>
      </div>

      {/* Right Panel — Form */}
      <div className="flex flex-1 flex-col items-center justify-center bg-slate-50 px-4 py-8 sm:px-8 lg:px-12 lg:py-0">
        <div className="w-full max-w-95">
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-modal sm:p-7"
          >
            <h2 className="text-subheading font-extrabold tracking-tight text-slate-900 sm:text-heading">
              {tab === "login" ? "Iniciar sesión" : "Crear cuenta"}
            </h2>
            <p className="mt-0.5 text-caption text-slate-400">
              {tab === "login"
                ? "Accede al sistema con tus credenciales"
                : "Registra una nueva cuenta de acceso"}
            </p>

            <div className="mt-4 mb-4 flex gap-1 rounded-xl bg-slate-100 p-1">
              {(["login", "register"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`relative flex-1 rounded-[10px] py-2 text-caption font-semibold transition-all duration-300 ${
                    tab === t
                      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {t === "login" ? "Iniciar sesión" : "Registrarse"}
                </button>
              ))}
            </div>

            <div className="min-h-70">
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
              >
                {tab === "login" ? (
                  <LoginForm onSwitchTab={() => setTab("register")} />
                ) : (
                  <RegisterForm onSuccess={() => setTab("login")} />
                )}
              </motion.div>
            </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function FormInput({
  label,
  icon: Icon,
  type = "text",
  value,
  onChange,
  placeholder,
  required = true,
  minLength,
}: {
  label: string;
  icon: React.ElementType;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  required?: boolean;
  minLength?: number;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword ? (showPassword ? "text" : "password") : type;

  return (
    <div>
      <label className="mb-1.5 block text-caption font-semibold text-slate-600">
        {label}
      </label>
      <div className={`group relative overflow-hidden rounded-xl border transition-all duration-200 ${
        focused
          ? "border-primary-400 bg-white shadow-md shadow-primary-500/5 ring-[3px] ring-primary-500/10"
          : "border-slate-200 bg-slate-50/80 hover:border-slate-300"
      }`}>
        {/* Colored accent bar on focus */}
        <div className={`absolute left-0 top-0 h-full w-0.75 rounded-l-xl bg-primary-500 transition-opacity duration-200 ${
          focused ? "opacity-100" : "opacity-0"
        }`} />
        <Icon
          size={16}
          className={`absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors duration-200 ${
            focused ? "text-primary-500" : "text-slate-300"
          }`}
        />
        <input
          type={inputType}
          required={required}
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="w-full bg-transparent py-3 pl-10 pr-10 text-[13px] text-slate-800 placeholder:text-slate-300 focus:outline-none"
          placeholder={placeholder}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}

function SubmitButton({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-linear-to-r from-primary-600 to-primary-500 py-3.5 text-body font-bold text-white shadow-lg shadow-primary-500/25 transition-all hover:shadow-xl hover:shadow-primary-500/30 hover:brightness-[1.08] disabled:opacity-50 active:scale-[0.98]"
    >
      {/* Shimmer */}
      <div className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/12 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />
      <span className="relative flex items-center gap-2">
        {loading ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        ) : (
          children
        )}
      </span>
    </button>
  );
}

function LoginForm({ onSwitchTab }: { onSwitchTab: () => void }) {
  const { login } = useAuth();
  const [curp, setCurp] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const idleMsg = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("idle") === "1";
  const [error, setError] = useState(idleMsg ? "Tu sesión se cerró por inactividad." : "");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (curp.trim().length < 18) {
      setError("La CURP debe tener 18 caracteres");
      return;
    }
    setLoading(true);
    try {
      await login({ curp: curp.toUpperCase(), password, rememberMe });
      window.location.href = "/dashboard";
    } catch (err: any) {
      const msg = err.message ?? "";
      if (msg.includes("desactivada")) {
        setError("Tu cuenta ha sido desactivada. Contacta al administrador.");
      } else if (msg.includes("incorrectos") || msg.includes("UNAUTHORIZED")) {
        setError("CURP o contraseña incorrectos");
      } else {
        setError(msg || "Error al iniciar sesión");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-600"
        >
          {error}
        </motion.div>
      )}

      <FormInput
        label="CURP"
        icon={User}
        value={curp}
        onChange={(v) => setCurp(v.toUpperCase())}
        placeholder="Ingresa tu CURP"
      />

      <FormInput
        label="Contraseña"
        icon={Lock}
        type="password"
        value={password}
        onChange={setPassword}
        placeholder="Ingresa tu contraseña"
      />

      <div className="flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-2 text-caption text-slate-400">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-primary-500 focus:ring-primary-500/20"
          />
          Recordarme
        </label>
        {/* "Olvidaste tu contraseña" oculto: no hay correo remitente para enviar
            el token de recuperacion. Reactivar cuando exista ese envio.
            Mientras tanto, un admin reasigna la contraseña desde Usuarios. */}
      </div>

      <SubmitButton loading={loading}>
        Iniciar sesión
        <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
      </SubmitButton>

      <p className="text-center text-caption text-slate-400">
        ¿No tienes cuenta?{" "}
        <button type="button" onClick={onSwitchTab} className="font-bold text-primary-500 hover:text-primary-600">
          Regístrate
        </button>
      </p>
    </form>
  );
}

function RegisterForm({ onSuccess }: { onSuccess: () => void }) {
  const { register } = useAuth();
  const [curp, setCurp] = useState("");
  const [nombre, setNombre] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (curp.trim().length !== 18) {
      setError("La CURP debe tener exactamente 18 caracteres");
      return;
    }
    if (nombre.trim().length < 2) {
      setError("El nombre debe tener al menos 2 caracteres");
      return;
    }
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }
    const turnstileConfigurado = Boolean((import.meta as any).env.VITE_TURNSTILE_SITE_KEY);
    if (turnstileConfigurado && !turnstileToken) {
      setError("Completa la verificación de seguridad");
      return;
    }
    setLoading(true);
    try {
      await register({ curp: curp.toUpperCase(), nombre: nombre.trim(), password, turnstileToken });
      onSuccess();
    } catch (err: any) {
      // El servidor ya devuelve un mensaje generico e identico para los
      // distintos motivos de rechazo (cuenta ya existe, no esta en el
      // padron, dado de baja) -- reinterpretar el texto aqui por substring
      // deshacia esa proteccion mostrando cual caso es cada uno.
      setError(err.message || "Error al registrarse");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-caption text-rose-600"
        >
          {error}
        </motion.div>
      )}

      <FormInput
        label="CURP"
        icon={User}
        value={curp}
        onChange={(v) => setCurp(v.toUpperCase())}
        placeholder="18 caracteres"
      />

      <FormInput
        label="Nombre completo"
        icon={User}
        value={nombre}
        onChange={setNombre}
        placeholder="Juan Pérez"
      />

      <div className="grid grid-cols-2 gap-3">
        <FormInput
          label="Contraseña"
          icon={Lock}
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="Mínimo 8 caracteres"
          minLength={8}
        />

        <FormInput
          label="Confirmar"
          icon={Lock}
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          placeholder="Repetir"
        />
      </div>

      <TurnstileWidget onVerify={setTurnstileToken} />

      <SubmitButton loading={loading}>
        Crear cuenta
        <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
      </SubmitButton>

      <p className="text-center text-caption text-slate-400">
        ¿Ya tienes cuenta?{" "}
        <button type="button" onClick={onSuccess} className="font-bold text-primary-500 hover:text-primary-600">
          Inicia sesión
        </button>
      </p>
    </form>
  );
}

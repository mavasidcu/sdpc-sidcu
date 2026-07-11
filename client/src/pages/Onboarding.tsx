import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import { ClipboardList, Briefcase, LayoutGrid, ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

const stepTransition = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -16, transition: { duration: 0.2 } },
};

const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const CURP_REGEX = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]\d$/;

const NIVELES = [
  { value: "federal", label: "Federal" },
  { value: "estatal", label: "Estatal" },
  { value: "municipal", label: "Municipal" },
  { value: "otro", label: "Otro" },
];

const GRUPOS = [
  { value: "ADMO", label: "Administrativo" },
  { value: "TECN", label: "Tecnico" },
  { value: "SERV", label: "Servicios" },
  { value: "COMUN", label: "Comunicacion" },
  { value: "PROFE", label: "Profesional" },
  { value: "EDU", label: "Educacion" },
];

const STEP_INFO = [
  { number: 1, title: "Datos Personales", icon: ClipboardList },
  { number: 2, title: "Informacion Laboral", icon: Briefcase },
  { number: 3, title: "Clasificacion", icon: LayoutGrid },
];

interface FormData {
  rfc: string;
  curp: string;
  cargo: string;
  dependencia: string;
  fechaIngreso: string;
  nivelGobierno: string;
  grupoFuncion: string;
  contacto: string;
  email: string;
}

const initialFormData: FormData = {
  rfc: "",
  curp: "",
  cargo: "",
  dependencia: "",
  fechaIngreso: "",
  nivelGobierno: "federal",
  grupoFuncion: "",
  contacto: "",
  email: "",
};

const inputClass =
  "w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-300 focus:ring-2 focus:ring-primary-100 focus:outline-none transition-colors";

const selectClass =
  "w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-primary-300 focus:ring-2 focus:ring-primary-100 focus:outline-none transition-colors bg-white";

const labelClass = "block text-sm font-semibold text-slate-700 mb-1.5";

const errorClass = "mt-1 text-xs font-medium text-rose-500";

export default function Onboarding() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  // Guard: redirect if profile already completed
  const { data: perfilData, isLoading: perfilLoading } = trpc.perfil.obtener.useQuery(undefined, {
    retry: false,
  });

  useEffect(() => {
    if (perfilData && perfilData.completado) {
      navigate("/portal");
    }
  }, [perfilData, navigate]);

  // Si el servidor ya fue dado de alta por el admin (import o registro previo),
  // precarga cargo/dependencia/fecha de ingreso para no volver a capturarlos.
  const { data: miServidor } = trpc.servidores.miServidor.useQuery();
  const prefillApplied = useRef(false);

  useEffect(() => {
    if (!miServidor || prefillApplied.current) return;
    const esPlaceholder = (v: string | null | undefined) => !v || v === "Por definir";
    const esCurpRfcPlaceholder = (v: string | null | undefined) => !v || v.startsWith("PEND") || v.startsWith("UREG");
    const tieneFecha = miServidor.fechaIngreso && !isNaN(new Date(miServidor.fechaIngreso).getTime());

    if (
      esPlaceholder(miServidor.cargo) && esPlaceholder(miServidor.dependencia) && !tieneFecha &&
      esCurpRfcPlaceholder(miServidor.curp) && esCurpRfcPlaceholder(miServidor.rfc) && !miServidor.grupoFuncion
    ) return;

    prefillApplied.current = true;
    setFormData((prev) => ({
      ...prev,
      cargo: esPlaceholder(miServidor.cargo) ? prev.cargo : miServidor.cargo,
      dependencia: esPlaceholder(miServidor.dependencia) ? prev.dependencia : miServidor.dependencia,
      fechaIngreso: tieneFecha ? new Date(miServidor.fechaIngreso).toISOString().slice(0, 10) : prev.fechaIngreso,
      // El admin ya cargó estos datos por CSV -- precargarlos evita que el
      // usuario tenga que volver a teclearlos/seleccionarlos desde cero, que
      // es justo lo que abría la puerta a que un despiste (ej. click rápido
      // en el primer <option>) sobreescribiera un dato bueno del import.
      curp: esCurpRfcPlaceholder(miServidor.curp) ? prev.curp : miServidor.curp,
      rfc: esCurpRfcPlaceholder(miServidor.rfc) ? prev.rfc : miServidor.rfc,
      grupoFuncion: miServidor.grupoFuncion || prev.grupoFuncion,
      nivelGobierno: miServidor.nivel || prev.nivelGobierno,
    }));
  }, [miServidor, prefillApplied]);

  const utils = trpc.useUtils();
  const crearMutation = trpc.perfil.crear.useMutation({
    onSuccess: async () => {
      await utils.perfil.obtener.invalidate();
      navigate("/portal");
    },
    onError: (err) => {
      setErrors({ rfc: err.message });
      alert("Error al completar registro: " + err.message);
    },
  });

  function updateField(field: keyof FormData, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  function validateStep(s: number): boolean {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (s === 0) {
      const rfcUpper = formData.rfc.trim().toUpperCase();
      if (!rfcUpper) {
        newErrors.rfc = "El RFC es obligatorio";
      } else if (!RFC_REGEX.test(rfcUpper)) {
        newErrors.rfc = "RFC invalido. Formato: 3-4 letras + 6 digitos + 3 alfanumericos";
      }

      const curpUpper = formData.curp.trim().toUpperCase();
      if (!curpUpper) {
        newErrors.curp = "La CURP es obligatoria";
      } else if (!CURP_REGEX.test(curpUpper)) {
        newErrors.curp = "CURP invalida. Verifica el formato (18 caracteres)";
      }
    }

    if (s === 1) {
      if (!formData.cargo.trim()) {
        newErrors.cargo = "El cargo es obligatorio";
      }
      if (!formData.dependencia.trim()) {
        newErrors.dependencia = "La dependencia es obligatoria";
      }
      if (!formData.fechaIngreso) {
        newErrors.fechaIngreso = "La fecha de ingreso es obligatoria";
      }
    }

    if (s === 2) {
      if (!formData.grupoFuncion) {
        newErrors.grupoFuncion = "Selecciona un grupo de funcion";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleNext() {
    if (validateStep(step)) {
      setStep((s) => s + 1);
    }
  }

  function handleBack() {
    setStep((s) => s - 1);
  }

  function handleSubmit() {
    if (!validateStep(step)) return;

    crearMutation.mutate({
      rfc: formData.rfc.trim().toUpperCase(),
      curp: formData.curp.trim().toUpperCase(),
      cargo: formData.cargo.trim(),
      dependencia: formData.dependencia.trim(),
      fechaIngreso: formData.fechaIngreso,
      nivelGobierno: "federal" as const,
      grupoFuncion: formData.grupoFuncion as "ADMO" | "TECN" | "SERV" | "COMUN" | "PROFE" | "EDU",
      datosContacto: formData.contacto.trim() || null,
      email: formData.email.trim() || null,
    });
  }

  if (perfilLoading) {
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
      className="mx-auto max-w-2xl py-8 px-4"
    >
      {/* Header */}
      <motion.div variants={fadeUp} className="mb-8 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
          Registro de Servidor Publico
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">
          Completa tu perfil para acceder al portal de capacitacion
        </p>
      </motion.div>

      {/* Step Indicator */}
      <motion.div variants={fadeUp} className="mb-8 flex items-center justify-center gap-3">
        {STEP_INFO.map((info, i) => {
          const isActive = i === step;
          const isCompleted = i < step;
          const Icon = info.icon;

          return (
            <div key={i} className="flex items-center gap-3">
              {i > 0 && (
                <div
                  className={`h-px w-8 transition-colors ${
                    isCompleted ? "bg-primary-400" : "bg-slate-200"
                  }`}
                />
              )}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all ${
                    isActive
                      ? "border-primary-500 bg-primary-50 text-primary-600"
                      : isCompleted
                        ? "border-primary-400 bg-primary-500 text-white"
                        : "border-slate-200 bg-white text-slate-400"
                  }`}
                >
                  {isCompleted ? <Check size={16} /> : <Icon size={16} />}
                </div>
                <span
                  className={`text-[11px] font-semibold ${
                    isActive ? "text-primary-600" : isCompleted ? "text-primary-500" : "text-slate-400"
                  }`}
                >
                  Paso {info.number}
                </span>
              </div>
            </div>
          );
        })}
      </motion.div>

      {/* Card */}
      <motion.div
        variants={fadeUp}
        className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-modal sm:p-8"
      >
        {/* Step Title */}
        <div className="mb-6">
          <h2 className="text-lg font-bold text-slate-800">
            Paso {step + 1}: {STEP_INFO[step].title}
          </h2>
          <div className="mt-2 h-1 w-12 rounded-full bg-primary-500" />
        </div>

        {/* Step Content */}
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div key="step-0" {...stepTransition} className="space-y-5">
              <div>
                <label htmlFor="rfc" className={labelClass}>
                  RFC
                </label>
                <input
                  id="rfc"
                  type="text"
                  className={inputClass}
                  placeholder="Ej. XAXX010101000"
                  value={formData.rfc}
                  onChange={(e) => updateField("rfc", e.target.value.toUpperCase())}
                  maxLength={13}
                />
                {errors.rfc && <p className={errorClass}>{errors.rfc}</p>}
              </div>

              <div>
                <label htmlFor="curp" className={labelClass}>
                  CURP
                </label>
                <input
                  id="curp"
                  type="text"
                  className={inputClass}
                  placeholder="Ej. XEXX010101HNEXXXA1"
                  value={formData.curp}
                  onChange={(e) => updateField("curp", e.target.value.toUpperCase())}
                  maxLength={18}
                />
                {errors.curp && <p className={errorClass}>{errors.curp}</p>}
              </div>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div key="step-1" {...stepTransition} className="space-y-5">
              <div>
                <label htmlFor="cargo" className={labelClass}>
                  Cargo
                </label>
                <input
                  id="cargo"
                  type="text"
                  className={inputClass}
                  placeholder="Ej. Analista de Sistemas"
                  value={formData.cargo}
                  onChange={(e) => updateField("cargo", e.target.value)}
                />
                {errors.cargo && <p className={errorClass}>{errors.cargo}</p>}
              </div>

              <div>
                <label htmlFor="dependencia" className={labelClass}>
                  Dependencia
                </label>
                <input
                  id="dependencia"
                  type="text"
                  className={inputClass}
                  placeholder="Ej. Secretaria de Cultura"
                  value={formData.dependencia}
                  onChange={(e) => updateField("dependencia", e.target.value)}
                />
                {errors.dependencia && <p className={errorClass}>{errors.dependencia}</p>}
              </div>

              <div>
                <label htmlFor="fechaIngreso" className={labelClass}>
                  Fecha de Ingreso
                </label>
                <input
                  id="fechaIngreso"
                  type="date"
                  className={inputClass}
                  value={formData.fechaIngreso}
                  onChange={(e) => updateField("fechaIngreso", e.target.value)}
                />
                {errors.fechaIngreso && <p className={errorClass}>{errors.fechaIngreso}</p>}
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step-2" {...stepTransition} className="space-y-5">
              <div>
                <label htmlFor="grupoFuncion" className={labelClass}>
                  Grupo de Funcion
                </label>
                <select
                  id="grupoFuncion"
                  className={selectClass}
                  value={formData.grupoFuncion}
                  onChange={(e) => updateField("grupoFuncion", e.target.value)}
                >
                  <option value="">Selecciona un grupo</option>
                  {GRUPOS.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
                {errors.grupoFuncion && <p className={errorClass}>{errors.grupoFuncion}</p>}
              </div>

              <div>
                <label htmlFor="contacto" className={labelClass}>
                  Número de Contacto{" "}
                  <span className="font-normal text-slate-400">(opcional)</span>
                </label>
                <input
                  type="tel"
                  id="contacto"
                  className={inputClass}
                  placeholder="Ej. 55-1234-5678"
                  value={formData.contacto}
                  onChange={(e) => updateField("contacto", e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="email" className={labelClass}>
                  Correo Electrónico{" "}
                  <span className="font-normal text-slate-400">(opcional)</span>
                </label>
                <input
                  type="email"
                  id="email"
                  className={inputClass}
                  placeholder="Ej. correo@cultura.gob.mx"
                  value={formData.email}
                  onChange={(e) => updateField("email", e.target.value)}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation Buttons */}
        <div className="mt-8 flex items-center justify-between">
          {step > 0 ? (
            <button
              type="button"
              onClick={handleBack}
              className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
            >
              <ArrowLeft size={16} />
              Anterior
            </button>
          ) : (
            <div />
          )}

          {step < 2 ? (
            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-2 rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
            >
              Siguiente
              <ArrowRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={crearMutation.isPending}
              className="flex items-center gap-2 rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {crearMutation.isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Check size={16} />
                  Completar Registro
                </>
              )}
            </button>
          )}
        </div>

        {/* Mutation error display */}
        {crearMutation.isError && (
          <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">
            {crearMutation.error.message}
          </div>
        )}
      </motion.div>

      {/* Footer hint */}
      <motion.p variants={fadeUp} className="mt-4 text-center text-xs text-slate-400">
        Todos los campos marcados son obligatorios. Tu informacion sera verificada por el administrador.
      </motion.p>
    </motion.div>
  );
}

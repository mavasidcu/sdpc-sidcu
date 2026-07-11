export const ROLE_CONFIG: Record<string, { label: string; bg: string; text: string; color: string }> = {
  admin: { label: "Administrador", bg: "bg-indigo-50", text: "text-indigo-600", color: "#6366f1" },
  capturista: { label: "Capturista", bg: "bg-sky-50", text: "text-sky-600", color: "#0ea5e9" },
  consultor: { label: "Consultor", bg: "bg-amber-50", text: "text-amber-600", color: "#f59e0b" },
  user: { label: "Usuario", bg: "bg-slate-100", text: "text-slate-500", color: "#94a3b8" },
};

export const ROLES = ["admin", "capturista", "consultor", "user"] as const;

import { useState, type FormEvent } from "react";
import ComboInput from "./ComboInput";
import { CMAO_CATALOGO } from "@shared/const";

export interface ServidorFormData {
  nombreCompleto: string;
  rfc: string;
  curp: string;
  cargo: string;
  dependencia: string;
  nivel: "federal" | "estatal" | "municipal" | "otro";
  fechaIngreso: string;
  datosContacto: string;
  grupoFuncion: "ADMO" | "TECN" | "SERV" | "COMUN" | "PROFE" | "EDU";
  programa: "PAC" | "SPC" | "SDPC";
  upa: string;
  cmao: string;
  ua: string;
  nivelProgresion: string;
  email: string;
  estatus: "activo" | "inactivo";
  observaciones: string;
}

const emptyForm: ServidorFormData = {
  nombreCompleto: "",
  rfc: "",
  curp: "",
  cargo: "",
  dependencia: "",
  nivel: "federal",
  fechaIngreso: "",
  datosContacto: "",
  grupoFuncion: "ADMO",
  programa: "SDPC",
  upa: "",
  cmao: "",
  ua: "",
  nivelProgresion: "0",
  email: "",
  estatus: "activo",
  observaciones: "",
};

const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const CURP_REGEX = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]\d$/;

const NIVELES = [
  { value: "federal", label: "Federal" },
  { value: "estatal", label: "Estatal" },
  { value: "municipal", label: "Municipal" },
  { value: "otro", label: "Otro" },
] as const;

const GRUPOS = [
  { value: "ADMO", label: "Administrativo (ADMO)" },
  { value: "TECN", label: "Técnico (TECN)" },
  { value: "SERV", label: "Servicios (SERV)" },
  { value: "COMUN", label: "Comunicación (COMUN)" },
  { value: "PROFE", label: "Profesional (PROFE)" },
  { value: "EDU", label: "Educación (EDU)" },
] as const;

const PROGRAMAS = [
  { value: "PAC", label: "PAC" },
  { value: "SPC", label: "SPC" },
  { value: "SDPC", label: "SDPC" },
] as const;

interface Props {
  initialData?: Partial<ServidorFormData>;
  onSubmit: (data: ServidorFormData) => Promise<void> | void;
  onCancel: () => void;
  loading?: boolean;
  submitLabel?: string;
  upas?: string[];
  uas?: string[];
}

export function ServidorForm({
  initialData,
  onSubmit,
  onCancel,
  loading = false,
  submitLabel = "Guardar",
  upas = [],
  uas = [],
}: Props) {
  const [form, setForm] = useState<ServidorFormData>({
    ...emptyForm,
    ...initialData,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ServidorFormData, string>>>({});

  const validate = (): boolean => {
    const e: typeof errors = {};
    if (!form.nombreCompleto.trim()) e.nombreCompleto = "Nombre requerido";
    if (!RFC_REGEX.test(form.rfc)) e.rfc = "RFC inválido (ej: XAXX010101000)";
    if (!CURP_REGEX.test(form.curp)) e.curp = "CURP inválido (ej: XEXX010101HNEXXXA4)";
    if (!form.cargo.trim()) e.cargo = "Cargo requerido";
    if (!form.dependencia.trim()) e.dependencia = "Dependencia requerida";
    if (!form.fechaIngreso) e.fechaIngreso = "Fecha de ingreso requerida";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    await onSubmit(form);
  };

  const set = (field: keyof ServidorFormData, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const inputClass =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20";
  const errorInputClass =
    "w-full rounded-lg border border-red-400 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Nombre Completo */}
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Nombre Completo *
          </label>
          <input
            type="text"
            value={form.nombreCompleto}
            onChange={(e) => set("nombreCompleto", e.target.value)}
            className={errors.nombreCompleto ? errorInputClass : inputClass}
            placeholder="Juan Pérez García"
          />
          {errors.nombreCompleto && (
            <p className="mt-1 text-xs text-red-500">{errors.nombreCompleto}</p>
          )}
        </div>

        {/* RFC */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            RFC *
          </label>
          <input
            type="text"
            value={form.rfc}
            onChange={(e) => set("rfc", e.target.value.toUpperCase())}
            className={errors.rfc ? errorInputClass : inputClass}
            placeholder="XAXX010101000"
            maxLength={13}
          />
          {errors.rfc && (
            <p className="mt-1 text-xs text-red-500">{errors.rfc}</p>
          )}
        </div>

        {/* CURP */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            CURP *
          </label>
          <input
            type="text"
            value={form.curp}
            onChange={(e) => set("curp", e.target.value.toUpperCase())}
            className={errors.curp ? errorInputClass : inputClass}
            placeholder="XEXX010101HNEXXXA4"
            maxLength={18}
          />
          {errors.curp && (
            <p className="mt-1 text-xs text-red-500">{errors.curp}</p>
          )}
        </div>

        {/* Cargo */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Cargo *
          </label>
          <input
            type="text"
            value={form.cargo}
            onChange={(e) => set("cargo", e.target.value)}
            className={errors.cargo ? errorInputClass : inputClass}
            placeholder="Director General"
          />
          {errors.cargo && (
            <p className="mt-1 text-xs text-red-500">{errors.cargo}</p>
          )}
        </div>

        {/* Dependencia */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Dependencia *
          </label>
          <input
            type="text"
            value={form.dependencia}
            onChange={(e) => set("dependencia", e.target.value)}
            className={errors.dependencia ? errorInputClass : inputClass}
            placeholder="Secretaría de Cultura"
          />
          {errors.dependencia && (
            <p className="mt-1 text-xs text-red-500">{errors.dependencia}</p>
          )}
        </div>

        {/* Nivel hardcodeado federal */}
        <input type="hidden" value="federal" />

        {/* Grupo/Función */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Grupo / Función *
          </label>
          <select
            value={form.grupoFuncion}
            onChange={(e) => set("grupoFuncion", e.target.value)}
            className={inputClass}
          >
            {GRUPOS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </div>

        {/* Programa -- lo fija el import (SDPC/PAC/SPC); editable aquí solo
            para corregir un error de captura, no forma parte del onboarding. */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Programa *
          </label>
          <select
            value={form.programa}
            onChange={(e) => set("programa", e.target.value)}
            className={inputClass}
          >
            {PROGRAMAS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* UPA (Sector) */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            UPA (Sector)
          </label>
          <ComboInput
            value={form.upa}
            onChange={(v) => set("upa", v)}
            options={upas}
            placeholder="Ej: CULTURA, RE, INDAUTOR"
            className={inputClass}
            uppercase
          />
        </div>

        {/* UA (Dirección) — al elegir, autocompleta la CMAO correspondiente */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            UA (Dirección)
          </label>
          <select
            value={form.ua}
            onChange={(e) => {
              const ua = e.target.value;
              const match = CMAO_CATALOGO.find((c) => c.ua === ua);
              set("ua", ua);
              set("cmao", match?.cmao ?? "");
            }}
            className={inputClass}
          >
            <option value="">Seleccionar UA...</option>
            {CMAO_CATALOGO.map((c) => (
              <option key={c.ua} value={c.ua}>{c.ua}</option>
            ))}
          </select>
        </div>

        {/* CMAO — se llena automáticamente según la UA seleccionada */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Clave de la CMAO
          </label>
          <input
            type="text"
            value={form.cmao}
            readOnly
            className={`${inputClass} bg-gray-50 text-gray-500`}
            placeholder="Se autocompleta al elegir UA"
          />
        </div>

        {/* Correo electrónico */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Correo Electrónico
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            className={inputClass}
            placeholder="correo@cultura.gob.mx"
          />
        </div>

        {/* Nivel de Progresión */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Nivel de Progresión
          </label>
          <select
            value={form.nivelProgresion}
            onChange={(e) => set("nivelProgresion", e.target.value)}
            className={inputClass}
          >
            <option value="0">0 - Nuevo ingreso</option>
            <option value="1">N1</option>
            <option value="2">N2</option>
            <option value="3">N3</option>
            <option value="4">N4</option>
            <option value="5">N5</option>
          </select>
        </div>

        {/* Fecha de Ingreso */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Fecha de Ingreso *
          </label>
          <input
            type="date"
            value={form.fechaIngreso}
            onChange={(e) => set("fechaIngreso", e.target.value)}
            className={errors.fechaIngreso ? errorInputClass : inputClass}
          />
          {errors.fechaIngreso && (
            <p className="mt-1 text-xs text-red-500">{errors.fechaIngreso}</p>
          )}
        </div>

        {/* Estatus */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Estatus
          </label>
          <select
            value={form.estatus}
            onChange={(e) => set("estatus", e.target.value)}
            className={inputClass}
          >
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>
        </div>

        {/* Número de Contacto */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Número de Contacto
          </label>
          <input
            type="tel"
            value={form.datosContacto}
            onChange={(e) => set("datosContacto", e.target.value)}
            className={inputClass}
            placeholder="Ej. 55-1234-5678"
          />
        </div>

        {/* Observaciones */}
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Observaciones
          </label>
          <textarea
            value={form.observaciones}
            onChange={(e) => set("observaciones", e.target.value)}
            className={inputClass}
            rows={3}
            placeholder="Notas adicionales..."
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 border-t pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {loading ? "Guardando..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

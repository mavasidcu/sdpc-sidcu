import { useState, useRef, useEffect } from "react";

interface ComboInputProps {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  uppercase?: boolean;
}

export default function ComboInput({ value, onChange, options, placeholder, className = "", uppercase = false }: ComboInputProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const filtered = options.filter((o) =>
    o.toLowerCase().includes((filter || value).toLowerCase())
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          const v = uppercase ? e.target.value.toUpperCase() : e.target.value;
          onChange(v);
          setFilter(v);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={className}
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {filtered.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt);
                setOpen(false);
                setFilter("");
              }}
              className={`flex w-full px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50 ${
                opt === value ? "bg-primary-50 font-semibold text-primary-600" : "text-slate-700"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

import { useId, useState, type ReactNode } from "react";
import { Info } from "lucide-react";

/** Label + required/optional badge + unit + help text + "where to find it" tooltip + error. */
export function FormField({ label, required, unit, help, where, range, error, warning, children, htmlFor, aside }: {
  label: string; required?: boolean; unit?: string; help?: ReactNode; where?: string; range?: string;
  error?: string | null; warning?: string | null; children: ReactNode; htmlFor?: string; aside?: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
          {label}
          {unit && <span className="text-xs font-normal text-ink-faint">({unit})</span>}
          <span className={`rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide
            ${required ? "bg-neon/10 text-neon" : "bg-white/5 text-ink-faint"}`}>{required ? "Required" : "Optional"}</span>
        </label>
        <div className="flex items-center gap-2">
          {aside}
          {where && <FieldHelp text={where} label={label} />}
        </div>
      </div>
      {children}
      {error ? <p className="mt-1 text-xs text-danger" role="alert">{error}</p>
        : warning ? <p className="mt-1 text-xs text-warn">{warning}</p>
        : (help || range) && <p className="help">{help}{help && range ? " · " : ""}{range}</p>}
    </div>
  );
}

/** Info icon with the "where to find it" text; works on hover, focus and tap. */
export function FieldHelp({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative">
      <button type="button" className="grid h-6 w-6 place-items-center rounded-full text-ink-faint hover:text-neon"
        aria-label={`Where to find: ${label}`} aria-describedby={open ? id : undefined}
        onClick={() => setOpen((o) => !o)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && (
        <span id={id} role="tooltip"
          className="glass-strong absolute right-0 top-7 z-30 w-60 px-3 py-2 text-xs font-normal leading-relaxed text-ink-muted">
          {text}
        </span>
      )}
    </span>
  );
}

export function RadioCards<T extends string>({ name, value, onChange, options, columns = 2, error }: {
  name: string; value: T | null | undefined; onChange: (v: T) => void;
  options: { value: T; label: string; help?: string; icon?: ReactNode }[]; columns?: 2 | 3 | 4 | 5; error?: boolean;
}) {
  const cols = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4", 5: "sm:grid-cols-3 lg:grid-cols-5" }[columns];
  const compact = options.every((o) => !o.help);
  return (
    <div role="radiogroup" aria-label={name} className={`grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-1"} ${cols}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={active} onClick={() => onChange(o.value)}
            className={`rounded-lg border px-3 py-2.5 text-left transition
              ${active ? "border-neon/70 bg-neon/10 shadow-glow" : `${error ? "border-danger/50" : "border-[color:var(--line)]"} bg-forest-950/40 hover:border-[color:var(--line-strong)]`}`}>
            <span className="flex items-center gap-2 text-sm font-medium text-ink">{o.icon}{o.label}</span>
            {o.help && <span className="mt-0.5 block text-xs text-ink-muted">{o.help}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function NumberInput({ id, value, onChange, placeholder, min, max, step = "any", invalid, disabled }: {
  id?: string; value: string; onChange: (v: string) => void; placeholder?: string; min?: number; max?: number;
  step?: string; invalid?: boolean; disabled?: boolean;
}) {
  return (
    <input id={id} type="number" inputMode="decimal" className={`input ${invalid ? "input-error" : ""}`} value={value}
      onChange={(e) => onChange(e.target.value)} placeholder={placeholder} min={min} max={max} step={step}
      aria-invalid={invalid || undefined} disabled={disabled} />
  );
}

/** Number with a unit toggle, e.g. hectares / acres (1 ha = 2.471 acres). */
export function UnitInput<U extends string>({ id, value, onChange, unit, units, onUnitChange, placeholder, invalid, convert }: {
  id?: string; value: string; onChange: (v: string) => void; unit: U; units: { value: U; label: string }[];
  onUnitChange: (u: U) => void; placeholder?: string; invalid?: boolean; convert?: (v: number, from: U, to: U) => number;
}) {
  return (
    <div className="flex gap-2">
      <NumberInput id={id} value={value} onChange={onChange} placeholder={placeholder} min={0} invalid={invalid} />
      <div className="flex shrink-0 rounded-lg border border-[color:var(--line)] bg-forest-950/60 p-0.5" role="group" aria-label="Unit">
        {units.map((u) => (
          <button key={u.value} type="button" aria-pressed={u.value === unit}
            onClick={() => {
              if (u.value === unit) return;
              const n = parseFloat(value);
              if (convert && !Number.isNaN(n)) onChange(String(+convert(n, unit, u.value).toFixed(3)));
              onUnitChange(u.value);
            }}
            className={`rounded-md px-2.5 text-xs font-semibold transition ${u.value === unit ? "bg-neon/15 text-neon" : "text-ink-muted hover:text-ink"}`}>
            {u.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Small "I don't know" toggle used for optional values. */
export function DontKnowToggle({ checked, onChange, label = "I don't know" }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-muted hover:text-ink">
      <input type="checkbox" className="h-3.5 w-3.5 accent-[#39F27A]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

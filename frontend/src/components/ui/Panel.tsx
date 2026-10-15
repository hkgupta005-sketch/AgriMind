import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function Panel({ title, icon: Icon, actions, children, className = "", subtitle, id }: {
  title?: ReactNode; icon?: LucideIcon; actions?: ReactNode; children: ReactNode; className?: string; subtitle?: ReactNode; id?: string;
}) {
  return (
    <section className={`glass p-4 sm:p-5 ${className}`} aria-labelledby={id}>
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <h2 id={id} className="flex items-center gap-2 text-base font-semibold text-ink">
                {Icon && <Icon className="h-4 w-4 text-neon" aria-hidden />}{title}
              </h2>
            )}
            {subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ eyebrow, title, question, output, actions }: {
  eyebrow?: string; title: string; question?: string; output?: string; actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
        {question && <p className="mt-1.5 text-base text-ink-muted">“{question}”</p>}
        {output && (
          <p className="mt-2 text-sm text-ink-muted">
            <span className="font-medium text-cyan-accent">What you’ll get:</span> {output}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Tabs<T extends string>({ value, onChange, items, label }: {
  value: T; onChange: (v: T) => void; items: { value: T; label: string; icon?: LucideIcon }[]; label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="mb-5 inline-flex rounded-lg border border-[color:var(--line)] bg-forest-950/50 p-1">
      {items.map((it) => {
        const active = it.value === value;
        const Icon = it.icon;
        return (
          <button key={it.value} role="tab" aria-selected={active} onClick={() => onChange(it.value)}
            className={`flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition
              ${active ? "bg-neon/15 text-neon shadow-glow" : "text-ink-muted hover:text-ink"}`}>
            {Icon && <Icon className="h-4 w-4" aria-hidden />}{it.label}
          </button>
        );
      })}
    </div>
  );
}

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Info, PencilLine, TriangleAlert } from "lucide-react";
import type { Assumed } from "../../lib/types";
import { useSession } from "../../context/SessionContext";

export function ModelWarnings({ warnings }: { warnings: string[] }) {
  if (!warnings?.length) return null;
  return (
    <ul className="space-y-1.5" aria-label="Warnings">
      {warnings.map((w) => (
        <li key={w} className="flex gap-2 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-sm text-ink">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />{w}
        </li>
      ))}
    </ul>
  );
}

export function AssumedValuesNote({ assumed, title = "Values we assumed (typical values from the data)" }: { assumed: Assumed[]; title?: string }) {
  if (!assumed?.length) return null;
  return (
    <details className="rounded-lg border border-[color:var(--line)] bg-forest-950/40 px-3 py-2 text-sm">
      <summary className="cursor-pointer text-ink-muted"><span className="text-cyan-accent">{assumed.length}</span> {title}</summary>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2">
        {assumed.map((a) => (
          <li key={a.field} className="flex justify-between gap-2 text-xs"><span className="text-ink-muted">{a.label}</span><span className="text-ink">{String(a.value)}</span></li>
        ))}
      </ul>
    </details>
  );
}

export function AccuracyNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2 text-xs leading-relaxed text-ink-muted">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-accent" aria-hidden />{children}
    </p>
  );
}

/** "Saved to history" status after a run, or why it was not saved. */
export function SavedNote({ savedId }: { savedId: number | null }) {
  const { canSave, user } = useSession();
  if (savedId) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-neon">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Saved to your history
        {user?.is_guest && <span className="text-ink-faint">(guest — <Link className="underline hover:text-ink" to="/settings">create an account</Link> to keep it)</span>}
      </p>
    );
  }
  return <p className="text-xs text-ink-faint">{canSave ? "Not saved." : "Not saved — the database is not connected."}</p>;
}

export function EditInputs({ onClick }: { onClick: () => void }) {
  return <button type="button" className="btn-secondary btn-sm" onClick={onClick}><PencilLine className="h-3.5 w-3.5" />Edit inputs</button>;
}

export function ResultEmpty({ icon: Icon, title, lines }: { icon: React.ComponentType<{ className?: string }>; title: string; lines: string[] }) {
  return (
    <div className="flex h-full flex-col justify-center py-6">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl border border-dashed border-[color:var(--line-strong)]">
        <Icon className="h-6 w-6 text-neon/70" />
      </div>
      <p className="font-medium">{title}</p>
      <ul className="mt-2 space-y-1.5 text-sm text-ink-muted">
        {lines.map((l) => <li key={l} className="flex gap-2"><span className="text-neon">•</span>{l}</li>)}
      </ul>
    </div>
  );
}

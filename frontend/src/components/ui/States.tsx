import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Loader2, PlugZap, type LucideIcon } from "lucide-react";
import { ApiError } from "../../lib/api";

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <Loader2 className={`${className} animate-spin`} aria-hidden />;
}

export function LoadingState({ label = "Loading…", className = "" }: { label?: string; className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-2 py-10 text-sm text-ink-muted ${className}`} role="status">
      <Spinner /> {label}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-forest-700/40 ${className}`} aria-hidden />;
}

export function EmptyState({ icon: Icon, title, text, action, compact }: {
  icon: LucideIcon; title: string; text?: ReactNode; action?: { label: string; to?: string; onClick?: () => void }; compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? "py-6" : "py-10"}`}>
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-full border border-[color:var(--line)] bg-forest-800/60">
        <Icon className="h-5 w-5 text-neon/80" aria-hidden />
      </div>
      <p className="font-medium text-ink">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-ink-muted">{text}</p>}
      {action && (action.to
        ? <Link to={action.to} className="btn-secondary btn-sm mt-4">{action.label}</Link>
        : <button onClick={action.onClick} className="btn-secondary btn-sm mt-4">{action.label}</button>)}
    </div>
  );
}

export function ErrorState({ error, onRetry, compact }: { error: ApiError | Error | string; onRetry?: () => void; compact?: boolean }) {
  const msg = typeof error === "string" ? error : error.message;
  const unavailable = error instanceof ApiError && error.unavailable;
  const Icon = unavailable ? PlugZap : AlertTriangle;
  return (
    <div className={`flex items-start gap-3 rounded-lg border px-4 ${compact ? "py-3" : "py-4"} text-sm
      ${unavailable ? "border-warn/30 bg-warn/5" : "border-danger/30 bg-danger/5"}`} role="alert">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${unavailable ? "text-warn" : "text-danger"}`} aria-hidden />
      <div className="flex-1">
        <p className="text-ink">{msg}</p>
        {error instanceof ApiError && typeof error.detail === "string" && unavailable && (
          <p className="mt-1 text-xs text-ink-muted">{error.detail}</p>
        )}
      </div>
      {onRetry && <button className="btn-ghost btn-sm -my-1" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function StatusBadge({ tone, children }: { tone: "green" | "blue" | "red" | "amber" | "muted" | "cyan"; children: ReactNode }) {
  const tones = {
    green: "border-neon/40 bg-neon/10 text-neon",
    blue: "border-info/40 bg-info/10 text-info",
    red: "border-danger/40 bg-danger/10 text-danger",
    amber: "border-warn/40 bg-warn/10 text-warn",
    cyan: "border-cyan-accent/40 bg-cyan-accent/10 text-cyan-accent",
    muted: "border-[color:var(--line)] bg-forest-800/60 text-ink-muted",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export const needTone = (need: string) => (need === "High" ? "red" : need === "Medium" ? "blue" : "green") as "red" | "blue" | "green";

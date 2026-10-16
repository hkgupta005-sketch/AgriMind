import type { ReactNode } from "react";
import { useApi } from "../../hooks/useApi";
import type { Guide, ToolKey } from "../../lib/types";
import { useSession } from "../../context/SessionContext";
import { Spinner } from "./States";
import { PlugZap } from "lucide-react";

export function useGuide(tool: ToolKey) {
  return useApi<Guide>(`/guide/${tool}`);
}

const MODEL_KEY: Record<ToolKey, "production" | "irrigation" | "leaf" | "price" | "crop"> = {
  production: "production", irrigation: "irrigation", leaf: "leaf", price: "price", crop: "crop",
};

/** Shows whether the page's model is ready / loading / not configured. */
export function ModelStatusNote({ tool }: { tool: ToolKey }) {
  const { health } = useSession();
  const m = health?.models[MODEL_KEY[tool]];
  if (!m || m.state === "ready") return null;
  if (m.state === "pending" || m.state === "loading") {
    return <p className="mb-4 flex items-center gap-2 text-sm text-ink-muted"><Spinner /> Loading the {m.label.toLowerCase()}… (the first start can take a little while)</p>;
  }
  const title = m.state === "unavailable" && tool === "leaf" ? "Leaf model not available online yet." : `${m.label} not configured yet.`;
  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-warn/30 bg-warn/5 px-4 py-3 text-sm" role="status">
      <PlugZap className="mt-0.5 h-4 w-4 text-warn" aria-hidden />
      <div><p className="text-ink">{title}</p>{m.error && <p className="mt-0.5 text-xs text-ink-muted">{m.error}</p>}</div>
    </div>
  );
}

/** Guide panel (left on desktop, top on mobile) + form + result. */
export function ToolLayout({ guide, form, result }: { guide: ReactNode; form: ReactNode; result: ReactNode }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)_minmax(0,400px)]">
      <div className="lg:row-span-2 2xl:row-span-1">{guide}</div>
      <div className="min-w-0">{form}</div>
      <div id="tool-result" className="min-w-0 scroll-mt-20">{result}</div>
    </div>
  );
}

/** Bring the result into view when it is below the form (laptop and mobile layouts). */
export function revealResult() {
  requestAnimationFrame(() => {
    const el = document.getElementById("tool-result");
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top > window.innerHeight * 0.6 || r.bottom < 0) {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    }
  });
}

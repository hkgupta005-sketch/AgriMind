import { useEffect, useState } from "react";
import { ChevronDown, ClipboardList, Clock, Sparkles } from "lucide-react";
import type { Guide } from "../../lib/types";
import { Skeleton } from "../ui/States";

const SEEN_KEY = "agrimind.guideSeen.";

/**
 * "What you need" checklist shown before the form: every input, required/optional, unit, example,
 * where to find it, what happens if skipped, estimated time and a "Fill with an example" button.
 * On mobile it collapses into "What do I need?" (open the first time).
 */
export function InputGuidePanel({ guide, loading, onExample, extra }: {
  guide: Guide | null; loading?: boolean; onExample?: () => void; extra?: React.ReactNode;
}) {
  const tool = guide?.tool;
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (!tool) return;
    try {
      const seen = localStorage.getItem(SEEN_KEY + tool);
      if (seen && window.matchMedia("(max-width: 1023px)").matches) setOpen(false);
      localStorage.setItem(SEEN_KEY + tool, "1");
    } catch { /* storage blocked */ }
  }, [tool]);

  if (loading || !guide) {
    return (
      <aside className="glass p-5">
        <Skeleton className="mb-3 h-5 w-40" />
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="mb-2 h-10 w-full" />)}
      </aside>
    );
  }

  return (
    <aside className="glass overflow-hidden" aria-label="What you need">
      <button className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left lg:cursor-default"
        onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="flex items-center gap-2 font-semibold">
          <ClipboardList className="h-4 w-4 text-neon" aria-hidden />
          <span className="lg:hidden">What do I need?</span>
          <span className="hidden lg:inline">What you need</span>
        </span>
        <span className="flex items-center gap-3">
          <span className="chip"><Clock className="h-3 w-3" aria-hidden />{guide.time}</span>
          <ChevronDown className={`h-4 w-4 text-ink-muted transition lg:hidden ${open ? "rotate-180" : ""}`} aria-hidden />
        </span>
      </button>

      <div className={`${open ? "block" : "hidden"} border-t border-[color:var(--line)] px-5 pb-5 pt-3 lg:block`}>
        <ul className="divide-y divide-[color:var(--line)]">
          {guide.fields.map((f) => (
            <li key={f.key} className="py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-ink">{f.name}</span>
                <span className={`rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide
                  ${f.required ? "bg-neon/10 text-neon" : "bg-white/5 text-ink-faint"}`}>{f.required ? "Required" : "Optional"}</span>
                {(f.unit || f.example) && (
                  <span className="text-xs text-ink-faint">{[f.unit, f.example && `e.g. ${f.example}`].filter(Boolean).join(" · ")}</span>
                )}
              </div>
              {f.where && <p className="mt-0.5 text-xs text-ink-muted">{f.where}</p>}
              {f.skip && <p className="mt-0.5 text-xs text-cyan-accent/90">{f.skip}</p>}
            </li>
          ))}
        </ul>
        {extra}
        {onExample && (
          <button type="button" className="btn-secondary mt-4 w-full" onClick={onExample} disabled={!guide.available}>
            <Sparkles className="h-4 w-4 text-neon" aria-hidden /> Fill with an example
          </button>
        )}
        {guide.accuracy && <p className="mt-3 text-xs leading-relaxed text-ink-faint">{guide.accuracy}</p>}
      </div>
    </aside>
  );
}

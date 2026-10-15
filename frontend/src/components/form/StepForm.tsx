import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Spinner } from "../ui/States";

/** Step-by-step form shell with a progress indicator and Back / Next buttons. */
export function StepForm({ steps, step, onStep, onSubmit, submitting, submitLabel, children, canNext = () => true, footer }: {
  steps: string[]; step: number; onStep: (n: number) => void; onSubmit: () => void; submitting?: boolean;
  submitLabel: string; children: ReactNode; canNext?: (step: number) => boolean; footer?: ReactNode;
}) {
  const last = step === steps.length - 1;
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); if (last) onSubmit(); else if (canNext(step)) onStep(step + 1); }}>
      <ol className="mb-5 flex gap-2" aria-label="Progress">
        {steps.map((s, i) => (
          <li key={s} className="flex-1">
            <button type="button" onClick={() => i < step && onStep(i)} disabled={i > step}
              aria-current={i === step ? "step" : undefined}
              className="group w-full text-left disabled:cursor-default">
              <span className={`block h-1 rounded-full transition ${i <= step ? "bg-neon" : "bg-forest-700"}`} />
              <span className={`mt-1.5 hidden text-xs sm:block ${i === step ? "text-ink" : "text-ink-faint"}`}>
                {i + 1}. {s}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="mb-4 text-xs text-ink-faint sm:hidden">Step {step + 1} of {steps.length}: <span className="text-ink">{steps[step]}</span></p>
      <div className="space-y-5">{children}</div>
      <div className="mt-6 flex items-center justify-between gap-2">
        {step > 0
          ? <button type="button" className="btn-ghost" onClick={() => onStep(step - 1)}><ArrowLeft className="h-4 w-4" />Back</button>
          : <span />}
        {last
          ? <button type="submit" className="btn-primary" disabled={submitting}>{submitting && <Spinner />}{submitLabel}</button>
          : <button type="submit" className="btn-primary">Next<ArrowRight className="h-4 w-4" /></button>}
      </div>
      {footer}
    </form>
  );
}

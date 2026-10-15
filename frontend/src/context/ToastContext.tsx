import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

type Kind = "success" | "error" | "info";
interface Toast { id: number; kind: Kind; message: string }

const Ctx = createContext<(kind: Kind, message: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const remove = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));
  const push = useCallback((kind: Kind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, kind, message }]);
    setTimeout(() => remove(id), kind === "error" ? 7000 : 4000);
  }, []);

  const icon = { success: CheckCircle2, error: TriangleAlert, info: Info };
  const color = { success: "text-neon", error: "text-danger", info: "text-cyan-accent" };

  return (
    <Ctx.Provider value={push}>
      {children}
      {/* top-centre on mobile and top-right on desktop, so the assistant (bottom-right) never covers toasts */}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[80] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6"
           role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icon = icon[t.kind];
          return (
            <div key={t.id} className="glass-strong pointer-events-auto flex w-full max-w-sm items-start gap-3 px-4 py-3 text-sm animate-fade-up">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color[t.kind]}`} aria-hidden />
              <p className="flex-1 text-ink">{t.message}</p>
              <button className="text-ink-faint hover:text-ink" onClick={() => remove(t.id)} aria-label="Dismiss notification">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

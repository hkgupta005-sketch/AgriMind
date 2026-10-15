import { useEffect, useState, type ReactNode } from "react";
import { History, Trash2 } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import type { Page } from "../../lib/types";
import { useSession } from "../../context/SessionContext";
import { useToast } from "../../context/ToastContext";
import { ConfirmationDialog } from "./Dialog";
import { EmptyState, ErrorState, LoadingState } from "./States";
import { Panel } from "./Panel";
import { dateTime } from "../../lib/format";

/** Owner-scoped history with paging and confirmed delete. */
export function HistoryList<T extends { id: number; created_at: string }>({ title, path, deletePath, render, empty, pageSize = 8 }: {
  title: string; path: string; deletePath: (id: number) => string; render: (item: T) => ReactNode;
  empty: { title: string; text: string }; pageSize?: number;
}) {
  const { dataVersion, ready, user, bumpData } = useSession();
  const toast = useToast();
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [confirm, setConfirm] = useState<T | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load(p: number) {
    setLoading(true);
    setError(null);
    try {
      const sep = path.includes("?") ? "&" : "?";
      const r = await api<Page<T>>(`${path}${sep}page=${p}&page_size=${pageSize}`);
      setItems((prev) => (p === 1 ? r.items : [...prev, ...r.items]));
      setTotal(r.total);
      setPage(p);
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (ready && user) load(1); else if (ready) setLoading(false); }, [path, dataVersion, ready, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function remove() {
    if (!confirm) return;
    setDeleting(true);
    try {
      await api(deletePath(confirm.id), { method: "DELETE" });
      setItems((it) => it.filter((x) => x.id !== confirm.id));
      setTotal((t) => t - 1);
      toast("success", "Deleted.");
      setConfirm(null);
      bumpData();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Panel title={title} icon={History} subtitle={total ? `${total} saved` : undefined}>
      {error ? <ErrorState error={error} onRetry={() => load(1)} compact />
        : loading && !items.length ? <LoadingState />
        : !items.length ? <EmptyState icon={History} title={empty.title} text={empty.text} compact />
        : (
          <ul className="divide-y divide-[color:var(--line)]">
            {items.map((it) => (
              <li key={it.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  {render(it)}
                  <p className="mt-1 text-[11px] text-ink-faint">{dateTime(it.created_at)}</p>
                </div>
                <button className="btn-ghost p-2 text-ink-faint hover:text-danger" onClick={() => setConfirm(it)} aria-label="Delete this record">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      {items.length < total && (
        <button className="btn-ghost btn-sm mt-2 w-full" onClick={() => load(page + 1)} disabled={loading}>{loading ? "Loading…" : "Show more"}</button>
      )}
      <ConfirmationDialog open={!!confirm} title="Delete this record?" busy={deleting}
        message="It will be removed from your history and dashboard. This cannot be undone."
        onConfirm={remove} onCancel={() => setConfirm(null)} />
    </Panel>
  );
}

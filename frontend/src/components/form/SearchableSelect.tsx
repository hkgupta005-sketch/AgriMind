import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Spinner } from "../ui/States";

export interface Option { value: string; label?: string; hint?: string }
export type Resolver = (text: string) => Promise<{ match: string | null; suggestions: string[]; how: string | null }>;

/**
 * Accessible combobox. Typing filters the list; on Enter/blur the text is resolved by the backend
 * (short forms like "UP", Hindi names like "aloo", small spelling mistakes) and the understood
 * value is shown as "✓ Deoria".
 */
export function SearchableSelect({ id, value, onChange, options, priority, priorityLabel, placeholder, disabled,
  invalid, resolver, display = (v) => v, emptyText = "No matches" }: {
  id?: string; value: string; onChange: (v: string) => void; options: Option[]; priority?: Option[]; priorityLabel?: string;
  placeholder?: string; disabled?: boolean; invalid?: boolean; resolver?: Resolver; display?: (v: string) => string;
  emptyText?: string;
}) {
  const listId = useId();
  const [text, setText] = useState(value ? display(value) : "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [resolving, setResolving] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => { setText(value ? display(value) : ""); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const all = useMemo(() => {
    const seen = new Set<string>();
    const out: (Option & { group?: string })[] = [];
    (priority ?? []).forEach((o) => { if (!seen.has(o.value)) { seen.add(o.value); out.push({ ...o, group: priorityLabel }); } });
    options.forEach((o) => { if (!seen.has(o.value)) { seen.add(o.value); out.push({ ...o, group: priority?.length ? "All" : undefined }); } });
    return out;
  }, [options, priority, priorityLabel]);

  const q = text.trim().toLowerCase();
  const typing = q && (!value || q !== display(value).toLowerCase());
  const filtered = useMemo(() => {
    if (!typing) return all.slice(0, 300);
    const starts = all.filter((o) => (o.label ?? o.value).toLowerCase().startsWith(q));
    const inside = all.filter((o) => !(o.label ?? o.value).toLowerCase().startsWith(q) && (o.label ?? o.value).toLowerCase().includes(q));
    return [...starts, ...inside].slice(0, 300);
  }, [all, q, typing]);

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function pick(v: string, how?: string | null) {
    onChange(v);
    setText(display(v));
    setOpen(false);
    setSuggestions([]);
    setNote(how && how !== "exact" && text.trim() && text.trim().toLowerCase() !== v.toLowerCase() ? `✓ “${text.trim()}” → ${display(v)}` : null);
  }

  async function commit() {
    const t = text.trim();
    if (!t) { if (value) onChange(""); setNote(null); return; }
    if (value && t.toLowerCase() === display(value).toLowerCase()) return;
    const exact = all.find((o) => (o.label ?? o.value).toLowerCase() === t.toLowerCase() || o.value.toLowerCase() === t.toLowerCase());
    if (exact) return pick(exact.value, "exact");
    if (resolver) {
      setResolving(true);
      try {
        const r = await resolver(t);
        if (r.match) return pick(r.match, r.how);
        setSuggestions(r.suggestions);
        setNote(null);
        if (value) onChange("");
      } catch { /* leave as typed */ } finally { setResolving(false); }
    } else if (filtered.length === 1) {
      pick(filtered[0].value, "prefix");
    }
  }

  return (
    <div ref={wrap} className="relative"
      onBlur={(e) => { if (!wrap.current?.contains(e.relatedTarget as Node)) { setOpen(false); commit(); } }}>
      <div className="relative">
        <input id={id} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
          aria-invalid={invalid || undefined} autoComplete="off" disabled={disabled}
          aria-activedescendant={open && filtered[active] ? `${listId}-${active}` : undefined}
          className={`input pr-9 ${invalid ? "input-error" : ""}`} placeholder={placeholder} value={text}
          onChange={(e) => { setText(e.target.value); setOpen(true); setNote(null); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter") {
              e.preventDefault();
              if (open && typing && filtered[active]) pick(filtered[active].value, "prefix");
              else if (open && !typing && filtered[active]) pick(filtered[active].value, "exact");
              else commit();
            } else if (e.key === "Escape") setOpen(false);
          }} />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-faint">
          {resolving ? <Spinner /> : <ChevronDown className="h-4 w-4" aria-hidden />}
        </span>
      </div>
      {open && !disabled && (
        <ul ref={list} id={listId} role="listbox"
          className="glass-strong absolute z-40 mt-1 max-h-64 w-full overflow-y-auto py-1 text-sm">
          {filtered.length === 0 && <li className="px-3 py-2 text-ink-muted">{resolver && text ? "Press Enter to search our names list" : emptyText}</li>}
          {filtered.map((o, i) => (
            <li key={o.value}>
              {o.group && (i === 0 || filtered[i - 1].group !== o.group) && !typing && (
                <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{o.group}</p>
              )}
              <button type="button" tabIndex={-1} id={`${listId}-${i}`} data-index={i} role="option" aria-selected={o.value === value}
                onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o.value, "exact")}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left ${i === active ? "bg-neon/10 text-ink" : "text-ink-muted"}`}>
                <span>{o.label ?? display(o.value)}{o.hint && <span className="ml-2 text-xs text-ink-faint">{o.hint}</span>}</span>
                {o.value === value && <Check className="h-4 w-4 text-neon" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {note && <p className="mt-1 text-xs text-neon">{note}</p>}
      {suggestions.length > 0 && (
        <div className="mt-1.5 text-xs text-ink-muted">
          Not found. Did you mean:{" "}
          {suggestions.slice(0, 5).map((s) => (
            <button key={s} type="button" className="chip mr-1 mt-1 hover:text-neon" onClick={() => pick(s, "exact")}>{display(s)}</button>
          ))}
        </div>
      )}
    </div>
  );
}

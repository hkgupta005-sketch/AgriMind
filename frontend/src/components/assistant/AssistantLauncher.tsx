import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight, ImagePlus, Minus, Plus, SendHorizontal, Sparkles, X } from "lucide-react";
import { AssistantCharacter, type CharacterMood } from "./AssistantCharacter";
import { SafeMarkdown } from "./SafeMarkdown";
import { useAssistant } from "../../context/AssistantContext";
import { usePrefersReducedMotion } from "../../hooks/useApi";
import { useToast } from "../../context/ToastContext";

const SUGGESTIONS: Record<string, string[]> = {
  "/dashboard": ["What can you do?", "Which crop suits my soil?"],
  "/production": ["Expected rice yield in my district?", "Which crops grow most in Punjab?"],
  "/irrigation": ["Does my field need water today?", "How do I check soil moisture by hand?"],
  "/leaf-prediction": ["How do I take a good leaf photo?", "Which plants can you check?"],
  "/crop-price": ["Onion price at my mandi?", "Aloo ka bhav Aligarh mandi mein?"],
  "/crop-analysis": ["What does a Soil Health Card show?", "What soil does rice need?"],
};
const DEFAULT_SUGGESTIONS = ["What can you do?", "Which crop suits my soil?", "Onion price at my mandi?"];
const GREET_KEY = "agrimind.greetingDismissed";

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-1 py-1" aria-label="Assistant is typing">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-neon/80" style={{ animationDelay: `${i * 140}ms` }} />
      ))}
    </div>
  );
}

function ChatPanel({ onClose, reduced }: { onClose: () => void; reduced: boolean }) {
  const { messages, sending, status, send, newChat } = useAssistant();
  const { pathname } = useLocation();
  const toast = useToast();
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: reduced ? "auto" : "smooth" }); }, [messages, sending, reduced]);

  const suggestions = SUGGESTIONS[pathname] ?? DEFAULT_SUGGESTIONS;
  const submit = () => {
    if (sending || (!text.trim() && !photo)) return;
    send(text, photo);
    setText("");
    setPhoto(null);
  };
  const statusText = status === "thinking" ? "Thinking…" : status === "unavailable" ? "Unavailable" : "Online";
  const statusDot = status === "thinking" ? "bg-warn" : status === "unavailable" ? "bg-danger" : "bg-neon";

  return (
    <div role="dialog" aria-label="AgriMind Assistant" aria-modal="false"
      className="glass-strong fixed inset-x-0 bottom-0 z-[65] flex h-[100svh] flex-col overflow-hidden rounded-none border-[color:var(--line-strong)]
        origin-bottom-right animate-pop-in sm:inset-x-auto sm:bottom-[calc(24px+88px+12px)] sm:right-6 sm:h-[560px] sm:max-h-[calc(100vh-140px)] sm:w-[380px] sm:rounded-2xl"
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <header className="flex items-center gap-3 border-b border-[color:var(--line)] px-3 py-2.5" style={{ paddingTop: "max(.625rem, env(safe-area-inset-top))" }}>
        <span className="grid h-11 w-11 place-items-center overflow-visible">
          <AssistantCharacter size={44} mood={sending ? "thinking" : "idle"} reduced={reduced} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">AgriMind Assistant</p>
          <p className="flex items-center gap-1.5 text-xs text-ink-muted"><span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />{statusText}</p>
        </div>
        <button className="btn-ghost p-2" onClick={newChat} aria-label="New chat" title="New chat"><Plus className="h-4 w-4" /></button>
        <button className="btn-ghost hidden p-2 sm:inline-flex" onClick={onClose} aria-label="Minimise assistant" title="Minimise"><Minus className="h-4 w-4" /></button>
        <button className="btn-ghost p-2" onClick={onClose} aria-label="Close assistant" title="Close"><X className="h-4 w-4" /></button>
      </header>

      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-3 py-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="px-1">
            <div className="mb-4 flex items-center gap-3">
              <img src="/assets/assistant/agrimind-farmer.webp" alt="" className="h-14 w-14 rounded-full border border-[color:var(--line)] object-cover" />
              <p className="text-sm text-ink-muted"><span className="font-semibold text-ink">Namaste!</span> Ask me about yield, irrigation, leaf disease, mandi prices or which crop to grow. English, Hindi or Hinglish.</p>
            </div>
            <p className="mb-2 text-xs text-ink-faint">Try asking</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button key={s} className="chip hover:border-neon/50 hover:text-ink" onClick={() => send(s)}><Sparkles className="h-3 w-3 text-neon" />{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role !== "user" && (
              <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full border border-[color:var(--line)] bg-forest-800">
                <img src="/assets/assistant/agrimind-farmer.webp" alt="" className="h-7 w-7 object-cover" />
              </span>
            )}
            <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed
              ${m.role === "user" ? "rounded-br-md bg-neon/90 text-forest-950"
                : m.role === "error" ? "rounded-bl-md border border-danger/30 bg-danger/10 text-ink"
                : "rounded-bl-md border border-[color:var(--line)] bg-forest-800/80 text-ink/90"}`}>
              {m.image && <img src={m.image} alt="Attached leaf" className="mb-2 max-h-36 rounded-lg" />}
              {m.role === "user" ? <p className="whitespace-pre-wrap">{m.text}</p> : <SafeMarkdown text={m.text} />}
              {!!m.tools?.length && (
                <div className="mt-2 flex flex-wrap gap-1.5 border-t border-white/5 pt-2">
                  {m.tools.map((t) => (
                    <span key={t.name} className="inline-flex items-center gap-1 rounded-full bg-black/25 px-2 py-0.5 text-[11px] text-cyan-accent">
                      Used: {t.label}
                      {t.link && <Link to={t.link} onClick={onClose} className="ml-1 inline-flex items-center text-neon hover:underline">Open<ArrowUpRight className="h-3 w-3" /></Link>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex gap-2">
            <span className="h-7 w-7" />
            <div className="rounded-2xl rounded-bl-md border border-[color:var(--line)] bg-forest-800/80 px-3 py-2"><TypingIndicator /></div>
          </div>
        )}
      </div>

      <div className="border-t border-[color:var(--line)] p-3" style={{ paddingBottom: "max(.75rem, env(safe-area-inset-bottom))" }}>
        {photo && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-forest-950/60 px-2 py-1.5 text-xs text-ink-muted">
            <ImagePlus className="h-3.5 w-3.5 text-neon" />
            <span className="flex-1 truncate">{photo.name}</span>
            <button onClick={() => setPhoto(null)} aria-label="Remove photo" className="hover:text-ink"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input ref={fileInput} type="file" accept="image/jpeg,image/png" className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (f.size > 8 * 1024 * 1024) return toast("error", "The photo is larger than 8 MB.");
              if (!/image\/(jpeg|png)/.test(f.type)) return toast("error", "Please attach a JPG or PNG photo.");
              setPhoto(f);
            }} />
          <button className="btn-ghost p-2.5" onClick={() => fileInput.current?.click()} aria-label="Attach a leaf photo" title="Attach a leaf photo">
            <ImagePlus className="h-4 w-4" />
          </button>
          <label htmlFor="assistant-input" className="sr-only">Message</label>
          <textarea id="assistant-input" ref={input} rows={1} value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder="Ask about your farm…" maxLength={2000}
            className="input max-h-32 min-h-[42px] resize-none py-2.5" style={{ fieldSizing: "content" } as React.CSSProperties} />
          <button className="btn-primary p-2.5" onClick={submit} disabled={sending || (!text.trim() && !photo)} aria-label="Send message">
            <SendHorizontal className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-ink-faint">AgriMind Assistant can make mistakes. Check important decisions with an expert.</p>
      </div>
    </div>
  );
}

/** Floating launcher (bottom-right, every page) + chat panel. */
export function AssistantLauncher() {
  const { open, setOpen, unread, sending, justAnswered } = useAssistant();
  const reduced = usePrefersReducedMotion();
  const [hover, setHover] = useState(false);
  const [happy, setHappy] = useState(false);
  const [greet, setGreet] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(open);

  useEffect(() => {
    let dismissed = false;
    try { dismissed = localStorage.getItem(GREET_KEY) === "1" || sessionStorage.getItem(GREET_KEY) === "1"; } catch { /* ignore */ }
    if (dismissed) return;
    const t = setTimeout(() => { setGreet(true); try { sessionStorage.setItem(GREET_KEY, "1"); } catch { /* ignore */ } }, 4000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!justAnswered) return;
    setHappy(true);
    const t = setTimeout(() => setHappy(false), 900);
    return () => clearTimeout(t);
  }, [justAnswered]);
  useEffect(() => {
    if (wasOpen.current && !open) button.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const closeGreeting = () => { setGreet(false); try { localStorage.setItem(GREET_KEY, "1"); } catch { /* ignore */ } };
  const mood: CharacterMood = sending ? "thinking" : happy ? "happy" : hover ? "hover" : "idle";

  return (
    <>
      {open && <ChatPanel onClose={() => setOpen(false)} reduced={reduced} />}
      <div className={`fixed z-[66] ${open ? "hidden sm:block" : ""}`}
        style={{ right: "max(16px, env(safe-area-inset-right))", bottom: "max(16px, env(safe-area-inset-bottom))" }}>
        {greet && !open && (
          <div className="glass-strong absolute bottom-full right-0 mb-3 w-60 p-3 pr-8 text-sm animate-fade-up">
            <p><span className="font-semibold text-neon">Namaste!</span> Ask me anything about your farm.</p>
            <button className="absolute right-2 top-2 text-ink-faint hover:text-ink" onClick={closeGreeting} aria-label="Dismiss greeting"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}
        <button ref={button} aria-label={open ? "Close AgriMind assistant" : "Open AgriMind assistant"} aria-expanded={open}
          onClick={() => { setOpen(!open); closeGreeting(); }}
          onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)} onPointerLeave={() => setHover(false)}
          onFocus={() => setHover(true)} onBlur={() => setHover(false)}
          className="relative grid h-[64px] w-[64px] place-items-center rounded-full bg-forest-900/70 shadow-[0_0_0_1px_rgba(57,242,122,.35),0_10px_30px_-8px_rgba(0,0,0,.7),0_0_28px_-6px_rgba(57,242,122,.5)]
            backdrop-blur-md transition hover:shadow-[0_0_0_1px_rgba(57,242,122,.6),0_0_34px_-4px_rgba(57,242,122,.7)] sm:h-[84px] sm:w-[84px] sm:right-2">
          <span className="block sm:hidden"><AssistantCharacter size={60} mood={mood} reduced={reduced} /></span>
          <span className="hidden sm:block"><AssistantCharacter size={80} mood={mood} reduced={reduced} /></span>
          {unread && !open && <span className="absolute right-1 top-1 h-3.5 w-3.5 rounded-full border-2 border-forest-900 bg-danger" aria-label="New reply" />}
        </button>
      </div>
    </>
  );
}

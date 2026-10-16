import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "../lib/api";
import type { ChatReply, ToolUsed } from "../lib/types";
import { useSession } from "./SessionContext";

export interface ChatMsg { id: string; role: "user" | "assistant" | "error"; text: string; tools?: ToolUsed[]; image?: string; at: string }

interface Assistant {
  open: boolean; setOpen: (v: boolean) => void;
  messages: ChatMsg[]; sending: boolean; unread: boolean;
  status: "online" | "thinking" | "unavailable";
  send: (text: string, photo?: File | null) => Promise<void>;
  newChat: () => void;
  justAnswered: number;
}

const Ctx = createContext<Assistant | null>(null);
const STORE = "agrimind.chat";

/** Conversation state lives above the router so it survives page changes. Guests keep it for the
 * browser session only (sessionStorage); signed-in users' chats are also saved by the backend. */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const { user, health } = useSession();
  const [open, setOpenState] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(STORE) ?? "{}").messages ?? []; } catch { return []; }
  });
  const conversation = useRef<string | null>((() => {
    try { return JSON.parse(sessionStorage.getItem(STORE) ?? "{}").conversation ?? null; } catch { return null; }
  })());
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(false);
  const [justAnswered, setJustAnswered] = useState(0);
  const openRef = useRef(open);
  openRef.current = open;
  const loadedFor = useRef<number | null>(null);

  useEffect(() => {
    try { sessionStorage.setItem(STORE, JSON.stringify({ messages: messages.slice(-60).map(({ image, ...m }) => m), conversation: conversation.current })); } catch { /* ignore */ }
  }, [messages]);

  // signed-in users: reopen their latest saved conversation
  useEffect(() => {
    if (!user || user.is_guest || loadedFor.current === user.id || messages.length) return;
    loadedFor.current = user.id;
    (async () => {
      try {
        const h = await api<{ items: { id: string }[] }>("/chat/history");
        if (!h.items.length) return;
        const c = await api<{ id: string; messages: { role: "user" | "assistant"; text: string; tools_used: ToolUsed[]; created_at: string }[] }>(`/chat/${h.items[0].id}`);
        conversation.current = c.id;
        setMessages(c.messages.map((m, i) => ({ id: `${c.id}-${i}`, role: m.role, text: m.text, tools: m.tools_used, at: m.created_at })));
      } catch { /* history is optional */ }
    })();
  }, [user, messages.length]);

  const setOpen = useCallback((v: boolean) => { setOpenState(v); if (v) setUnread(false); }, []);

  const send = useCallback(async (text: string, photo?: File | null) => {
    const clean = text.trim();
    if ((!clean && !photo) || sending) return;
    const now = new Date().toISOString();
    setMessages((m) => [...m, { id: `u${Date.now()}`, role: "user", text: clean || "Please check this leaf photo.", at: now,
      image: photo ? URL.createObjectURL(photo) : undefined }]);
    setSending(true);
    try {
      const page = window.location.pathname;
      let r: ChatReply;
      if (photo) {
        const form = new FormData();
        form.append("photo", photo);
        form.append("message", clean);
        if (conversation.current) form.append("conversation_id", conversation.current);
        r = await api<ChatReply>("/chat/image", { form, timeoutMs: 130000 });
      } else {
        r = await api<ChatReply>("/chat", { body: { message: clean, conversation_id: conversation.current, page }, timeoutMs: 130000 });
      }
      conversation.current = r.conversation_id;
      setMessages((m) => [...m, { id: `a${Date.now()}`, role: "assistant", text: r.reply, tools: r.tools_used, at: new Date().toISOString() }]);
      setJustAnswered((n) => n + 1);
      if (!openRef.current) setUnread(true);
    } catch (e) {
      const msg = e instanceof ApiError
        ? (typeof e.detail === "string" && e.detail && !e.message.includes(e.detail) ? `${e.message} (${e.detail})` : e.message)
        : e instanceof Error ? `Error: ${e.message}` : String(e);
      setMessages((m) => [...m, { id: `e${Date.now()}`, role: "error", text: msg, at: new Date().toISOString() }]);
      if (!openRef.current) setUnread(true);
    } finally {
      setSending(false);
    }
  }, [sending]);

  const newChat = useCallback(() => { conversation.current = null; setMessages([]); }, []);

  const status = sending ? "thinking" : health && (health.assistant === "unavailable" || health.models.chatbot.state === "missing" || health.models.chatbot.state === "error") ? "unavailable" : "online";

  const value = useMemo(() => ({ open, setOpen, messages, sending, unread, status, send, newChat, justAnswered } as Assistant),
    [open, setOpen, messages, sending, unread, status, send, newChat, justAnswered]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAssistant() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAssistant outside AssistantProvider");
  return c;
}

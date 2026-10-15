import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError, getToken, setToken } from "../lib/api";
import type { Health, Profile, User } from "../lib/types";

interface Session {
  ready: boolean;
  user: User | null;
  profile: Profile | null;
  health: Health | null;
  /** null = still checking; false = backend unreachable */
  online: boolean | null;
  /** true when history can be saved (database connected and a session exists) */
  canSave: boolean;
  refreshHealth: () => Promise<void>;
  saveProfile: (p: Partial<Profile>) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  /** increases after anything is saved; pages refetch history when it changes */
  dataVersion: number;
  bumpData: () => void;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const started = useRef(false);

  const refreshHealth = useCallback(async () => {
    try {
      setHealth(await api<Health>("/health", { timeoutMs: 8000 }));
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

  const startGuest = useCallback(async () => {
    const r = await api<{ token: string; user: User }>("/auth/guest", { method: "POST" });
    setToken(r.token);
    setUser(r.user);
    setProfile(null);
  }, []);

  const loadMe = useCallback(async () => {
    const r = await api<{ user: User; profile: Profile }>("/auth/me");
    setUser(r.user);
    setProfile(r.profile);
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      await refreshHealth();
      try {
        if (getToken()) await loadMe();
        else await startGuest();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          setToken(null);
          try { await startGuest(); } catch { /* database down: predictions still work */ }
        }
      }
      setReady(true);
    })();
  }, [refreshHealth, loadMe, startGuest]);

  // poll health while models are still loading (TensorFlow takes a while)
  useEffect(() => {
    if (!health) return;
    const loading = Object.values(health.models).some((m) => m.state === "pending" || m.state === "loading");
    if (!loading) return;
    const t = setTimeout(refreshHealth, 4000);
    return () => clearTimeout(t);
  }, [health, refreshHealth]);

  const saveProfile = useCallback(async (p: Partial<Profile>) => {
    const body = { ...(profile ?? {}), ...p };
    const r = await api<{ profile: Profile }>("/profile", { method: "PUT", body });
    setProfile(r.profile);
  }, [profile]);

  const register = useCallback(async (username: string, password: string) => {
    const r = await api<{ user: User }>("/auth/register", { body: { username, password } });
    setUser(r.user);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const r = await api<{ token: string; user: User }>("/auth/login", { body: { username, password } });
    setToken(r.token);
    await loadMe();
    setDataVersion((v) => v + 1);
  }, [loadMe]);

  const logout = useCallback(async () => {
    try { await api("/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    setToken(null);
    await startGuest();
    setDataVersion((v) => v + 1);
  }, [startGuest]);

  const deleteAccount = useCallback(async () => {
    await api("/account", { method: "DELETE" });
    setToken(null);
    await startGuest();
    setDataVersion((v) => v + 1);
  }, [startGuest]);

  const value = useMemo<Session>(() => ({
    ready, user, profile, health, online,
    canSave: !!user && !!health?.database.connected,
    refreshHealth, saveProfile, register, login, logout, deleteAccount,
    dataVersion, bumpData: () => setDataVersion((v) => v + 1),
  }), [ready, user, profile, health, online, refreshHealth, saveProfile, register, login, logout, deleteAccount, dataVersion]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSession outside SessionProvider");
  return c;
}

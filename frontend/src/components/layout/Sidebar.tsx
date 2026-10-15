import { useEffect, useRef } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ChevronsLeft, ChevronsRight, Settings, UserRound, X } from "lucide-react";
import { NAV } from "./nav";
import { Logo } from "./Logo";
import { useSession } from "../../context/SessionContext";

function NavLinks({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <ul className="space-y-1">
      {NAV.map(({ to, label, icon: Icon }) => (
        <li key={to}>
          <NavLink to={to} onClick={onNavigate} title={collapsed ? label : undefined}
            className={({ isActive }) => `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition
              ${collapsed ? "justify-center" : ""}
              ${isActive
                ? "bg-neon/[.13] text-ink shadow-[inset_0_0_0_1px_rgba(57,242,122,.35),0_0_22px_-6px_rgba(57,242,122,.45)]"
                : "text-ink/80 hover:bg-white/[.04] hover:text-ink"}`}>
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-neon shadow-[0_0_10px_#39F27A]" aria-hidden />}
                <Icon className={`h-[18px] w-[18px] shrink-0 transition ${isActive ? "text-neon drop-shadow-[0_0_6px_rgba(57,242,122,.8)]" : "text-neon/70 group-hover:text-neon"}`} aria-hidden />
                <span className={collapsed ? "sr-only" : ""}>{label}</span>
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function AccountLink({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { user, profile } = useSession();
  const name = profile?.display_name || user?.username || "Guest farmer";
  return (
    <NavLink to="/settings" onClick={onNavigate} title={collapsed ? "Profile & settings" : undefined}
      className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${collapsed ? "justify-center" : ""}
        ${isActive ? "bg-white/[.06] text-ink" : "text-ink-muted hover:bg-white/[.04] hover:text-ink"}`}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[color:var(--line)] bg-forest-800">
        <UserRound className="h-4 w-4 text-neon" aria-hidden />
      </span>
      {!collapsed && (
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-ink">{name}</span>
          <span className="block text-[11px] text-ink-faint">{user?.is_guest ? "Guest session" : "Signed in"}</span>
        </span>
      )}
      {!collapsed && <Settings className="h-4 w-4 shrink-0" aria-hidden />}
    </NavLink>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside aria-label="Main navigation"
      className={`fixed inset-y-3 left-3 z-40 hidden flex-col rounded-[22px] border border-[color:var(--line)] bg-forest-900/70
        px-3 py-4 shadow-panel backdrop-blur-xl transition-[width] duration-200 lg:flex
        ${collapsed ? "w-[76px]" : "w-[var(--sidebar-w)]"}`}>
      <Link to="/" className={`mb-6 flex px-2 ${collapsed ? "justify-center" : ""}`} aria-label="AgriMind home">
        <Logo collapsed={collapsed} tagline />
      </Link>
      {!collapsed && <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.16em] text-ink-faint">Workspace</p>}
      <nav className="flex-1 overflow-y-auto"><NavLinks collapsed={collapsed} /></nav>
      <div className="mt-4 space-y-2 border-t border-[color:var(--line)] pt-3">
        <AccountLink collapsed={collapsed} />
        <button onClick={onToggle} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-ink-faint hover:text-ink ${collapsed ? "justify-center" : ""}`}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-pressed={collapsed}>
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" />Collapse</>}
        </button>
      </div>
    </aside>
  );
}

export function MobileNavigationDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  useEffect(() => { onClose(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("a")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);

  return (
    <div className={`fixed inset-0 z-[60] lg:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity ${open ? "opacity-100" : "opacity-0"}`} onClick={onClose} />
      <div ref={panel} role="dialog" aria-modal="true" aria-label="Navigation"
        className={`absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col rounded-r-[22px] border-r border-[color:var(--line)]
          bg-forest-900/95 px-3 pb-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-xl transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="mb-6 flex items-center justify-between px-2">
          <Link to="/" tabIndex={open ? 0 : -1}><Logo tagline /></Link>
          <button className="btn-ghost p-2" onClick={onClose} aria-label="Close menu" tabIndex={open ? 0 : -1}><X className="h-5 w-5" /></button>
        </div>
        <nav className="flex-1 overflow-y-auto"><NavLinks onNavigate={onClose} /></nav>
        <div className="border-t border-[color:var(--line)] pt-3"><AccountLink onNavigate={onClose} /></div>
      </div>
    </div>
  );
}

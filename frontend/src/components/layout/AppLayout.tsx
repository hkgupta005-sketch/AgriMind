import { useCallback, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { Database, Menu, ServerCrash } from "lucide-react";
import { MobileNavigationDrawer, Sidebar } from "./Sidebar";
import { Logo } from "./Logo";
import { useSession } from "../../context/SessionContext";

function StatusBanner() {
  const { online, health, refreshHealth } = useSession();
  if (online === false) {
    return (
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm" role="alert">
        <ServerCrash className="h-4 w-4 text-danger" aria-hidden />
        <span className="flex-1">The AgriMind server is not reachable. Start the backend (<code className="text-xs">python backend/run.py</code>) and retry.</span>
        <button className="btn-secondary btn-sm" onClick={refreshHealth}>Retry</button>
      </div>
    );
  }
  if (health && !health.database.connected) {
    return (
      <div className="mb-5 flex items-center gap-3 rounded-lg border border-warn/30 bg-warn/5 px-4 py-3 text-sm" role="status">
        <Database className="h-4 w-4 text-warn" aria-hidden />
        Predictions work, but history cannot be saved: the database is not connected.
      </div>
    );
  }
  return null;
}

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("agrimind.sidebar") === "collapsed"; } catch { return false; }
  });
  const [drawer, setDrawer] = useState(false);
  const closeDrawer = useCallback(() => setDrawer(false), []);

  const toggle = () => setCollapsed((c) => {
    try { localStorage.setItem("agrimind.sidebar", c ? "open" : "collapsed"); } catch { /* ignore */ }
    return !c;
  });

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[90] focus:rounded-md focus:bg-neon focus:px-3 focus:py-2 focus:text-forest-950">
        Skip to content
      </a>
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <MobileNavigationDrawer open={drawer} onClose={closeDrawer} />

      {/* mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[color:var(--line)] bg-forest-900/80 px-4 py-3 backdrop-blur-xl lg:hidden"
        style={{ paddingTop: "max(.75rem, env(safe-area-inset-top))" }}>
        <button className="btn-ghost -ml-2 p-2" onClick={() => setDrawer(true)} aria-label="Open menu" aria-expanded={drawer}>
          <Menu className="h-5 w-5" />
        </button>
        <Link to="/dashboard" aria-label="AgriMind dashboard"><Logo /></Link>
        <span className="w-9" aria-hidden />
      </header>

      <main id="main" className={`px-4 pb-28 pt-5 transition-[padding] duration-200 sm:px-6 lg:pr-8 lg:pt-8
        ${collapsed ? "lg:pl-[108px]" : "lg:pl-[calc(var(--sidebar-w)+36px)]"}`}>
        <div className="mx-auto max-w-[1280px]">
          <StatusBanner />
          <Outlet />
        </div>
      </main>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Database, KeyRound, LogIn, LogOut, ServerCog, Trash2, UserRound } from "lucide-react";
import { PageHeader, Panel, Tabs } from "../components/ui/Panel";
import { FormField, NumberInput, RadioCards } from "../components/form/FormField";
import { SearchableSelect } from "../components/form/SearchableSelect";
import { ConfirmationDialog } from "../components/ui/Dialog";
import { Spinner, StatusBadge } from "../components/ui/States";
import { useApi } from "../hooks/useApi";
import { api, ApiError, qs } from "../lib/api";
import { ACRES_PER_HA, titleCase } from "../lib/format";
import { useSession } from "../context/SessionContext";
import { useToast } from "../context/ToastContext";

function ProfileForm() {
  const { profile, saveProfile, canSave } = useSession();
  const toast = useToast();
  const [f, setF] = useState({ display_name: "", state: "", district: "", area: "", area_unit: "ha" as "ha" | "acre", soil_type: "", weight_unit: "quintal" as "kg" | "quintal", common_crops: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const states = useApi<{ states: string[] }>("/options/production");
  const districts = useApi<{ districts: string[] }>(f.state ? `/options/production${qs({ state: f.state })}` : null);

  useEffect(() => {
    if (!profile) return;
    const unit = profile.area_unit ?? "ha";
    setF({ display_name: profile.display_name ?? "", state: profile.state ?? "", district: profile.district ?? "",
      area: profile.farm_area_ha ? String(+(unit === "acre" ? profile.farm_area_ha * ACRES_PER_HA : profile.farm_area_ha).toFixed(2)) : "",
      area_unit: unit, soil_type: profile.soil_type ?? "", weight_unit: profile.weight_unit ?? "quintal", common_crops: (profile.common_crops ?? []).join(", ") });
  }, [profile]);

  async function save() {
    const a = f.area ? parseFloat(f.area) : null;
    if (a !== null && (Number.isNaN(a) || a <= 0)) { setErr("Farm area must be greater than 0"); return; }
    setErr(null);
    setBusy(true);
    try {
      await saveProfile({
        display_name: f.display_name.trim() || null, state: f.state || null, district: f.district || null,
        farm_area_ha: a === null ? null : f.area_unit === "acre" ? a / ACRES_PER_HA : a, area_unit: f.area_unit,
        soil_type: f.soil_type || null, weight_unit: f.weight_unit,
        common_crops: f.common_crops.split(",").map((c) => c.trim()).filter(Boolean).slice(0, 20),
      });
      toast("success", "Profile saved. Forms will be prefilled with these details.");
    } catch (e) {
      toast("error", (e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Farmer profile" icon={UserRound} subtitle="Saved once, used to prefill every tool. You can still change values in each form.">
      <form noValidate onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Display name" htmlFor="s-name">
            <input id="s-name" className="input" value={f.display_name} maxLength={80} onChange={(e) => setF({ ...f, display_name: e.target.value })} placeholder="e.g. Ramesh" />
          </FormField>
          <FormField label="Farm area" htmlFor="s-area" unit={f.area_unit === "ha" ? "hectares" : "acres"} error={err}>
            <NumberInput id="s-area" value={f.area} onChange={(v) => setF({ ...f, area: v })} placeholder="e.g. 2.5" />
          </FormField>
          <FormField label="State" htmlFor="s-state">
            <SearchableSelect id="s-state" value={f.state} onChange={(v) => setF({ ...f, state: v, district: "" })} options={(states.data?.states ?? []).map((s) => ({ value: s }))}
              resolver={(q) => api(`/resolve/production${qs({ field: "state", q })}`)} placeholder="e.g. Uttar Pradesh" />
          </FormField>
          <FormField label="District" htmlFor="s-district">
            <SearchableSelect id="s-district" value={f.district} onChange={(v) => setF({ ...f, district: v })} disabled={!f.state} display={titleCase}
              options={(districts.data?.districts ?? []).map((d) => ({ value: d }))} resolver={(q) => api(`/resolve/production${qs({ field: "district", q, state: f.state })}`)} placeholder="e.g. Deoria" />
          </FormField>
        </div>
        <FormField label="Soil type">
          <RadioCards name="Soil type" value={f.soil_type} onChange={(v) => setF({ ...f, soil_type: v })} columns={4}
            options={[{ value: "Clay", label: "Clay" }, { value: "Loamy", label: "Loamy" }, { value: "Sandy", label: "Sandy" }, { value: "Silt", label: "Silt" }]} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Preferred area unit">
            <RadioCards name="Area unit" value={f.area_unit} columns={2} options={[{ value: "ha", label: "Hectares" }, { value: "acre", label: "Acres" }]}
              onChange={(u) => {
                const a = parseFloat(f.area);
                const area = Number.isNaN(a) || u === f.area_unit ? f.area : String(+(u === "acre" ? a * ACRES_PER_HA : a / ACRES_PER_HA).toFixed(2));
                setF({ ...f, area_unit: u, area });
              }} />
          </FormField>
          <FormField label="Preferred weight unit" help="1 quintal = 100 kg">
            <RadioCards name="Weight unit" value={f.weight_unit} columns={2} onChange={(u) => setF({ ...f, weight_unit: u })} options={[{ value: "quintal", label: "Quintal" }, { value: "kg", label: "Kilogram" }]} />
          </FormField>
        </div>
        <FormField label="Crops you usually grow" htmlFor="s-crops" help="Separate with commas, e.g. Rice, Wheat, Potato">
          <input id="s-crops" className="input" value={f.common_crops} onChange={(e) => setF({ ...f, common_crops: e.target.value })} />
        </FormField>
        <button className="btn-primary" disabled={busy || !canSave}>{busy && <Spinner />}Save profile</button>
      </form>
    </Panel>
  );
}

function AccountPanel() {
  const { user, register, login, logout, deleteAccount } = useSession();
  const toast = useToast();
  const [mode, setMode] = useState<"register" | "login">("register");
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  async function submit() {
    setErr(null);
    if (!/^[A-Za-z0-9_.-]{3,64}$/.test(u)) return setErr("Username: 3–64 letters, numbers, dot, dash or underscore.");
    if (p.length < 8) return setErr("Password must be at least 8 characters.");
    setBusy(true);
    try {
      if (mode === "register") { await register(u, p); toast("success", "Account created. Your guest records are now in your account."); }
      else { await login(u, p); toast("success", "Signed in."); }
      setU(""); setP("");
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Account" icon={KeyRound}>
      {user && !user.is_guest ? (
        <div className="space-y-4">
          <p className="text-sm">Signed in as <span className="font-semibold text-neon">{user.username}</span>. Your records and chats are private to this account.</p>
          <button className="btn-secondary" onClick={async () => { await logout(); toast("info", "Signed out."); }}><LogOut className="h-4 w-4" />Sign out</button>
        </div>
      ) : (
        <>
          <p className="mb-4 text-sm text-ink-muted">
            You are using a <span className="text-ink">private guest session</span>: your records are stored for this browser only.
            Create an account to keep them and use them on other devices.
          </p>
          <Tabs label="Account" value={mode} onChange={(m) => { setMode(m); setErr(null); }}
            items={[{ value: "register", label: "Create account", icon: UserRound }, { value: "login", label: "Sign in", icon: LogIn }]} />
          <form noValidate onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-3">
            <div><label className="label" htmlFor="a-user">Username</label>
              <input id="a-user" className="input" autoComplete="username" value={u} onChange={(e) => setU(e.target.value)} /></div>
            <div><label className="label" htmlFor="a-pass">Password</label>
              <input id="a-pass" type="password" className="input" autoComplete={mode === "register" ? "new-password" : "current-password"} value={p} onChange={(e) => setP(e.target.value)} />
              {mode === "register" && <p className="help">At least 8 characters.</p>}</div>
            {err && <p className="text-sm text-danger" role="alert">{err}</p>}
            {mode === "login" && <p className="text-xs text-ink-faint">Signing in switches to that account; this guest session’s records stay with the guest session.</p>}
            <button className="btn-primary" disabled={busy}>{busy && <Spinner />}{mode === "register" ? "Create account" : "Sign in"}</button>
          </form>
        </>
      )}
      <div className="mt-6 border-t border-[color:var(--line)] pt-4">
        <p className="text-sm font-medium">Delete my data</p>
        <p className="mt-1 text-xs text-ink-muted">Removes this account and every saved estimate, check, leaf thumbnail and chat. This cannot be undone.</p>
        <button className="btn-danger btn-sm mt-3" onClick={() => setConfirm(true)}><Trash2 className="h-3.5 w-3.5" />Delete everything</button>
      </div>
      <ConfirmationDialog open={confirm} title="Delete all your data?" confirmLabel="Delete everything" busy={busy}
        message="Your account and all saved records will be permanently deleted."
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setBusy(true);
          try { await deleteAccount(); toast("success", "All your data was deleted."); setConfirm(false); }
          catch (e) { toast("error", (e as Error).message); } finally { setBusy(false); }
        }} />
    </Panel>
  );
}

function SystemPanel() {
  const { health, refreshHealth } = useSession();
  const tone = (s: string) => (s === "ready" ? "green" : s === "loading" || s === "pending" ? "amber" : "red") as "green" | "amber" | "red";
  return (
    <Panel title="System status" icon={ServerCog} actions={<button className="btn-ghost btn-sm" onClick={refreshHealth}>Refresh</button>}>
      {!health ? <p className="text-sm text-ink-muted">Server not reachable.</p> : (
        <ul className="space-y-2 text-sm">
          <li className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><Database className="h-4 w-4 text-neon" />Database ({health.database.backend === "mysql" ? "MySQL" : health.database.backend === "none" ? "none — saving off" : "local SQLite"})</span>
            <StatusBadge tone={health.database.connected ? "green" : "red"}>{health.database.connected ? "connected" : "not connected"}</StatusBadge></li>
          {Object.entries(health.models).map(([k, m]) => (
            <li key={k} className="flex items-center justify-between gap-2"><span>{m.label}</span><StatusBadge tone={tone(m.state)}>{m.state}</StatusBadge></li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader eyebrow="Profile & settings" title="Your profile" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <ProfileForm />
        <div className="space-y-5"><AccountPanel /><SystemPanel /></div>
      </div>
    </>
  );
}

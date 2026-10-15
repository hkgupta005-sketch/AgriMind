import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity as ActivityIcon, ArrowRight, BarChart3, CalendarDays, ChartNoAxesCombined, ClipboardPen, Droplets, Leaf, MapPin,
  RefreshCw, ScanSearch, Settings, Sprout, Zap, type LucideIcon,
} from "lucide-react";
import { Panel } from "../components/ui/Panel";
import { EmptyState, ErrorState, Skeleton, StatusBadge, needTone } from "../components/ui/States";
import { EstimateVsActualChart, MoistureChart, PriceEstimatesChart, YieldHistoryChart } from "../components/charts/Charts";
import { Dialog } from "../components/ui/Dialog";
import { SearchableSelect } from "../components/form/SearchableSelect";
import { useApi } from "../hooks/useApi";
import { api, qs } from "../lib/api";
import { fmt, rupees, timeAgo, titleCase } from "../lib/format";
import type { Activity, CropRecord, IrrigationRecord, LeafRecord, Page, PriceRecord, ProductionEstimate, ProductionRecord, Profile } from "../lib/types";
import { useSession } from "../context/SessionContext";
import { useToast } from "../context/ToastContext";

interface Summary {
  profile: Profile;
  filters: { range: string; crop: string | null; commodity: string | null; crops: string[]; commodities: string[] };
  production: { latest_estimate: ProductionEstimate | null; latest_record: ProductionRecord | null; series: { year: number; estimate_t?: number; actual_t?: number }[] };
  irrigation: { latest: IrrigationRecord | null; counts: Record<"Low" | "Medium" | "High", number>; series: { date: string; moisture: number; source: string; need: string; crop: string }[] };
  leaf: { latest: LeafRecord | null };
  price: { latest: PriceRecord | null; series: { date: string; market: string; estimate: number; low: number; high: number }[]; series_kind: string };
  crop: { latest: CropRecord | null };
}

const KIND_ICON: Record<string, LucideIcon> = { production: Sprout, tracking: ClipboardPen, irrigation: Droplets, leaf: Leaf, price: ChartNoAxesCombined, crop: ScanSearch };
const RANGES = [{ value: "all", label: "All time" }, { value: "7d", label: "Last 7 days" }, { value: "30d", label: "Last 30 days" }, { value: "90d", label: "Last 90 days" }, { value: "365d", label: "Last year" }];

function SummaryCard({ icon: Icon, title, to, children, empty, cta }: { icon: LucideIcon; title: string; to: string; children?: React.ReactNode; empty?: string; cta: string }) {
  return (
    <Link to={to} className="glass card-link group flex flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium text-ink-muted"><Icon className="h-4 w-4 text-neon" />{title}</span>
        <ArrowRight className="h-4 w-4 text-ink-faint transition group-hover:translate-x-0.5 group-hover:text-neon" />
      </div>
      {children ?? (
        <div className="flex flex-1 flex-col justify-between">
          <p className="text-sm text-ink-muted">{empty}</p>
          <span className="mt-3 text-xs font-semibold text-neon">{cta} →</span>
        </div>
      )}
    </Link>
  );
}

function LocationDialog({ open, onClose, profile }: { open: boolean; onClose: () => void; profile: Profile | null }) {
  const { saveProfile, bumpData } = useSession();
  const toast = useToast();
  const [state, setState] = useState(profile?.state ?? "");
  const [district, setDistrict] = useState(profile?.district ?? "");
  const [busy, setBusy] = useState(false);
  const states = useApi<{ states: string[] }>(open ? "/options/production" : null);
  const districts = useApi<{ districts: string[] }>(open && state ? `/options/production${qs({ state })}` : null);
  return (
    <Dialog open={open} onClose={onClose} title="Your farm location">
      <p className="mb-4 text-sm text-ink-muted">Used to prefill forms and to show past yields for your district. You can change it any time.</p>
      <div className="space-y-4">
        <div><label className="label" htmlFor="loc-state">State</label>
          <SearchableSelect id="loc-state" value={state} onChange={(v) => { setState(v); setDistrict(""); }} options={(states.data?.states ?? []).map((s) => ({ value: s }))}
            resolver={(q) => api(`/resolve/production${qs({ field: "state", q })}`)} placeholder="e.g. Uttar Pradesh" /></div>
        <div><label className="label" htmlFor="loc-district">District</label>
          <SearchableSelect id="loc-district" value={district} onChange={setDistrict} disabled={!state} display={titleCase}
            options={(districts.data?.districts ?? []).map((d) => ({ value: d }))} resolver={(q) => api(`/resolve/production${qs({ field: "district", q, state })}`)} placeholder="e.g. Deoria" /></div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy || !state} onClick={async () => {
          setBusy(true);
          try { await saveProfile({ state, district: district || null }); toast("success", "Location saved."); bumpData(); onClose(); }
          catch (e) { toast("error", (e as Error).message); } finally { setBusy(false); }
        }}>Save location</button>
      </div>
    </Dialog>
  );
}

export default function DashboardPage() {
  const { profile, user, dataVersion, canSave, ready } = useSession();
  const [range, setRange] = useState("all");
  const [crop, setCrop] = useState("");
  const [commodity, setCommodity] = useState("");
  const [locOpen, setLocOpen] = useState(false);
  const enabled = ready && !!user;
  const summary = useApi<Summary>(enabled ? `/dashboard/summary${qs({ range, crop, commodity })}` : null, [dataVersion]);
  const activity = useApi<Page<Activity>>(enabled ? `/dashboard/activity${qs({ range, page_size: 8 })}` : null, [dataVersion]);
  const s = summary.data;
  const prodCrop = s?.filters.crop;
  const loc = s?.profile;
  const districtHist = useApi<{ rows: any[]; source: string }>(
    loc?.state && loc?.district && prodCrop ? `/production/district-history${qs({ state: loc.state, district: loc.district, crop: prodCrop })}` : null);

  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const refresh = () => { summary.reload(); activity.reload(); districtHist.reload(); };
  const name = profile?.display_name || user?.username;

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-1.5 flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{today}</p>
          <h1 className="text-2xl font-semibold sm:text-3xl">Welcome to AgriMind{name ? `, ${name}` : ""}</h1>
          <p className="mt-1 text-ink-muted">Your intelligent farming overview</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-secondary" onClick={() => setLocOpen(true)} disabled={!canSave}>
            <MapPin className="h-4 w-4 text-neon" />{profile?.state ? `${profile.district ? titleCase(profile.district) + ", " : ""}${profile.state}` : "Set location"}
          </button>
          <button className="btn-secondary" onClick={refresh} aria-label="Refresh dashboard" disabled={summary.loading}>
            <RefreshCw className={`h-4 w-4 ${summary.loading ? "animate-spin" : ""}`} />Refresh
          </button>
          <Link to="/settings" className="btn-ghost p-2.5" aria-label="Profile and settings"><Settings className="h-4 w-4" /></Link>
        </div>
      </header>

      {/* filters */}
      <div className="glass mb-5 flex flex-wrap items-center gap-3 p-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Filters</span>
        <label className="sr-only" htmlFor="f-range">Date range</label>
        <select id="f-range" className="input w-auto py-1.5 text-xs" value={range} onChange={(e) => setRange(e.target.value)}>
          {RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <label className="sr-only" htmlFor="f-crop">Crop</label>
        <select id="f-crop" className="input w-auto py-1.5 text-xs" value={crop} onChange={(e) => setCrop(e.target.value)} disabled={!s?.filters.crops.length}
          title={!s?.filters.crops.length ? "Run a production estimate first" : undefined}>
          <option value="">{s?.filters.crops.length ? "Latest production crop" : "No crops yet"}</option>
          {s?.filters.crops.map((c) => <option key={c}>{c}</option>)}
        </select>
        <label className="sr-only" htmlFor="f-commodity">Market crop</label>
        <select id="f-commodity" className="input w-auto py-1.5 text-xs" value={commodity} onChange={(e) => setCommodity(e.target.value)} disabled={!s?.filters.commodities.length}
          title={!s?.filters.commodities.length ? "Run a price estimate first" : undefined}>
          <option value="">{s?.filters.commodities.length ? "Latest market crop" : "No market crops yet"}</option>
          {s?.filters.commodities.map((c) => <option key={c}>{c}</option>)}
        </select>
        {(range !== "all" || crop || commodity) && <button className="btn-ghost btn-sm" onClick={() => { setRange("all"); setCrop(""); setCommodity(""); }}>Clear</button>}
      </div>

      {summary.error && <div className="mb-5"><ErrorState error={summary.error} onRetry={summary.reload} /></div>}

      {/* summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {!s && (summary.loading || !ready) ? [0, 1, 2, 3, 4].map((i) => <div key={i} className="glass p-4"><Skeleton className="mb-3 h-4 w-28" /><Skeleton className="h-8 w-24" /><Skeleton className="mt-2 h-3 w-36" /></div>) : (
          <>
            <SummaryCard icon={Sprout} title="Crop Production" to="/production" cta="Estimate your yield"
              empty="No production estimate yet. Enter your field to see expected yield.">
              {s?.production.latest_estimate || s?.production.latest_record ? (() => {
                const e = s.production.latest_estimate, r = s.production.latest_record;
                return (
                  <div>
                    <p className="text-sm text-ink">{(e ?? r)!.crop} · {fmt((e ?? r)!.area_ha)} ha</p>
                    {e && <p className="mt-1 font-display text-2xl font-semibold">≈ {fmt(e.production_t)} t</p>}
                    <p className="text-xs text-ink-muted">{e ? `AI estimate, ${e.season} ${e.crop_year}` : ""}
                      {r?.actual_production_t != null && <span className="block">Actual harvest: {fmt(r.actual_production_t)} t ({r.crop_year})</span>}</p>
                  </div>
                );
              })() : undefined}
            </SummaryCard>
            <SummaryCard icon={Droplets} title="Irrigation Status" to="/irrigation" cta="Check your field" empty="No irrigation check yet. Answer 8 quick questions.">
              {s?.irrigation.latest ? (
                <div>
                  <div className="flex items-center gap-2"><span className="font-display text-2xl font-semibold">{s.irrigation.latest.need}</span><StatusBadge tone={needTone(s.irrigation.latest.need)}>need</StatusBadge></div>
                  <p className="mt-1 text-xs text-ink-muted">{s.irrigation.latest.advice}</p>
                  <p className="mt-1 text-xs text-ink-faint">Soil moisture {fmt(s.irrigation.latest.soil_moisture_pct, 1)}% ({s.irrigation.latest.soil_moisture_source === "meter" ? "meter" : "your description"}) · {timeAgo(s.irrigation.latest.created_at)}</p>
                </div>
              ) : undefined}
            </SummaryCard>
            <SummaryCard icon={Leaf} title="Leaf Health" to="/leaf-prediction" cta="Check a leaf" empty="No leaf checked yet. Upload one leaf photo.">
              {s?.leaf.latest ? (
                <div className="flex items-center gap-3">
                  {s.leaf.latest.thumbnail && <img src={s.leaf.latest.thumbnail} alt="" className="h-12 w-12 rounded-lg object-cover" />}
                  <div>
                    <p className="text-sm text-ink">{s.leaf.latest.plant}</p>
                    <p className={`font-semibold ${s.leaf.latest.is_healthy ? "text-neon" : ""}`}>{s.leaf.latest.is_healthy ? "Healthy" : s.leaf.latest.condition}</p>
                    <p className="text-xs text-ink-muted">{s.leaf.latest.confidence}% confidence · {timeAgo(s.leaf.latest.created_at)}</p>
                  </div>
                </div>
              ) : undefined}
            </SummaryCard>
            <SummaryCard icon={ChartNoAxesCombined} title="Crop Market Prices" to="/crop-price" cta="Estimate a price" empty="No price checked yet. Choose your mandi and crop.">
              {s?.price.latest ? (
                <div>
                  <p className="text-sm text-ink">{s.price.latest.commodity}</p>
                  <p className="mt-1 font-display text-2xl font-semibold">{rupees(s.price.latest.price_per_quintal)}<span className="text-sm font-normal text-ink-muted">/q</span></p>
                  <p className="text-xs text-ink-muted">Model estimate · {s.price.latest.market} · {timeAgo(s.price.latest.created_at)}</p>
                  <p className="text-[11px] text-ink-faint">Trend needs dated prices — not available in the data.</p>
                </div>
              ) : undefined}
            </SummaryCard>
            <SummaryCard icon={ScanSearch} title="AI Crop Recommendation" to="/crop-analysis" cta="Find your best crop" empty="No recommendation yet. Enter soil and weather values.">
              {s?.crop.latest ? (
                <div>
                  <p className="font-display text-2xl font-semibold">{titleCase(s.crop.latest.crop)}</p>
                  <p className="text-xs text-ink-muted">{s.crop.latest.confidence}% match · pH {s.crop.latest.inputs.ph}, {s.crop.latest.inputs.rainfall} mm rain</p>
                  {s.crop.latest.assumed.length > 0 && <p className="text-[11px] text-ink-faint">{s.crop.latest.assumed.length} soil values assumed</p>}
                </div>
              ) : undefined}
            </SummaryCard>
          </>
        )}
      </div>

      {/* analytics */}
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel title="Crop production trend" icon={BarChart3}
          subtitle={s?.production.series.length ? `${prodCrop} · tonnes by crop year (your records)` : districtHist.data?.rows.length ? `${prodCrop} in ${titleCase(loc!.district!)} · ${districtHist.data.source}` : undefined}>
          {s?.production.series.some((r) => r.actual_t != null) || (s?.production.series.length ?? 0) > 1
            ? <EstimateVsActualChart rows={s!.production.series} />
            : districtHist.data?.rows.length
              ? <YieldHistoryChart rows={districtHist.data.rows} estimate={s?.production.latest_estimate?.crop === prodCrop ? s?.production.latest_estimate?.yield_t_per_ha : null} />
              : <EmptyState icon={BarChart3} compact title="No production history yet"
                  text={loc?.district ? "Run a production estimate for a crop to see its yield history in your district." : "Set your location and run a production estimate to see past yields for your district."}
                  action={{ label: "Track crop production", to: "/production" }} />}
        </Panel>
        <Panel title="Market price history" icon={ChartNoAxesCombined} subtitle={s?.price.series.length ? `${s.filters.commodity} · ${s.price.series_kind}` : "Real dated mandi prices are not in the data yet."}>
          {(s?.price.series.length ?? 0) >= 2
            ? <PriceEstimatesChart rows={s!.price.series} />
            : <EmptyState icon={ChartNoAxesCombined} compact title="No price history available yet"
                text="The price dataset is a single-day snapshot without dates. Save two or more price estimates for a crop to chart them here."
                action={{ label: "Check crop prices", to: "/crop-price" }} />}
        </Panel>
        <Panel title="Irrigation overview" icon={Droplets}>
          {s?.irrigation.series.length ? (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                {(["Low", "Medium", "High"] as const).map((k) => (
                  <StatusBadge key={k} tone={needTone(k)}>{k}: {s.irrigation.counts[k]}</StatusBadge>
                ))}
              </div>
              <MoistureChart rows={s.irrigation.series} />
            </>
          ) : <EmptyState icon={Droplets} compact title="No irrigation checks yet" text="Your checks and the soil moisture used will appear here." action={{ label: "Plan irrigation", to: "/irrigation" }} />}
        </Panel>
        <Panel title="Recent activity" icon={ActivityIcon}>
          {activity.error ? <ErrorState error={activity.error} compact onRetry={activity.reload} />
            : !activity.data?.items.length ? <EmptyState icon={ActivityIcon} compact title="Nothing yet" text="Estimates, checks and searches you run will be listed here." />
            : (
              <ul className="divide-y divide-[color:var(--line)]">
                {activity.data.items.map((a) => {
                  const Icon = KIND_ICON[a.kind] ?? ActivityIcon;
                  return (
                    <li key={a.id}>
                      <Link to={a.link ?? "/dashboard"} className="flex items-center gap-3 rounded-lg px-1 py-2.5 hover:bg-white/[.03]">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-forest-800"><Icon className="h-4 w-4 text-neon" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ink">{a.title}</span>
                          {a.detail && <span className="block truncate text-xs text-ink-muted">{a.detail}</span>}
                        </span>
                        <span className="shrink-0 text-[11px] text-ink-faint">{timeAgo(a.created_at)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
        </Panel>
      </div>

      <Panel title="Quick actions" icon={Zap} className="mt-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { to: "/crop-analysis", icon: ScanSearch, label: "Predict Suitable Crops" },
            { to: "/leaf-prediction", icon: Leaf, label: "Check Leaf Health" },
            { to: "/crop-price", icon: ChartNoAxesCombined, label: "Check Crop Prices" },
            { to: "/irrigation", icon: Droplets, label: "Plan Irrigation" },
            { to: "/production", icon: Sprout, label: "Track Crop Production" },
          ].map((q) => (
            <Link key={q.to} to={q.to} className="card-link flex items-center gap-3 rounded-xl border border-[color:var(--line)] bg-forest-950/40 p-3 text-sm font-medium">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-neon/10"><q.icon className="h-4 w-4 text-neon" /></span>{q.label}
            </Link>
          ))}
        </div>
      </Panel>
      <LocationDialog key={String(locOpen)} open={locOpen} onClose={() => setLocOpen(false)} profile={profile} />
    </>
  );
}

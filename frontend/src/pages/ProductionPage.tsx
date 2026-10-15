import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BarChart3, ClipboardPen, Pencil, Sprout, Wheat } from "lucide-react";
import { PageHeader, Panel, Tabs } from "../components/ui/Panel";
import { InputGuidePanel } from "../components/form/InputGuidePanel";
import { FormField, RadioCards, UnitInput, NumberInput } from "../components/form/FormField";
import { SearchableSelect } from "../components/form/SearchableSelect";
import { AccuracyNote, EditInputs, ModelWarnings, ResultEmpty, SavedNote } from "../components/form/ResultBits";
import { ErrorState, EmptyState, LoadingState, Spinner } from "../components/ui/States";
import { HistoryList } from "../components/ui/HistoryList";
import { ModelStatusNote, revealResult, ToolLayout, useGuide } from "../components/ui/ToolPage";
import { EstimateVsActualChart, YieldHistoryChart } from "../components/charts/Charts";
import { Dialog } from "../components/ui/Dialog";
import { api, ApiError, qs } from "../lib/api";
import { useApi } from "../hooks/useApi";
import { ACRES_PER_HA, fmt, titleCase } from "../lib/format";
import type { Page, ProductionEstimate, ProductionRecord, ProductionResult } from "../lib/types";
import { useSession } from "../context/SessionContext";
import { useToast } from "../context/ToastContext";

interface Opts { states: string[]; seasons: { value: string; help: string }[]; year_min: number; year_max: number; districts?: string[]; crops?: string[] }
type Unit = "ha" | "acre";
const convertArea = (v: number, from: Unit, to: Unit) => (from === to ? v : to === "acre" ? v * ACRES_PER_HA : v / ACRES_PER_HA);
const thisYear = new Date().getFullYear();

function EstimateTab() {
  const { profile, bumpData } = useSession();
  const toast = useToast();
  const guide = useGuide("production");
  const [params] = useSearchParams();
  const base = useApi<Opts>("/options/production");
  const [f, setF] = useState({ state: "", district: "", crop: "", season: "", year: String(thisYear), area: "", unit: "ha" as Unit });
  const districts = useApi<Opts>(f.state ? `/options/production${qs({ state: f.state })}` : null);
  const crops = useApi<Opts>(f.state && f.district ? `/options/production${qs({ state: f.state, district: f.district })}` : null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProductionResult | null>(null);
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const prefilled = useRef(false);

  // prefill: assistant link (?state=…) first, then the saved profile
  useEffect(() => {
    if (prefilled.current || !base.data) return;
    prefilled.current = true;
    const p = Object.fromEntries(params.entries());
    if (p.state || p.crop) {
      setF((x) => ({ ...x, state: p.state ?? "", district: p.district ?? "", crop: p.crop ?? "", season: p.season ?? "",
        year: p.year ?? x.year, area: p.area ?? "", unit: "ha" }));
    } else if (profile) {
      const unit = (profile.area_unit ?? "ha") as Unit;
      setF((x) => ({ ...x, state: profile.state && base.data!.states.includes(profile.state) ? profile.state : "",
        area: profile.farm_area_ha ? String(+convertArea(profile.farm_area_ha, "ha", unit).toFixed(2)) : "", unit }));
    }
  }, [base.data, params, profile]);

  const set = (k: keyof typeof f, v: string) => {
    setErrors((e) => ({ ...e, [k]: "" }));
    setF((x) => {
      const n = { ...x, [k]: v };
      if (k === "state") { n.district = ""; n.crop = ""; }
      if (k === "district") n.crop = "";
      return n;
    });
  };

  const resolver = (field: string) => (q: string) =>
    api<{ match: string | null; suggestions: string[]; how: string | null }>(`/resolve/production${qs({ field, q, state: f.state, district: f.district })}`);

  function validate() {
    const e: Record<string, string> = {};
    if (!f.state) e.state = "Choose your state";
    if (!f.district) e.district = "Choose your district";
    if (!f.crop) e.crop = "Choose the crop";
    if (!f.season) e.season = "Choose the season";
    const y = Number(f.year);
    if (!f.year || !Number.isInteger(y) || y < 1950 || y > 2100) e.year = "Enter a year like 2025";
    const a = parseFloat(f.area);
    if (!f.area || Number.isNaN(a) || a <= 0) e.area = "Enter a field size greater than 0";
    setErrors(e);
    return !Object.keys(e).length;
  }

  async function submit() {
    if (busy || !validate()) return;
    setBusy(true);
    setApiError(null);
    try {
      const r = await api<ProductionResult>("/production/estimate", {
        body: { state: f.state, district: f.district, season: f.season, crop: f.crop, year: Number(f.year), area: parseFloat(f.area), area_unit: f.unit },
      });
      setResult(r);
      revealResult();
      if (r.saved_id) bumpData();
      toast("success", "Estimate ready.");
    } catch (e) {
      setApiError(e as ApiError);
    } finally {
      setBusy(false);
    }
  }

  function fillExample() {
    const ex = guide.data?.example;
    if (!ex) return;
    setErrors({});
    setF({ state: ex.state, district: ex.district, crop: ex.crop, season: ex.season, year: String(ex.year), area: String(ex.area), unit: ex.area_unit });
    toast("info", "Example values filled in — replace them with your own field’s details.");
  }

  const yearNote = base.data && Number(f.year) > base.data.year_max
    ? `Data covers ${base.data.year_min}–${base.data.year_max}; later years use the latest known pattern.` : null;
  const hist = useApi<{ available: boolean; rows: any[]; source: string }>(
    result ? `/production/district-history${qs({ state: result.state, district: result.district, crop: result.crop, season: result.season })}` : null);

  const form = (
    <Panel title="Your field" icon={Sprout}>
      <ModelStatusNote tool="production" />
      {base.error ? <ErrorState error={base.error} onRetry={base.reload} /> : base.loading ? <LoadingState label="Loading districts and crops…" /> : (
        <form ref={formRef} noValidate onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-5">
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-faint">Location & crop</legend>
            <FormField label="State" required htmlFor="p-state" where="Where your farm is. Short forms like UP work." error={errors.state}>
              <SearchableSelect id="p-state" value={f.state} onChange={(v) => set("state", v)} placeholder="e.g. Uttar Pradesh or UP"
                options={(base.data?.states ?? []).map((s) => ({ value: s }))} resolver={resolver("state")} invalid={!!errors.state} />
            </FormField>
            <FormField label="District" required htmlFor="p-district" where="Only districts of the chosen state are listed." error={errors.district}>
              <SearchableSelect id="p-district" value={f.district} onChange={(v) => set("district", v)} disabled={!f.state}
                placeholder={f.state ? "e.g. Deoria" : "Choose the state first"} display={titleCase}
                options={(districts.data?.districts ?? []).map((d) => ({ value: d }))} resolver={resolver("district")} invalid={!!errors.district} />
            </FormField>
            <FormField label="Crop" required htmlFor="p-crop" where="Only crops grown in that district are listed. Hindi names like dhan or gehun work." error={errors.crop}
              help={f.district && crops.data ? `${crops.data.crops?.length ?? 0} crops grown in ${titleCase(f.district)}` : undefined}>
              <SearchableSelect id="p-crop" value={f.crop} onChange={(v) => set("crop", v)} disabled={!f.district}
                placeholder={f.district ? "e.g. Rice" : "Choose the district first"}
                options={(crops.data?.crops ?? []).map((c) => ({ value: c }))} resolver={resolver("crop")} invalid={!!errors.crop} />
            </FormField>
            <FormField label="Crop year" required htmlFor="p-year" unit="year" error={errors.year} warning={yearNote}
              where={base.data ? `Data covers ${base.data.year_min}–${base.data.year_max}.` : undefined}>
              <NumberInput id="p-year" value={f.year} onChange={(v) => set("year", v)} placeholder={String(thisYear)} min={1950} max={2100} step="1" invalid={!!errors.year} />
            </FormField>
          </fieldset>
          <fieldset className="space-y-4">
            <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-faint">Season & size</legend>
            <FormField label="Season" required error={errors.season} where="Kharif = sown June–July (monsoon). Rabi = sown Oct–Nov (winter).">
              <RadioCards name="Season" value={f.season} onChange={(v) => set("season", v)} columns={3} error={!!errors.season}
                options={(base.data?.seasons ?? []).map((s) => ({ value: s.value, label: s.value, help: s.help }))} />
            </FormField>
            <FormField label="Field area" required htmlFor="p-area" unit={f.unit === "ha" ? "hectares" : "acres"} error={errors.area}
              where="From your land papers, or your best estimate. 1 hectare = 2.471 acres." help="Any size works — the model estimates yield per hectare.">
              <UnitInput id="p-area" value={f.area} onChange={(v) => set("area", v)} unit={f.unit} onUnitChange={(u) => setF((x) => ({ ...x, unit: u }))}
                units={[{ value: "ha", label: "ha" }, { value: "acre", label: "acre" }]} convert={convertArea} placeholder="e.g. 2.5" invalid={!!errors.area} />
            </FormField>
          </fieldset>
          {apiError && <ErrorState error={apiError} compact />}
          <button type="submit" className="btn-primary w-full sm:w-auto" disabled={busy}>{busy && <Spinner />}Estimate production</button>
        </form>
      )}
    </Panel>
  );

  const resultPanel = (
    <Panel title="Result" icon={Wheat} actions={result && <EditInputs onClick={() => formRef.current?.querySelector<HTMLElement>("input")?.focus()} />}>
      {!result ? (
        <ResultEmpty icon={Wheat} title="Your estimate will appear here" lines={[
          "Total production for your field, in tonnes", "Expected yield per hectare", "How reliable the estimate is"]} />
      ) : (
        <div className="space-y-4 animate-fade-up" aria-live="polite">
          <div>
            <p className="text-sm text-ink-muted">{result.crop} · {titleCase(result.district)}, {result.state} · {result.season}</p>
            <p className="mt-1 font-display text-4xl font-semibold text-neon">≈ {fmt(result.production)} <span className="text-xl text-ink">tonnes</span></p>
            <p className="mt-1 text-ink">{fmt(result.yield_per_ha, 2)} tonnes per hectare
              <span className="text-ink-muted"> · on {fmt(result.area_input.value)} {result.area_input.unit === "acre" ? "acres" : "ha"}
              {result.area_input.unit === "acre" && ` (${fmt(result.area)} ha)`}</span></p>
          </div>
          <p className="rounded-lg bg-forest-950/50 px-3 py-2 text-sm text-ink-muted">{result.context} {result.unit_note}</p>
          {result.note && <ModelWarnings warnings={[result.note]} />}
          <div className="rounded-lg border border-[color:var(--line)] p-3">
            <p className="mb-1 text-sm font-medium">What this means</p>
            <p className="text-sm text-ink-muted">Plan storage, labour and selling for about {fmt(result.production)} t. Record your real harvest in “Track my season” to compare.</p>
          </div>
          <AccuracyNote>{result.accuracy_note}</AccuracyNote>
          <SavedNote savedId={result.saved_id} />
        </div>
      )}
    </Panel>
  );

  return (
    <>
      <ToolLayout guide={<InputGuidePanel guide={guide.data} loading={guide.loading} onExample={fillExample} />} form={form} result={resultPanel} />
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel title="Past yield in this district" icon={BarChart3}
          subtitle={hist.data?.source ?? "Real yearly yield from the dataset — choose a field and run an estimate to see it."}>
          {!result ? <EmptyState icon={BarChart3} compact title="No district selected yet" text="Run an estimate to see how this crop has yielded in your district over the years." />
            : hist.loading ? <LoadingState /> : hist.error ? <ErrorState error={hist.error} compact />
            : !hist.data?.rows.length ? <EmptyState icon={BarChart3} compact title="No dataset records for this crop and season" />
            : <YieldHistoryChart rows={hist.data.rows} estimate={result.yield_per_ha} />}
        </Panel>
        <HistoryList<ProductionEstimate> title="Saved estimates" path="/production/estimates" deletePath={(id) => `/production/estimates/${id}`}
          empty={{ title: "No saved estimates yet", text: "Each estimate you run is saved here." }}
          render={(e) => (
            <>
              <p className="text-sm text-ink">{e.crop} · {titleCase(e.district)} · {e.season} {e.crop_year}</p>
              <p className="text-xs text-ink-muted">≈ {fmt(e.production_t)} t on {fmt(e.area_ha)} ha ({fmt(e.yield_t_per_ha)} t/ha)</p>
            </>
          )} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------- tracking

const emptyRecord = { crop: "", season: "Kharif", crop_year: String(thisYear), area_ha: "", sowing_date: "", harvest_date: "", actual_production_t: "", estimated_production_t: "", notes: "" };

function RecordForm({ initial, onSaved, onCancel }: { initial?: ProductionRecord | null; onSaved: () => void; onCancel?: () => void }) {
  const toast = useToast();
  const { profile } = useSession();
  const seasons = ["Kharif", "Rabi", "Summer", "Winter", "Autumn", "Whole Year"];
  const [f, setF] = useState(() => initial ? {
    crop: initial.crop, season: initial.season, crop_year: String(initial.crop_year), area_ha: String(initial.area_ha),
    sowing_date: initial.sowing_date ?? "", harvest_date: initial.harvest_date ?? "",
    actual_production_t: initial.actual_production_t?.toString() ?? "", estimated_production_t: initial.estimated_production_t?.toString() ?? "", notes: initial.notes ?? "",
  } : { ...emptyRecord, area_ha: profile?.farm_area_ha ? String(profile.farm_area_ha) : "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const est = useApi<Page<ProductionEstimate>>(f.crop ? `/production/estimates?page_size=50` : null);
  const match = est.data?.items.find((e) => e.crop.toLowerCase() === f.crop.trim().toLowerCase() && String(e.crop_year) === f.crop_year);

  const set = (k: keyof typeof f, v: string) => { setErrors((e) => ({ ...e, [k]: "" })); setF((x) => ({ ...x, [k]: v })); };

  async function save() {
    const e: Record<string, string> = {};
    if (!f.crop.trim()) e.crop = "Enter the crop";
    const y = Number(f.crop_year);
    if (!Number.isInteger(y) || y < 1950 || y > 2100) e.crop_year = "Enter a year like 2025";
    if (!(parseFloat(f.area_ha) > 0)) e.area_ha = "Enter the area in hectares";
    if (f.actual_production_t && !(parseFloat(f.actual_production_t) >= 0)) e.actual_production_t = "Enter 0 or more";
    if (f.sowing_date && f.harvest_date && f.harvest_date < f.sowing_date) e.harvest_date = "Harvest cannot be before sowing";
    setErrors(e);
    if (Object.keys(e).length || busy) return;
    setBusy(true);
    const body = {
      crop: f.crop.trim(), season: f.season, crop_year: y, area_ha: parseFloat(f.area_ha),
      sowing_date: f.sowing_date || null, harvest_date: f.harvest_date || null,
      actual_production_t: f.actual_production_t ? parseFloat(f.actual_production_t) : null,
      estimated_production_t: f.estimated_production_t ? parseFloat(f.estimated_production_t) : null,
      notes: f.notes.trim() || null,
      state: profile?.state ?? null, district: profile?.district ?? null,
    };
    try {
      await api(initial ? `/production/${initial.id}` : "/production/track", { method: initial ? "PUT" : "POST", body });
      toast("success", initial ? "Record updated." : "Season saved.");
      if (!initial) setF({ ...emptyRecord });
      onSaved();
    } catch (err) {
      const ae = err as ApiError;
      const fe: Record<string, string> = {};
      ae.fieldErrors.forEach((x) => { if (x.field) fe[x.field] = x.message; });
      setErrors(fe);
      toast("error", ae.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Crop" required htmlFor="t-crop" error={errors.crop}>
          <input id="t-crop" className={`input ${errors.crop ? "input-error" : ""}`} value={f.crop} onChange={(e) => set("crop", e.target.value)} placeholder="e.g. Rice" maxLength={80} />
        </FormField>
        <FormField label="Season" required htmlFor="t-season">
          <select id="t-season" className="input" value={f.season} onChange={(e) => set("season", e.target.value)}>
            {seasons.map((s) => <option key={s}>{s}</option>)}
          </select>
        </FormField>
        <FormField label="Crop year" required htmlFor="t-year" error={errors.crop_year}>
          <NumberInput id="t-year" value={f.crop_year} onChange={(v) => set("crop_year", v)} step="1" invalid={!!errors.crop_year} />
        </FormField>
        <FormField label="Area" required unit="hectares" htmlFor="t-area" error={errors.area_ha} help="1 hectare = 2.471 acres">
          <NumberInput id="t-area" value={f.area_ha} onChange={(v) => set("area_ha", v)} placeholder="e.g. 2" invalid={!!errors.area_ha} />
        </FormField>
        <FormField label="Sowing date" htmlFor="t-sow">
          <input id="t-sow" type="date" className="input" value={f.sowing_date} onChange={(e) => set("sowing_date", e.target.value)} />
        </FormField>
        <FormField label="Harvest date" htmlFor="t-harvest" error={errors.harvest_date}>
          <input id="t-harvest" type="date" className={`input ${errors.harvest_date ? "input-error" : ""}`} value={f.harvest_date} onChange={(e) => set("harvest_date", e.target.value)} />
        </FormField>
        <FormField label="Actual production" unit="tonnes" htmlFor="t-actual" error={errors.actual_production_t} help="What you really harvested (1 tonne = 10 quintal). Leave empty until harvest.">
          <NumberInput id="t-actual" value={f.actual_production_t} onChange={(v) => set("actual_production_t", v)} placeholder="e.g. 4.8" invalid={!!errors.actual_production_t} />
        </FormField>
        <FormField label="AI estimate to compare" unit="tonnes" htmlFor="t-est"
          help={match ? undefined : "Run an estimate for this crop and year to link it here."}
          aside={match && f.estimated_production_t !== String(match.production_t) ? (
            <button type="button" className="text-xs text-neon hover:underline" onClick={() => set("estimated_production_t", String(match.production_t))}>Use saved estimate ({fmt(match.production_t)} t)</button>
          ) : undefined}>
          <NumberInput id="t-est" value={f.estimated_production_t} onChange={(v) => set("estimated_production_t", v)} placeholder="optional" />
        </FormField>
      </div>
      <FormField label="Notes" htmlFor="t-notes" help="Seed variety, fertiliser, weather problems…">
        <textarea id="t-notes" className="input min-h-[72px]" value={f.notes} maxLength={2000} onChange={(e) => set("notes", e.target.value)} />
      </FormField>
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={busy}>{busy && <Spinner />}{initial ? "Save changes" : "Save season"}</button>
        {onCancel && <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

function TrackTab() {
  const { dataVersion, bumpData } = useSession();
  const [editing, setEditing] = useState<ProductionRecord | null>(null);
  const [crop, setCrop] = useState("");
  const records = useApi<Page<ProductionRecord>>(`/production/history?page_size=100`, [dataVersion]);
  const crops = useMemo(() => [...new Set(records.data?.items.map((r) => r.crop) ?? [])], [records.data]);
  const activeCrop = crop || crops[0] || "";
  const series = useMemo(() => {
    const rows = (records.data?.items ?? []).filter((r) => r.crop === activeCrop);
    const byYear = new Map<number, { year: number; estimate_t?: number; actual_t?: number }>();
    rows.forEach((r) => {
      const y = byYear.get(r.crop_year) ?? { year: r.crop_year };
      if (r.estimated_production_t != null) y.estimate_t = r.estimated_production_t;
      if (r.actual_production_t != null) y.actual_t = r.actual_production_t;
      byYear.set(r.crop_year, y);
    });
    return [...byYear.values()].sort((a, b) => a.year - b.year);
  }, [records.data, activeCrop]);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel title="Record a season" icon={ClipboardPen} subtitle="Required: crop, season, year and area. Everything else is optional.">
        <RecordForm onSaved={bumpData} />
      </Panel>
      <div className="space-y-5">
        <Panel title="AI estimate vs your harvest" icon={BarChart3}
          actions={crops.length > 1 && (
            <select className="input py-1.5 text-xs" value={activeCrop} onChange={(e) => setCrop(e.target.value)} aria-label="Crop">
              {crops.map((c) => <option key={c}>{c}</option>)}
            </select>)}>
          {records.loading ? <LoadingState /> : records.error ? <ErrorState error={records.error} onRetry={records.reload} compact />
            : !series.length ? <EmptyState icon={BarChart3} compact title="Nothing to compare yet" text="Save a season with your actual harvest (and the AI estimate) to see them side by side." />
            : <EstimateVsActualChart rows={series} />}
        </Panel>
        <HistoryList<ProductionRecord> title="Your seasons" path="/production/history" deletePath={(id) => `/production/${id}`}
          empty={{ title: "No seasons recorded", text: "Use the form to record what you sowed and harvested." }}
          render={(r) => (
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm text-ink">{r.crop} · {r.season} {r.crop_year} · {fmt(r.area_ha)} ha</p>
                <p className="text-xs text-ink-muted">
                  Actual: {r.actual_production_t != null ? `${fmt(r.actual_production_t)} t (farmer-entered)` : "not recorded"}
                  {r.estimated_production_t != null && ` · AI estimate: ${fmt(r.estimated_production_t)} t`}
                </p>
                {r.notes && <p className="mt-0.5 line-clamp-2 text-xs text-ink-faint">{r.notes}</p>}
              </div>
              <button className="btn-ghost p-2" onClick={() => setEditing(r)} aria-label={`Edit ${r.crop} ${r.crop_year}`}><Pencil className="h-4 w-4" /></button>
            </div>
          )} />
      </div>
      <Dialog open={!!editing} onClose={() => setEditing(null)} title="Edit season" wide>
        {editing && <RecordForm initial={editing} onSaved={() => { setEditing(null); bumpData(); }} onCancel={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

export default function ProductionPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "track" ? "track" : "estimate";
  return (
    <>
      <PageHeader eyebrow="Crop Production" title="Crop production" question="How much will my crop produce?"
        output="Expected yield (tonnes per hectare) and total production for your field, plus your saved seasons" />
      <Tabs label="Crop production views" value={tab} onChange={(v) => setParams(v === "track" ? { tab: "track" } : {})}
        items={[{ value: "estimate", label: "Estimate yield", icon: Sprout }, { value: "track", label: "Track my season", icon: ClipboardPen }]} />
      {tab === "estimate" ? <EstimateTab /> : <TrackTab />}
    </>
  );
}

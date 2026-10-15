import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BarChart3, ChartNoAxesCombined, IndianRupee, Store, Table2 } from "lucide-react";
import { PageHeader, Panel } from "../components/ui/Panel";
import { InputGuidePanel } from "../components/form/InputGuidePanel";
import { DontKnowToggle, FormField, RadioCards } from "../components/form/FormField";
import { SearchableSelect } from "../components/form/SearchableSelect";
import { AccuracyNote, EditInputs, ModelWarnings, ResultEmpty, SavedNote } from "../components/form/ResultBits";
import { EmptyState, ErrorState, LoadingState, Spinner } from "../components/ui/States";
import { HistoryList } from "../components/ui/HistoryList";
import { ModelStatusNote, revealResult, ToolLayout, useGuide } from "../components/ui/ToolPage";
import { PriceEstimatesChart } from "../components/charts/Charts";
import { api, ApiError, qs } from "../lib/api";
import { useApi } from "../hooks/useApi";
import { fmt, rupees } from "../lib/format";
import type { Page, PriceRecord, PriceResult, PriceSnapshot } from "../lib/types";
import { useSession } from "../context/SessionContext";
import { useToast } from "../context/ToastContext";

interface Opts {
  states: string[]; commodities: string[]; grades: { value: string; help: string }[];
  districts?: string[]; markets?: string[]; market_commodities?: string[]; varieties?: string[]; commodity?: string;
}

export default function PricePage() {
  const { profile, bumpData, dataVersion } = useSession();
  const toast = useToast();
  const guide = useGuide("price");
  const [params] = useSearchParams();
  const base = useApi<Opts>("/options/price");
  const [f, setF] = useState({ state: "", district: "", market: "", commodity: "", variety: "", unknownVariety: true, grade: "FAQ" });
  const districts = useApi<Opts>(f.state ? `/options/price${qs({ state: f.state })}` : null);
  const markets = useApi<Opts>(f.state && f.district ? `/options/price${qs({ state: f.state, district: f.district, market: f.market || undefined })}` : null);
  const varieties = useApi<Opts>(f.commodity ? `/options/price${qs({ commodity: f.commodity })}` : null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PriceResult | null>(null);
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const prefilled = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (prefilled.current || !base.data) return;
    prefilled.current = true;
    const p = Object.fromEntries(params.entries());
    if (p.state || p.commodity) {
      setF((x) => ({ ...x, state: p.state ?? "", district: p.district ?? "", market: p.market ?? "", commodity: p.commodity ?? "",
        variety: p.variety && p.variety !== "Other" ? p.variety : "", unknownVariety: !p.variety || p.variety === "Other", grade: p.grade ?? "FAQ" }));
    } else if (profile?.state && base.data.states.includes(profile.state)) {
      setF((x) => ({ ...x, state: profile.state! }));
    }
  }, [base.data, params, profile]);

  // a district with a single mandi: choose it automatically
  useEffect(() => {
    const m = markets.data?.markets;
    if (m && m.length === 1 && !f.market) setF((x) => ({ ...x, market: m[0] }));
  }, [markets.data, f.market]);

  const set = (k: keyof typeof f, v: string) => {
    setErrors((e) => ({ ...e, [k]: "" }));
    setF((x) => {
      const n = { ...x, [k]: v } as typeof f;
      if (k === "state") { n.district = ""; n.market = ""; }
      if (k === "district") n.market = "";
      if (k === "commodity") n.variety = "";
      return n;
    });
  };
  const resolver = (field: string) => (q: string) =>
    api<{ match: string | null; suggestions: string[]; how: string | null }>(`/resolve/price${qs({ field, q, state: f.state, district: f.district })}`);

  async function submit() {
    const e: Record<string, string> = {};
    if (!f.state) e.state = "Choose your state";
    if (!f.district) e.district = "Choose your district";
    if (!f.market) e.market = "Choose the mandi";
    if (!f.commodity) e.commodity = "Choose the crop";
    setErrors(e);
    if (Object.keys(e).length || busy) return;
    setBusy(true);
    setApiError(null);
    try {
      const r = await api<PriceResult>("/market/estimate", {
        body: { state: f.state, district: f.district, market: f.market, commodity: f.commodity,
          variety: f.unknownVariety || !f.variety ? null : f.variety, grade: f.grade },
      });
      setResult(r);
      revealResult();
      if (r.saved_id) bumpData();
    } catch (err) {
      setApiError(err as ApiError);
    } finally {
      setBusy(false);
    }
  }

  function fillExample() {
    const ex = guide.data?.example;
    if (!ex) return;
    setErrors({});
    setF({ state: ex.state, district: ex.district, market: ex.market, commodity: ex.commodity, variety: "", unknownVariety: true, grade: ex.grade });
    toast("info", "Example filled in — choose your own mandi and crop.");
  }

  const traded = markets.data?.market_commodities ?? [];
  const snapshotCommodity = result?.commodity ?? (f.commodity || null);
  const snapshot = useApi<PriceSnapshot>(snapshotCommodity ? `/market/prices${qs({ commodity: snapshotCommodity })}` : null);
  const saved = useApi<Page<PriceRecord>>(snapshotCommodity ? `/market/history${qs({ commodity: snapshotCommodity, page_size: 50 })}` : null, [dataVersion]);
  const savedSeries = useMemo(() => [...(saved.data?.items ?? [])].reverse()
    .map((p) => ({ date: p.created_at, market: p.market, estimate: p.price_per_quintal, low: p.range_low, high: p.range_high })), [saved.data]);

  const form = (
    <Panel title="Your mandi and crop" icon={Store}>
      <ModelStatusNote tool="price" />
      {base.error ? <ErrorState error={base.error} onRetry={base.reload} /> : base.loading ? <LoadingState /> : (
        <form ref={formRef} noValidate onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="State" required htmlFor="m-state" error={errors.state} where="Short forms like UP are accepted.">
              <SearchableSelect id="m-state" value={f.state} onChange={(v) => set("state", v)} placeholder="e.g. Uttar Pradesh or UP"
                options={(base.data?.states ?? []).map((s) => ({ value: s }))} resolver={resolver("state")} invalid={!!errors.state} />
            </FormField>
            <FormField label="District" required htmlFor="m-district" error={errors.district}>
              <SearchableSelect id="m-district" value={f.district} onChange={(v) => set("district", v)} disabled={!f.state}
                placeholder={f.state ? "e.g. Aligarh" : "Choose the state first"}
                options={(districts.data?.districts ?? []).map((d) => ({ value: d }))} resolver={resolver("district")} invalid={!!errors.district} />
            </FormField>
            <FormField label="Mandi (market)" required htmlFor="m-market" error={errors.market} where="The mandi where you will sell."
              help={markets.data?.markets?.length === 1 ? "Only one mandi in this district — chosen for you." : undefined}>
              <SearchableSelect id="m-market" value={f.market} onChange={(v) => set("market", v)} disabled={!f.district}
                placeholder={f.district ? "Choose the mandi" : "Choose the district first"}
                options={(markets.data?.markets ?? []).map((m) => ({ value: m }))} resolver={resolver("market")} invalid={!!errors.market} />
            </FormField>
            <FormField label="Crop" required htmlFor="m-commodity" error={errors.commodity}
              where="Hindi names work: aloo, pyaz, gehun, dhan, tamatar, baingan, gobhi…"
              help={f.market && traded.length ? `${traded.length} crops were sold at ${f.market} in the data — listed first` : undefined}>
              <SearchableSelect id="m-commodity" value={f.commodity} onChange={(v) => set("commodity", v)} placeholder="e.g. Potato or aloo"
                priority={traded.map((c) => ({ value: c }))} priorityLabel={f.market ? `Sold at ${f.market}` : undefined}
                options={(base.data?.commodities ?? []).map((c) => ({ value: c }))} resolver={resolver("commodity")} invalid={!!errors.commodity} />
            </FormField>
          </div>
          <FormField label="Variety" htmlFor="m-variety" aside={<DontKnowToggle checked={f.unknownVariety} onChange={(v) => setF((x) => ({ ...x, unknownVariety: v }))} />}
            help={f.unknownVariety ? "“Other” will be used." : undefined}>
            <select id="m-variety" className="input" value={f.variety} disabled={f.unknownVariety || !f.commodity} onChange={(e) => set("variety", e.target.value)}>
              <option value="">{f.commodity ? "Choose variety" : "Choose the crop first"}</option>
              {(varieties.data?.varieties ?? []).map((v) => <option key={v}>{v}</option>)}
            </select>
          </FormField>
          <FormField label="Quality / grade">
            <RadioCards name="Grade" value={f.grade} onChange={(v) => set("grade", v)} columns={4}
              options={(base.data?.grades ?? []).map((g) => ({ value: g.value, label: g.value === "FAQ" ? "FAQ (normal)" : g.value, help: g.help }))} />
          </FormField>
          {apiError && <ErrorState error={apiError} compact />}
          <button type="submit" className="btn-primary w-full sm:w-auto" disabled={busy}>{busy && <Spinner />}Estimate price</button>
        </form>
      )}
    </Panel>
  );

  const resultPanel = (
    <Panel title="Result" icon={IndianRupee} actions={result && <EditInputs onClick={() => formRef.current?.querySelector<HTMLElement>("input")?.focus()} />}>
      {!result ? (
        <ResultEmpty icon={IndianRupee} title="The price estimate will appear here" lines={["Expected modal price in ₹ per quintal and ₹ per kg", "A likely price range", "Warnings when the data is thin"]} />
      ) : (
        <div className="space-y-4 animate-fade-up" aria-live="polite">
          <div>
            <p className="text-sm text-ink-muted">{result.commodity} ({result.variety}, {result.grade}) at {result.market}, {result.district}</p>
            <p className="mt-1 font-display text-4xl font-semibold text-neon">{rupees(result.price_per_quintal)} <span className="text-lg text-ink">per quintal</span></p>
            <p className="mt-1 text-ink">≈ ₹{fmt(result.price_per_kg, 2)} per kg</p>
            <p className="mt-2 text-sm text-ink-muted">Likely range: <span className="text-ink">{rupees(result.range_low)} – {rupees(result.range_high)}</span> per quintal</p>
          </div>
          <p className="rounded-lg bg-forest-950/50 px-3 py-2 text-sm text-ink-muted">{result.label}</p>
          <ModelWarnings warnings={result.warnings} />
          <div className="rounded-lg border border-[color:var(--line)] p-3 text-sm">
            <p className="mb-1 font-medium">What this means</p>
            <p className="text-ink-muted">Use it as a rough guide when talking to traders. Check today’s rate at the mandi or on Agmarknet before selling.</p>
          </div>
          <AccuracyNote>{result.accuracy_note}</AccuracyNote>
          <SavedNote savedId={result.saved_id} />
        </div>
      )}
    </Panel>
  );

  return (
    <>
      <PageHeader eyebrow="Crop Price" title="Mandi price estimate" question="What price will my crop get at the mandi?"
        output="Expected modal price in ₹ per quintal and ₹ per kg, with a likely range" />
      <ToolLayout guide={<InputGuidePanel guide={guide.data} loading={guide.loading} onExample={fillExample} />} form={form} result={resultPanel} />
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel title={`Prices in the data${snapshotCommodity ? ` — ${snapshotCommodity}` : ""}`} icon={Table2}
          subtitle="From the dataset snapshot — not today’s live price. ₹ per quintal.">
          {!snapshotCommodity ? <EmptyState icon={Table2} compact title="Choose a crop" text="Recorded Min / Max / Modal prices across mandis will be listed here." />
            : snapshot.loading ? <LoadingState /> : snapshot.error ? <ErrorState error={snapshot.error} compact />
            : !snapshot.data?.records ? <EmptyState icon={Table2} compact title="No records for this crop in the dataset" />
            : (
              <>
                {snapshot.data.summary && (
                  <p className="mb-3 text-xs text-ink-muted">{snapshot.data.records} records · modal from {rupees(snapshot.data.summary.lowest)} to {rupees(snapshot.data.summary.highest)}, average {rupees(snapshot.data.summary.average)}</p>
                )}
                <div className="max-h-80 overflow-auto rounded-lg border border-[color:var(--line)]">
                  <table className="w-full min-w-[520px] text-left text-xs">
                    <thead className="sticky top-0 bg-forest-850 text-ink-muted">
                      <tr><th className="px-3 py-2 font-medium">Mandi</th><th className="px-3 py-2 font-medium">State</th><th className="px-3 py-2 font-medium">Variety</th>
                        <th className="px-3 py-2 text-right font-medium">Min</th><th className="px-3 py-2 text-right font-medium">Max</th><th className="px-3 py-2 text-right font-medium">Modal</th></tr>
                    </thead>
                    <tbody>
                      {snapshot.data.rows.map((r, i) => (
                        <tr key={i} className="border-t border-[color:var(--line)]">
                          <td className="px-3 py-1.5">{r.market}</td><td className="px-3 py-1.5 text-ink-muted">{r.state}</td><td className="px-3 py-1.5 text-ink-muted">{r.variety}</td>
                          <td className="px-3 py-1.5 text-right">{fmt(r.min, 0)}</td><td className="px-3 py-1.5 text-right">{fmt(r.max, 0)}</td><td className="px-3 py-1.5 text-right font-medium">{fmt(r.modal, 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {snapshot.data.records > snapshot.data.rows.length && <p className="mt-2 text-[11px] text-ink-faint">Showing the {snapshot.data.rows.length} lowest of {snapshot.data.records} records.</p>}
              </>
            )}
        </Panel>
        <Panel title="Price history" icon={ChartNoAxesCombined} subtitle="The dataset is a single-day snapshot without dates, so there is no real price history yet.">
          {!snapshotCommodity || saved.loading ? (saved.loading ? <LoadingState /> : <EmptyState icon={BarChart3} compact title="No price history available yet" text="Your saved estimates for a crop will be charted here." />)
            : savedSeries.length < 2 ? <EmptyState icon={BarChart3} compact title="No price history available yet"
              text="Real dated mandi prices are not in the data. Once you save two or more estimates for this crop, they are charted here (as model estimates, not observed prices)." />
            : <PriceEstimatesChart rows={savedSeries} />}
        </Panel>
      </div>
      <div className="mt-5">
        <HistoryList<PriceRecord> title="Saved price estimates" path="/market/history" deletePath={(id) => `/market/history/${id}`}
          empty={{ title: "No saved estimates", text: "Each estimate you run is saved here." }}
          render={(r) => (
            <>
              <p className="text-sm text-ink">{r.commodity} at {r.market} — {rupees(r.price_per_quintal)}/q <span className="text-xs text-ink-faint">(model estimate)</span></p>
              <p className="text-xs text-ink-muted">Range {rupees(r.range_low)} – {rupees(r.range_high)} · {r.variety}, {r.grade}</p>
            </>
          )} />
      </div>
    </>
  );
}

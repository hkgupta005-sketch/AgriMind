import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CloudSun, FlaskConical, ScanSearch, Sprout, Trophy } from "lucide-react";
import { PageHeader, Panel } from "../components/ui/Panel";
import { InputGuidePanel } from "../components/form/InputGuidePanel";
import { DontKnowToggle, FormField, NumberInput, RadioCards } from "../components/form/FormField";
import { StepForm } from "../components/form/StepForm";
import { AccuracyNote, AssumedValuesNote, EditInputs, ModelWarnings, ResultEmpty, SavedNote } from "../components/form/ResultBits";
import { ErrorState, LoadingState } from "../components/ui/States";
import { HistoryList } from "../components/ui/HistoryList";
import { ModelStatusNote, revealResult, ToolLayout, useGuide } from "../components/ui/ToolPage";
import { api, ApiError } from "../lib/api";
import { useApi } from "../hooks/useApi";
import { titleCase } from "../lib/format";
import type { CropRecord, CropResult } from "../lib/types";
import { useSession } from "../context/SessionContext";
import { useToast } from "../context/ToastContext";

interface Opts { crops: string[]; ranges: Record<string, [number, number]>; medians: Record<string, number>; rain_presets: Record<string, number> }
type Key = "N" | "P" | "K" | "ph";
const SOIL: { key: Key; label: string; unit: string; example: string }[] = [
  { key: "N", label: "Nitrogen (N)", unit: "soil test value", example: "90" },
  { key: "P", label: "Phosphorus (P)", unit: "soil test value", example: "42" },
  { key: "K", label: "Potassium (K)", unit: "soil test value", example: "43" },
  { key: "ph", label: "Soil pH", unit: "0–14", example: "6.5" },
];

export default function CropAnalysisPage() {
  const { bumpData } = useSession();
  const toast = useToast();
  const guide = useGuide("crop");
  const opts = useApi<Opts>("/options/crop");
  const [params] = useSearchParams();
  const [step, setStep] = useState(0);
  const [v, setV] = useState<Record<string, string>>({ N: "", P: "", K: "", ph: "", temperature: "", humidity: "", rainfall: "" });
  const [skip, setSkip] = useState<Record<Key, boolean>>({ N: false, P: false, K: false, ph: false });
  const [rainPreset, setRainPreset] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CropResult | null>(null);
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const prefilled = useRef(false);

  useEffect(() => {
    if (prefilled.current) return;
    prefilled.current = true;
    const p = Object.fromEntries(params.entries());
    if (p.temperature) setV((x) => ({ ...x, ...Object.fromEntries(Object.entries(p).filter(([k]) => k in x)) }));
  }, [params]);

  const set = (k: string, val: string) => { setErrors((e) => ({ ...e, [k]: "" })); setV((x) => ({ ...x, [k]: val })); };
  const r = opts.data?.ranges;
  const outside = (k: string) => {
    if (!r?.[k] || v[k] === "") return null;
    const n = parseFloat(v[k]);
    return n < r[k][0] || n > r[k][1] ? "Outside the model’s data — the result will be less reliable." : null;
  };

  function validate(s: number) {
    const e: Record<string, string> = {};
    if (s === 0) {
      SOIL.forEach(({ key }) => {
        if (skip[key]) return;
        if (v[key] === "") e[key] = "Enter the value, or tick “I don't have the card”";
        else {
          const n = parseFloat(v[key]);
          if (Number.isNaN(n) || n < 0) e[key] = "Must be 0 or more";
          else if (key === "ph" && n > 14) e[key] = "pH must be between 0 and 14";
          else if (key !== "ph" && n > 1000) e[key] = "That value looks too large";
        }
      });
    } else {
      const t = parseFloat(v.temperature);
      if (v.temperature === "" || Number.isNaN(t)) e.temperature = "Enter the temperature";
      else if (t < -20 || t > 60) e.temperature = "Between -20 and 60 °C";
      const h = parseFloat(v.humidity);
      if (v.humidity === "" || Number.isNaN(h)) e.humidity = "Enter the humidity";
      else if (h < 0 || h > 100) e.humidity = "Humidity must be between 0 and 100 %";
      if (!rainPreset) {
        const rf = parseFloat(v.rainfall);
        if (v.rainfall === "" || Number.isNaN(rf)) e.rainfall = "Enter rainfall in mm, or choose Low / Medium / High";
        else if (rf < 0) e.rainfall = "Rainfall cannot be negative";
      }
    }
    setErrors(e);
    return !Object.keys(e).length;
  }

  async function submit() {
    if (busy) return;
    if (!validate(0)) { setStep(0); return; }
    if (!validate(1)) return;
    setBusy(true);
    setApiError(null);
    const num = (k: Key) => (skip[k] ? null : parseFloat(v[k]));
    try {
      const res = await api<CropResult>("/crops/recommend", {
        body: { N: num("N"), P: num("P"), K: num("K"), ph: num("ph"), temperature: parseFloat(v.temperature), humidity: parseFloat(v.humidity),
          rainfall: rainPreset ? null : parseFloat(v.rainfall), rainfall_preset: rainPreset || null },
      });
      setResult(res);
      revealResult();
      if (res.saved_id) bumpData();
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
    setSkip({ N: false, P: false, K: false, ph: false });
    setRainPreset("");
    setV(Object.fromEntries(Object.entries(ex).map(([k, val]) => [k, String(val)])));
    setStep(1);
    toast("info", "Example values filled in — replace them with your soil test and weather.");
  }

  const form = (
    <Panel title="Your land" icon={ScanSearch}>
      <ModelStatusNote tool="crop" />
      {opts.error ? <ErrorState error={opts.error} onRetry={opts.reload} /> : opts.loading ? <LoadingState /> : (
        <StepForm steps={["Soil Health Card", "Weather"]} step={step} onStep={(n) => (n < step || validate(step)) && setStep(n)} canNext={validate}
          onSubmit={submit} submitting={busy} submitLabel="Find the best crop"
          footer={apiError && <div className="mt-4"><ErrorState error={apiError} compact /></div>}>
          {step === 0 ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-forest-950/40 px-3 py-2">
                <p className="flex items-center gap-2 text-sm"><FlaskConical className="h-4 w-4 text-neon" />From your Soil Health Card <span className="text-ink-faint">(मृदा स्वास्थ्य कार्ड)</span></p>
                <DontKnowToggle checked={SOIL.every((s) => skip[s.key])} label="I don't have the card"
                  onChange={(c) => { setSkip({ N: c, P: c, K: c, ph: c }); setErrors({}); }} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {SOIL.map((s) => (
                  <FormField key={s.key} label={s.label} unit={s.unit} htmlFor={`c-${s.key}`} error={errors[s.key]}
                    where="Printed on your Soil Health Card." warning={outside(s.key)}
                    range={skip[s.key] ? `Typical value ${opts.data?.medians[s.key]} will be used` : r?.[s.key] ? `Data ${r[s.key][0]}–${r[s.key][1]}` : undefined}
                    aside={<DontKnowToggle checked={skip[s.key]} onChange={(c) => { setSkip((x) => ({ ...x, [s.key]: c })); setErrors((e) => ({ ...e, [s.key]: "" })); }} label="Skip" />}>
                    <NumberInput id={`c-${s.key}`} value={skip[s.key] ? "" : v[s.key]} onChange={(val) => set(s.key, val)}
                      placeholder={skip[s.key] ? "Skipped" : `e.g. ${s.example}`} disabled={skip[s.key]} invalid={!!errors[s.key]} />
                  </FormField>
                ))}
              </div>
              <p className="text-xs text-ink-muted">Don’t have a Soil Health Card? Get your soil tested at the nearest soil testing lab or Krishi Vigyan Kendra (KVK).</p>
            </>
          ) : (
            <>
              <p className="flex items-center gap-2 text-sm"><CloudSun className="h-4 w-4 text-neon" />Weather for the growing season</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Temperature" required unit="°C" htmlFor="c-temp" error={errors.temperature} warning={outside("temperature")}
                  where="Weather app — the average for the growing season." range={r ? `Data ${r.temperature[0]}–${r.temperature[1]} °C` : undefined}>
                  <NumberInput id="c-temp" value={v.temperature} onChange={(val) => set("temperature", val)} placeholder="e.g. 25" invalid={!!errors.temperature} />
                </FormField>
                <FormField label="Humidity" required unit="%" htmlFor="c-hum" error={errors.humidity} warning={outside("humidity")} where="Weather app." range="0–100 %">
                  <NumberInput id="c-hum" value={v.humidity} onChange={(val) => set("humidity", val)} placeholder="e.g. 80" min={0} max={100} invalid={!!errors.humidity} />
                </FormField>
              </div>
              <FormField label="Rainfall" required unit="mm" htmlFor="c-rain" error={errors.rainfall} warning={rainPreset ? null : outside("rainfall")}
                where="Average rainfall for the season. Don’t know the number? Pick Low, Medium or High."
                range={rainPreset ? `${titleCase(rainPreset)} ≈ ${opts.data?.rain_presets[rainPreset]} mm` : r ? `Data ${r.rainfall[0]}–${r.rainfall[1]} mm` : undefined}>
                <div className="space-y-2">
                  <NumberInput id="c-rain" value={rainPreset ? "" : v.rainfall} onChange={(val) => { setRainPreset(""); set("rainfall", val); }}
                    placeholder={rainPreset ? "Using a preset" : "e.g. 200"} invalid={!!errors.rainfall} />
                  <RadioCards name="Rainfall preset" value={rainPreset} onChange={(p) => { setRainPreset(p); setErrors((e) => ({ ...e, rainfall: "" })); }} columns={3}
                    options={[{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }]} />
                </div>
              </FormField>
            </>
          )}
        </StepForm>
      )}
    </Panel>
  );

  const resultPanel = (
    <Panel title="Result" icon={Trophy} actions={result && <EditInputs onClick={() => setStep(0)} />}>
      {!result ? (
        <ResultEmpty icon={Sprout} title="Your crop match will appear here" lines={["The best-matching crop with a % match", "The top 3 crops, ranked", "Which values were assumed"]} />
      ) : (
        <div className="space-y-4 animate-fade-up" aria-live="polite">
          {result.low_confidence && <p className="rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-sm">These conditions don’t clearly match any one crop.</p>}
          <ol className="space-y-2">
            {result.top.map((t, i) => (
              <li key={t.crop} className={`rounded-xl border p-3 ${i === 0 ? "border-neon/50 bg-neon/10 shadow-glow" : "border-[color:var(--line)] bg-forest-950/40"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-forest-800 text-xs">{i + 1}</span>
                    <span className={`font-semibold ${i === 0 ? "text-lg" : ""}`}>{titleCase(t.crop)}</span>
                    {i === 0 && <span className="rounded bg-neon/20 px-1.5 py-px text-[10px] font-semibold uppercase text-neon">Best match</span>}
                  </span>
                  <span className="text-sm font-medium">{t.match}%</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-forest-700"><div className={`h-1.5 rounded-full ${i === 0 ? "bg-neon" : "bg-ink-faint"}`} style={{ width: `${t.match}%` }} /></div>
              </li>
            ))}
          </ol>
          <ModelWarnings warnings={result.warnings.filter((w) => !w.startsWith("Low confidence"))} />
          <details className="rounded-lg border border-[color:var(--line)] bg-forest-950/40 px-3 py-2 text-sm">
            <summary className="cursor-pointer text-ink-muted">Values used</summary>
            <ul className="mt-2 grid grid-cols-2 gap-1 text-xs">
              {Object.entries(result.inputs).map(([k, val]) => {
                const assumed = result.assumed.some((a) => a.field === k);
                return <li key={k} className="flex justify-between gap-2"><span className="text-ink-muted">{k}</span><span>{val}{assumed && <span className="text-cyan-accent"> (assumed)</span>}</span></li>;
              })}
            </ul>
            {result.rainfall_preset && <p className="mt-2 text-xs text-ink-faint">Rainfall from the “{result.rainfall_preset}” preset.</p>}
          </details>
          <AssumedValuesNote assumed={result.assumed} title="soil values were assumed (dataset median)" />
          <AccuracyNote>{result.accuracy_note}</AccuracyNote>
          <SavedNote savedId={result.saved_id} />
        </div>
      )}
    </Panel>
  );

  const crops = guide.data?.supported_crops ?? [];
  return (
    <>
      <PageHeader eyebrow="Crop Analysing" title="Best crop for your land" question="Which crop should I grow on my land?"
        output="The best-matching crop with a % match, and the top 3 crops" />
      <ToolLayout result={resultPanel} form={form}
        guide={<InputGuidePanel guide={guide.data} loading={guide.loading} onExample={fillExample}
          extra={crops.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium">The model chooses only among these {crops.length} crops</p>
              <div className="flex flex-wrap gap-1.5">{crops.map((c) => <span key={c} className="chip">{titleCase(c)}</span>)}</div>
            </div>
          )} />} />
      <div className="mt-5">
        <HistoryList<CropRecord> title="Past recommendations" path="/crops/history" deletePath={(id) => `/crops/history/${id}`}
          empty={{ title: "No recommendations yet", text: "Run the crop analysis to start your history." }}
          render={(c) => (
            <>
              <p className="text-sm text-ink">{titleCase(c.crop)} — {c.confidence}% match</p>
              <p className="text-xs text-ink-muted">Then {c.top.slice(1).map((t) => `${titleCase(t.crop)} ${t.match}%`).join(", ")}
                {c.assumed.length > 0 && ` · ${c.assumed.length} values assumed`}</p>
            </>
          )} />
      </div>
    </>
  );
}

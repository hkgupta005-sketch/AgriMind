import { useEffect, useRef, useState } from "react";
import { BarChart3, Droplets, Gauge } from "lucide-react";
import { PageHeader, Panel } from "../components/ui/Panel";
import { InputGuidePanel } from "../components/form/InputGuidePanel";
import { DontKnowToggle, FormField, NumberInput, RadioCards, UnitInput } from "../components/form/FormField";
import { StepForm } from "../components/form/StepForm";
import { AccuracyNote, AssumedValuesNote, EditInputs, ModelWarnings, ResultEmpty, SavedNote } from "../components/form/ResultBits";
import { ErrorState, EmptyState, LoadingState, StatusBadge, needTone } from "../components/ui/States";
import { HistoryList } from "../components/ui/HistoryList";
import { ModelStatusNote, revealResult, ToolLayout, useGuide } from "../components/ui/ToolPage";
import { MoistureChart } from "../components/charts/Charts";
import { api, ApiError } from "../lib/api";
import { useApi } from "../hooks/useApi";
import { ACRES_PER_HA, fmt } from "../lib/format";
import type { IrrigationRecord, IrrigationResult, Page } from "../lib/types";
import { useSession } from "../context/SessionContext";
import { useToast } from "../context/ToastContext";

interface Opts { choices: Record<string, string[]>; ranges: Record<string, [number, number]>; states: string[] }

const STAGES = [
  { value: "Sowing", label: "Sowing", help: "Seeds just planted / small seedlings" },
  { value: "Vegetative", label: "Vegetative", help: "Plant growing, leaves increasing" },
  { value: "Flowering", label: "Flowering", help: "Flowers or grains forming" },
  { value: "Harvest", label: "Harvest", help: "Ready or nearly ready to cut" },
];
const SEASONS = [
  { value: "Kharif", label: "Kharif", help: "Monsoon crop, sown June–July" },
  { value: "Rabi", label: "Rabi", help: "Winter crop, sown Oct–Nov" },
  { value: "Zaid", label: "Zaid", help: "Summer crop, sown March–April" },
];
const SOIL = [
  { value: "very_dry", label: "Very dry", help: "Dusty, cracked, falls apart" },
  { value: "dry", label: "Dry", help: "Crumbles, doesn’t hold shape" },
  { value: "slightly_moist", label: "Slightly moist", help: "Holds shape a little, then breaks" },
  { value: "moist", label: "Moist", help: "Forms a ball, feels cool" },
  { value: "wet", label: "Wet / muddy", help: "Water comes out when squeezed" },
];
const RAIN = [
  { value: "very_little", label: "Very little", help: "Almost no rain" },
  { value: "below_normal", label: "Below normal", help: "Less than usual" },
  { value: "normal", label: "Normal", help: "Usual rain" },
  { value: "good", label: "Good", help: "More than usual" },
  { value: "heavy", label: "Heavy", help: "Very heavy / flooding" },
];
const WIND = [
  { value: "calm", label: "Calm", help: "Leaves hardly move" },
  { value: "light", label: "Light breeze", help: "Leaves move gently" },
  { value: "breezy", label: "Breezy", help: "Small branches move" },
  { value: "windy", label: "Windy", help: "Dust blows, branches sway" },
];
const SOIL_TYPES = [
  { value: "Clay", label: "Clay", help: "Sticky when wet, cracks when dry" },
  { value: "Loamy", label: "Loamy", help: "Soft, dark, crumbly" },
  { value: "Sandy", label: "Sandy", help: "Gritty, drains fast" },
  { value: "Silt", label: "Silt", help: "Smooth, like flour" },
];
const WATERING = [
  { value: "Canal", label: "Canal", help: "Channels / flooding" }, { value: "Drip", label: "Drip", help: "Drops at each plant" },
  { value: "Sprinkler", label: "Sprinkler", help: "Sprayed from above" }, { value: "Rainfed", label: "Rainfed", help: "Only rain" },
];
const SOURCES = [
  { value: "Groundwater", label: "Groundwater", help: "Borewell / well" }, { value: "River", label: "River / canal", help: "" },
  { value: "Reservoir", label: "Reservoir", help: "Pond, tank or dam" }, { value: "Rainwater", label: "Rainwater", help: "Stored rain" },
];

type Q = {
  crop: string; growth_stage: string; season: string; soil_feel: string; meter: string; useMeter: boolean;
  temperature_c: string; rain: string; wind: string; mulch: "" | "yes" | "no";
  state: string; soil_type: string; irrigation_type: string; water_source: string; humidity: string;
  sunlight_hours: string; area: string; areaUnit: "ha" | "acre"; previous_water: string;
  soil_ph: string; organic_carbon: string; ec: string; noCard: boolean;
};
const blank: Q = {
  crop: "", growth_stage: "", season: "", soil_feel: "", meter: "", useMeter: false, temperature_c: "", rain: "", wind: "", mulch: "",
  state: "", soil_type: "", irrigation_type: "", water_source: "", humidity: "", sunlight_hours: "", area: "", areaUnit: "ha",
  previous_water: "", soil_ph: "", organic_carbon: "", ec: "", noCard: false,
};

export default function IrrigationPage() {
  const { profile, bumpData, dataVersion } = useSession();
  const toast = useToast();
  const guide = useGuide("irrigation");
  const opts = useApi<Opts>("/options/irrigation");
  const [q, setQ] = useState<Q>(blank);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IrrigationResult | null>(null);
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const history = useApi<Page<IrrigationRecord>>(`/irrigation/history?page_size=30`, [dataVersion]);

  useEffect(() => {
    if (!profile) return;
    setQ((x) => ({ ...x, state: x.state || (profile.state ?? ""), soil_type: x.soil_type || (profile.soil_type ?? ""),
      area: x.area || (profile.farm_area_ha ? String(profile.farm_area_ha) : "") }));
  }, [profile]);

  const set = <K extends keyof Q>(k: K, v: Q[K]) => { setErrors((e) => ({ ...e, [k]: "" })); setQ((x) => ({ ...x, [k]: v })); };
  const tRange = opts.data?.ranges.Temperature_C;

  function validateStep(s: number) {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!q.crop) e.crop = "Choose the crop";
      if (!q.growth_stage) e.growth_stage = "Choose the growth stage";
      if (!q.season) e.season = "Choose the season";
    } else {
      if (q.useMeter) {
        const m = parseFloat(q.meter);
        if (Number.isNaN(m) || m < 0 || m > 100) e.soil = "Moisture must be between 0 and 100 %";
      } else if (!q.soil_feel) e.soil = "Choose how the soil feels";
      const t = parseFloat(q.temperature_c);
      if (q.temperature_c === "" || Number.isNaN(t)) e.temperature_c = "Enter today’s temperature";
      else if (t < -20 || t > 60) e.temperature_c = "Temperature must be between -20 and 60 °C";
      if (!q.rain) e.rain = "Choose how much rain there has been";
      if (!q.wind) e.wind = "Choose the wind";
      if (!q.mulch) e.mulch = "Choose yes or no";
      const ph = parseFloat(q.soil_ph);
      if (q.soil_ph && (Number.isNaN(ph) || ph < 0 || ph > 14)) e.soil_ph = "pH must be between 0 and 14";
      const sun = parseFloat(q.sunlight_hours);
      if (q.sunlight_hours && (Number.isNaN(sun) || sun < 0 || sun > 24)) e.sunlight_hours = "Between 0 and 24 hours";
    }
    setErrors(e);
    return !Object.keys(e).length;
  }

  async function submit() {
    if (busy || !validateStep(0)) { setStep(0); return; }
    if (!validateStep(1)) return;
    setBusy(true);
    setApiError(null);
    const num = (v: string) => (v === "" ? null : parseFloat(v));
    const areaHa = q.area ? (q.areaUnit === "acre" ? parseFloat(q.area) / ACRES_PER_HA : parseFloat(q.area)) : null;
    const details = {
      state: q.state || null, soil_type: q.soil_type || null, irrigation_type: q.irrigation_type || null,
      water_source: q.water_source || null, humidity: q.humidity || null, sunlight_hours: num(q.sunlight_hours),
      field_area_ha: areaHa, previous_water: q.previous_water || null,
      soil_ph: q.noCard ? null : num(q.soil_ph), organic_carbon: q.noCard ? null : num(q.organic_carbon), ec: q.noCard ? null : num(q.ec),
    };
    try {
      const r = await api<IrrigationResult>("/irrigation/quick", {
        body: {
          crop: q.crop, growth_stage: q.growth_stage, season: q.season,
          soil_feel: q.useMeter ? null : q.soil_feel, soil_moisture_pct: q.useMeter ? parseFloat(q.meter) : null,
          temperature_c: parseFloat(q.temperature_c), rain: q.rain, wind: q.wind, mulch: q.mulch === "yes", details,
        },
      });
      setResult(r);
      revealResult();
      if (r.saved_id) bumpData();
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
    setQ({ ...blank, crop: ex.crop, growth_stage: ex.growth_stage, season: ex.season, soil_feel: ex.soil_feel,
      temperature_c: String(ex.temperature_c), rain: ex.rain, wind: ex.wind, mulch: ex.mulch ? "yes" : "no" });
    setStep(1);
    toast("info", "Example answers filled in — change them to match your field.");
  }

  const crops = opts.data?.choices.Crop_Type ?? [];
  const form = (
    <Panel title="Quick field check" icon={Droplets} subtitle="8 simple questions · about 1 minute">
      <ModelStatusNote tool="irrigation" />
      {opts.error ? <ErrorState error={opts.error} onRetry={opts.reload} /> : opts.loading ? <LoadingState /> : (
        <StepForm steps={["Your crop", "Your field today"]} step={step} onStep={(n) => (n < step || validateStep(step)) && setStep(n)}
          canNext={validateStep} onSubmit={submit} submitting={busy} submitLabel="Check irrigation need"
          footer={apiError && <div className="mt-4"><ErrorState error={apiError} compact /></div>}>
          {step === 0 ? (
            <>
              <FormField label="1. Which crop is in the field?" required error={errors.crop}>
                <RadioCards name="Crop" value={q.crop} onChange={(v) => set("crop", v)} columns={3} error={!!errors.crop}
                  options={crops.map((c) => ({ value: c, label: c }))} />
              </FormField>
              <FormField label="2. What stage is the crop at?" required error={errors.growth_stage} where="Look at the plants.">
                <RadioCards name="Growth stage" value={q.growth_stage} onChange={(v) => set("growth_stage", v)} columns={4} options={STAGES} error={!!errors.growth_stage} />
              </FormField>
              <FormField label="3. Which season is it?" required error={errors.season}>
                <RadioCards name="Season" value={q.season} onChange={(v) => set("season", v)} columns={3} options={SEASONS} error={!!errors.season} />
              </FormField>
            </>
          ) : (
            <>
              <FormField label="4. How does the soil feel?" required error={errors.soil}
                where="Pick up a handful of soil from 5–10 cm deep and squeeze it."
                aside={<DontKnowToggle checked={q.useMeter} onChange={(v) => set("useMeter", v)} label="I have a moisture meter" />}>
                {q.useMeter
                  ? <NumberInput value={q.meter} onChange={(v) => set("meter", v)} placeholder="Meter reading, e.g. 24" min={0} max={100} invalid={!!errors.soil} />
                  : <RadioCards name="Soil feel" value={q.soil_feel} onChange={(v) => set("soil_feel", v)} columns={5} options={SOIL} error={!!errors.soil} />}
              </FormField>
              <FormField label="5. Today’s temperature" required unit="°C" htmlFor="i-temp" error={errors.temperature_c}
                where="Check the weather app on your phone." range={tRange ? `Data covers ${tRange[0]}–${tRange[1]} °C` : undefined}
                warning={tRange && q.temperature_c && (+q.temperature_c < tRange[0] || +q.temperature_c > tRange[1]) ? "Outside the model’s data — the result will be less reliable." : null}>
                <NumberInput id="i-temp" value={q.temperature_c} onChange={(v) => set("temperature_c", v)} placeholder="e.g. 35" invalid={!!errors.temperature_c} />
              </FormField>
              <FormField label="6. How much rain this season?" required error={errors.rain}>
                <RadioCards name="Rain" value={q.rain} onChange={(v) => set("rain", v)} columns={5} options={RAIN} error={!!errors.rain} />
              </FormField>
              <FormField label="7. How windy is it these days?" required error={errors.wind} where="Wind dries the soil faster.">
                <RadioCards name="Wind" value={q.wind} onChange={(v) => set("wind", v)} columns={4} options={WIND} error={!!errors.wind} />
              </FormField>
              <FormField label="8. Is the soil covered with mulch?" required error={errors.mulch} where="Mulch = straw, dry leaves or a plastic sheet spread on the soil to keep water in.">
                <RadioCards name="Mulch" value={q.mulch} onChange={(v) => set("mulch", v as Q["mulch"])} columns={2} error={!!errors.mulch}
                  options={[{ value: "yes", label: "Yes, mulch is used" }, { value: "no", label: "No mulch" }]} />
              </FormField>

              <details className="rounded-lg border border-[color:var(--line)] bg-forest-950/30 p-4">
                <summary className="cursor-pointer text-sm font-medium">More details for a better result <span className="text-ink-faint">(optional · about 2 minutes)</span></summary>
                <div className="mt-4 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="State" htmlFor="i-state" help="Used to pick your region (North, East, West, South, Central).">
                      <select id="i-state" className="input" value={q.state} onChange={(e) => set("state", e.target.value)}>
                        <option value="">Skip</option>
                        {(opts.data?.states ?? []).map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </FormField>
                    <FormField label="Field size" htmlFor="i-area" unit={q.areaUnit === "ha" ? "hectares" : "acres"}>
                      <UnitInput id="i-area" value={q.area} onChange={(v) => set("area", v)} unit={q.areaUnit} onUnitChange={(u) => set("areaUnit", u)}
                        units={[{ value: "ha", label: "ha" }, { value: "acre", label: "acre" }]} placeholder="e.g. 2"
                        convert={(v, from, to) => (from === to ? v : to === "acre" ? v * ACRES_PER_HA : v / ACRES_PER_HA)} />
                    </FormField>
                  </div>
                  <FormField label="Soil type"><RadioCards name="Soil type" value={q.soil_type} onChange={(v) => set("soil_type", v)} columns={4} options={SOIL_TYPES} /></FormField>
                  <FormField label="How do you water?"><RadioCards name="Watering" value={q.irrigation_type} onChange={(v) => set("irrigation_type", v)} columns={4} options={WATERING} /></FormField>
                  <FormField label="Water source"><RadioCards name="Water source" value={q.water_source} onChange={(v) => set("water_source", v)} columns={4} options={SOURCES} /></FormField>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Air humidity">
                      <RadioCards name="Humidity" value={q.humidity} onChange={(v) => set("humidity", v)} columns={3}
                        options={[{ value: "dry", label: "Dry" }, { value: "normal", label: "Normal" }, { value: "humid", label: "Humid" }]} />
                    </FormField>
                    <FormField label="Water given last time">
                      <RadioCards name="Previous water" value={q.previous_water} onChange={(v) => set("previous_water", v)} columns={3}
                        options={[{ value: "very_little", label: "Very little" }, { value: "normal", label: "Normal" }, { value: "a_lot", label: "A lot" }]} />
                    </FormField>
                  </div>
                  <FormField label="Sunshine" unit="hours per day" htmlFor="i-sun" error={errors.sunlight_hours} help="e.g. 8">
                    <NumberInput id="i-sun" value={q.sunlight_hours} onChange={(v) => set("sunlight_hours", v)} min={0} max={24} placeholder="e.g. 8" />
                  </FormField>
                  <div className="rounded-lg border border-[color:var(--line)] p-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">From your Soil Health Card <span className="text-ink-faint">(मृदा स्वास्थ्य कार्ड)</span></p>
                      <DontKnowToggle checked={q.noCard} onChange={(v) => set("noCard", v)} label="I don't have the card" />
                    </div>
                    {!q.noCard && (
                      <div className="grid gap-3 sm:grid-cols-3">
                        <FormField label="pH" htmlFor="i-ph" help="Usually 5–8" error={errors.soil_ph}><NumberInput id="i-ph" value={q.soil_ph} onChange={(v) => set("soil_ph", v)} min={0} max={14} /></FormField>
                        <FormField label="Organic carbon" unit="%" htmlFor="i-oc" help="Usually 0.3–1.5"><NumberInput id="i-oc" value={q.organic_carbon} onChange={(v) => set("organic_carbon", v)} min={0} /></FormField>
                        <FormField label="EC" unit="dS/m" htmlFor="i-ec" help="Usually 0.1–3.5"><NumberInput id="i-ec" value={q.ec} onChange={(v) => set("ec", v)} min={0} /></FormField>
                      </div>
                    )}
                  </div>
                </div>
              </details>
            </>
          )}
        </StepForm>
      )}
    </Panel>
  );

  const resultPanel = (
    <Panel title="Result" icon={Gauge} actions={result && <EditInputs onClick={() => { setStep(1); top.current?.scrollIntoView({ behavior: "smooth" }); }} />}>
      {!result ? (
        <ResultEmpty icon={Droplets} title="Your answer will appear here" lines={[
          "Irrigation need: Low, Medium or High", "Plain advice on what to do next", "Which values we assumed for you"]} />
      ) : (
        <div className="space-y-4 animate-fade-up" aria-live="polite">
          <div>
            <p className="mb-2 text-sm text-ink-muted">Irrigation need for {result.used.Crop} ({String(result.used["Growth stage"]).toLowerCase()} stage)</p>
            <div className="flex items-center gap-3">
              <span className="text-4xl font-semibold font-display">{result.need}</span>
              <StatusBadge tone={needTone(result.need)}>
                <Droplets className="h-3 w-3" />{result.need === "High" ? "Water soon" : result.need === "Medium" ? "Plan watering" : "Can wait"}
              </StatusBadge>
            </div>
            <p className="mt-3 text-ink">{result.advice}</p>
          </div>
          <p className="text-xs text-ink-muted">
            Soil moisture used: {fmt(result.soil_moisture_pct, 1)}% — {result.soil_moisture_source === "meter" ? "from your meter" : "from your description (typical value for that soil feel)"}.
          </p>
          <ModelWarnings warnings={result.warnings} />
          <AssumedValuesNote assumed={result.assumed} title="values were assumed because you skipped them" />
          <AccuracyNote>{result.accuracy_note}</AccuracyNote>
          <SavedNote savedId={result.saved_id} />
        </div>
      )}
    </Panel>
  );

  return (
    <div ref={top}>
      <PageHeader eyebrow="Pre-Irrigation" title="Pre-irrigation check" question="Does my field need water today?"
        output="Irrigation need: Low / Medium / High, with advice" />
      <ToolLayout guide={<InputGuidePanel guide={guide.data} loading={guide.loading} onExample={fillExample} />} form={form} result={resultPanel} />
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel title="Your checks over time" icon={BarChart3}>
          {history.loading ? <LoadingState /> : history.error ? <ErrorState error={history.error} compact />
            : !history.data?.items.length ? <EmptyState icon={BarChart3} compact title="No checks yet" text="Each check you run is saved and shown here." />
            : <MoistureChart rows={[...history.data.items].reverse().map((r) => ({ date: r.created_at, moisture: r.soil_moisture_pct, need: r.need, source: r.soil_moisture_source, crop: r.crop }))} />}
        </Panel>
        <HistoryList<IrrigationRecord> title="Recent irrigation checks" path="/irrigation/history" deletePath={(id) => `/irrigation/history/${id}`}
          empty={{ title: "No checks yet", text: "Run a quick check to start your history." }}
          render={(r) => (
            <div className="flex items-center gap-2">
              <StatusBadge tone={needTone(r.need)}>{r.need}</StatusBadge>
              <span className="text-sm text-ink">{r.crop} · {r.growth_stage} · {r.season}</span>
            </div>
          )} />
      </div>
    </div>
  );
}

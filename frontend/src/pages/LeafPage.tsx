import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, ImageUp, Leaf, RefreshCw, ScanLine, Trash2, TriangleAlert, X } from "lucide-react";
import { PageHeader, Panel } from "../components/ui/Panel";
import { InputGuidePanel } from "../components/form/InputGuidePanel";
import { AccuracyNote, ResultEmpty, SavedNote } from "../components/form/ResultBits";
import { ErrorState, Spinner, StatusBadge } from "../components/ui/States";
import { HistoryList } from "../components/ui/HistoryList";
import { ModelStatusNote, revealResult, ToolLayout, useGuide } from "../components/ui/ToolPage";
import { api, ApiError } from "../lib/api";
import type { LeafRecord, LeafResult } from "../lib/types";
import { useSession } from "../context/SessionContext";

const MAX = 8 * 1024 * 1024;

function PhotoTips({ tips }: { tips: string[] }) {
  return (
    <div className="mt-4">
      <p className="mb-2 text-sm font-medium">How to take a good photo</p>
      <div className="mb-3 grid grid-cols-2 gap-2 text-[11px]">
        <figure className="rounded-lg border border-neon/30 bg-neon/5 p-2 text-center">
          <svg viewBox="0 0 80 60" className="mx-auto h-14 w-full" aria-hidden>
            <rect width="80" height="60" rx="6" fill="#F3F1E8" />
            <path d="M40 8 C58 16 62 38 40 54 C18 38 22 16 40 8 Z" fill="#3E9B4F" />
            <path d="M40 10 V52" stroke="#2A6E37" strokeWidth="1.5" />
            <circle cx="47" cy="30" r="3" fill="#8A6A2B" /><circle cx="34" cy="38" r="2.4" fill="#8A6A2B" />
          </svg>
          <figcaption className="mt-1 flex items-center justify-center gap-1 text-neon"><CheckCircle2 className="h-3 w-3" />Good: one leaf, plain background</figcaption>
        </figure>
        <figure className="rounded-lg border border-danger/30 bg-danger/5 p-2 text-center">
          <svg viewBox="0 0 80 60" className="mx-auto h-14 w-full" aria-hidden>
            <rect width="80" height="60" rx="6" fill="#4F6B3A" />
            {[[16, 20], [36, 14], [58, 22], [24, 42], [50, 44], [68, 40]].map(([x, y], i) => (
              <ellipse key={i} cx={x} cy={y} rx="9" ry="5" transform={`rotate(${i * 35} ${x} ${y})`} fill="#2F5A28" opacity=".9" />
            ))}
            <rect width="80" height="60" rx="6" fill="#000" opacity=".25" />
          </svg>
          <figcaption className="mt-1 flex items-center justify-center gap-1 text-danger"><X className="h-3 w-3" />Avoid: many leaves, dark, blurry</figcaption>
        </figure>
      </div>
      <ul className="space-y-1 text-xs text-ink-muted">{tips.map((t) => <li key={t} className="flex gap-2"><span className="text-neon">•</span>{t}</li>)}</ul>
    </div>
  );
}

export default function LeafPage() {
  const { bumpData } = useSession();
  const guide = useGuide("leaf");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LeafResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function choose(f: File | undefined | null) {
    if (!f) return;
    setFileError(null);
    if (!/^image\/(jpeg|png)$/.test(f.type)) return setFileError("Please choose a JPG or PNG photo.");
    if (f.size > MAX) return setFileError("This photo is larger than 8 MB. Please use a smaller photo.");
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setError(null);
  }

  async function analyse() {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("photo", file);
    try {
      const r = await api<LeafResult>("/leaf/predict", { form, timeoutMs: 90000 });
      setResult(r);
      revealResult();
      if (r.saved_id) bumpData();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  }

  const tips = guide.data?.photo_tips ?? [];
  const plants = guide.data?.supported_plants ?? [];
  const guidePanel = (
    <InputGuidePanel guide={guide.data} loading={guide.loading}
      extra={guide.data && (
        <>
          <PhotoTips tips={tips} />
          {plants.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium">Plants the model can check</p>
              <div className="flex flex-wrap gap-1.5">{plants.map((p) => <span key={p} className="chip">{p}</span>)}</div>
            </div>
          )}
        </>
      )} />
  );

  const form = (
    <Panel title="Leaf photo" icon={ImageUp}>
      <ModelStatusNote tool="leaf" />
      <input ref={picker} type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
      {!preview ? (
        <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); choose(e.dataTransfer.files?.[0]); }}
          className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition
            ${drag ? "border-neon bg-neon/5" : fileError ? "border-danger/50" : "border-[color:var(--line-strong)] bg-forest-950/30"}`}>
          <Leaf className="mb-3 h-10 w-10 text-neon/70" aria-hidden />
          <p className="font-medium">Drop a leaf photo here</p>
          <p className="mt-1 text-sm text-ink-muted">JPG or PNG, up to 8 MB</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button type="button" className="btn-primary" onClick={() => picker.current?.click()}><ImageUp className="h-4 w-4" />Choose photo</button>
            <button type="button" className="btn-secondary sm:hidden" onClick={() => camera.current?.click()}><Camera className="h-4 w-4" />Take photo</button>
          </div>
        </div>
      ) : (
        <div>
          <div className="relative overflow-hidden rounded-xl border border-[color:var(--line)] bg-black/30">
            <img src={preview} alt="Selected leaf" className="mx-auto max-h-80 object-contain" />
            {busy && (
              <div className="absolute inset-0 grid place-items-center bg-forest-950/60">
                <span className="flex items-center gap-2 text-sm"><ScanLine className="h-4 w-4 animate-pulse text-neon" />Checking the leaf…</span>
              </div>
            )}
          </div>
          <p className="mt-2 truncate text-xs text-ink-muted">{file?.name} · {((file?.size ?? 0) / 1024 / 1024).toFixed(1)} MB</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-primary" onClick={analyse} disabled={busy}>{busy ? <Spinner /> : <ScanLine className="h-4 w-4" />}Check this leaf</button>
            <button className="btn-secondary" onClick={() => picker.current?.click()} disabled={busy}><RefreshCw className="h-4 w-4" />Replace</button>
            <button className="btn-ghost" onClick={() => { setFile(null); setPreview(null); setResult(null); }} disabled={busy}><Trash2 className="h-4 w-4" />Remove</button>
          </div>
        </div>
      )}
      {fileError && <p className="mt-2 text-sm text-danger" role="alert">{fileError}</p>}
      {error && <div className="mt-4"><ErrorState error={error.unavailable ? new ApiError(503, "Leaf prediction model not configured yet.", null, error.detail) : error} compact /></div>}
      <p className="mt-4 text-xs text-ink-faint">Your photo is only used for this check and then deleted; a small thumbnail is kept with your saved result.</p>
    </Panel>
  );

  const resultPanel = (
    <Panel title="Result" icon={ScanLine}>
      {!result ? (
        <ResultEmpty icon={Leaf} title="The diagnosis will appear here" lines={["Plant and condition, e.g. “Tomato leaf — Early blight”", "How sure the model is", "What to do next"]} />
      ) : (
        <div className="space-y-4 animate-fade-up" aria-live="polite">
          <div>
            <p className="text-sm text-ink-muted">{result.plant} leaf</p>
            <p className={`mt-1 font-display text-3xl font-semibold ${result.is_healthy ? "text-neon" : "text-ink"}`}>
              {result.is_healthy ? "Healthy ✓" : result.condition}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge tone={result.low_confidence ? "amber" : "cyan"}>{result.confidence}% confidence</StatusBadge>
              {!result.is_healthy && <StatusBadge tone="red"><TriangleAlert className="h-3 w-3" />Possible disease</StatusBadge>}
            </div>
          </div>
          {result.low_confidence && (
            <div className="rounded-lg border border-warn/30 bg-warn/5 p-3 text-sm">
              <p className="font-medium text-warn">The model is not sure — take a clearer photo.</p>
              <ul className="mt-1 list-disc pl-5 text-xs text-ink-muted">{tips.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          )}
          <div className="rounded-lg border border-[color:var(--line)] p-3 text-sm">
            <p className="mb-1 font-medium">What to do next</p>
            <p className="text-ink-muted">{result.advice}</p>
            {result.kvk && <p className="mt-2 text-ink">{result.kvk}</p>}
          </div>
          {result.top.length > 1 && (
            <div>
              <p className="mb-2 text-xs text-ink-muted">Other possibilities (how unsure the model is — not other diseases on the leaf)</p>
              <ul className="space-y-1.5">
                {result.top.slice(1).map((t) => (
                  <li key={t.raw_class} className="text-xs">
                    <div className="flex justify-between gap-2"><span>{t.plant} — {t.condition}</span><span className="text-ink-muted">{t.confidence}%</span></div>
                    <div className="mt-1 h-1 rounded-full bg-forest-700"><div className="h-1 rounded-full bg-ink-faint" style={{ width: `${t.confidence}%` }} /></div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <AccuracyNote>{result.note}</AccuracyNote>
          <SavedNote savedId={result.saved_id} />
        </div>
      )}
    </Panel>
  );

  return (
    <>
      <PageHeader eyebrow="Leaf Prediction" title="Leaf health check" question="Is my plant sick?"
        output="Plant and condition (e.g. “Tomato — Early blight”), confidence and next steps" />
      <ToolLayout guide={guidePanel} form={form} result={resultPanel} />
      <div className="mt-5">
        <HistoryList<LeafRecord> title="Recent leaf checks" path="/leaf/history" deletePath={(id) => `/leaf/history/${id}`}
          empty={{ title: "No leaf checks yet", text: "Upload a leaf photo to start." }}
          render={(r) => (
            <div className="flex items-center gap-3">
              {r.thumbnail ? <img src={r.thumbnail} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <Leaf className="h-6 w-6 text-neon" />}
              <div>
                <p className="text-sm text-ink">{r.plant} — {r.is_healthy ? "Healthy" : r.condition}</p>
                <p className="text-xs text-ink-muted">{r.confidence}% confidence</p>
              </div>
            </div>
          )} />
      </div>
    </>
  );
}

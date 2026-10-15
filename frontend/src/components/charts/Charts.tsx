import { useState, type ReactNode } from "react";
import {
  Area, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Table2, LineChart as LineIcon } from "lucide-react";

// Validated (dataviz validator, dark mode, surface #0B2B20): green + indigo pass lightness, chroma,
// CVD and normal-vision checks. Tritan separation is in the floor band, so the second series is
// always also dashed and labelled (secondary encoding), and every chart has a table view.
export const SERIES = { primary: "#1FA855", secondary: "#7581E6" };
const AXIS = { stroke: "rgba(169,189,176,.35)", tick: { fill: "#A9BDB0", fontSize: 11 } };
const GRID = "rgba(169,189,176,.10)";

function TooltipBox({ title, rows }: { title: ReactNode; rows: { label: string; value: string; color?: string; dashed?: boolean }[] }) {
  return (
    <div className="glass-strong min-w-[150px] px-3 py-2 text-xs">
      <p className="mb-1 font-semibold text-ink">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center justify-between gap-4 text-ink-muted">
          <span className="flex items-center gap-1.5">
            {r.color && <span className="inline-block h-0.5 w-3" style={{ background: r.dashed ? `repeating-linear-gradient(90deg, ${r.color} 0 3px, transparent 3px 5px)` : r.color }} />}
            {r.label}
          </span>
          <span className="font-medium text-ink">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean; band?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className={i.band ? "h-2.5 w-4 rounded-sm" : "h-0.5 w-4"}
            style={{ background: i.band ? `${i.color}33` : i.dashed ? `repeating-linear-gradient(90deg, ${i.color} 0 4px, transparent 4px 6px)` : i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** Chart with a Chart/Table toggle so values are never color-only. */
export function ChartFrame({ chart, table, legend, caption, height = 240 }: {
  chart: ReactNode; table: { head: string[]; rows: (string | number)[][] }; legend?: ReactNode; caption?: ReactNode; height?: number;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>{legend}</div>
        <div className="flex rounded-md border border-[color:var(--line)] p-0.5" role="group" aria-label="Chart view">
          {(["chart", "table"] as const).map((v) => (
            <button key={v} aria-pressed={view === v} onClick={() => setView(v)}
              className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium ${view === v ? "bg-neon/15 text-neon" : "text-ink-muted hover:text-ink"}`}>
              {v === "chart" ? <LineIcon className="h-3 w-3" /> : <Table2 className="h-3 w-3" />}{v === "chart" ? "Chart" : "Table"}
            </button>
          ))}
        </div>
      </div>
      {view === "chart"
        ? <div style={{ height }} className="w-full">{chart}</div>
        : (
          <div className="overflow-auto rounded-lg border border-[color:var(--line)]" style={{ maxHeight: height + 40 }}>
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-forest-850 text-ink-muted"><tr>{table.head.map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
              <tbody>{table.rows.map((r, i) => (
                <tr key={i} className="border-t border-[color:var(--line)]">{r.map((c, j) => <td key={j} className="px-3 py-1.5 text-ink">{c}</td>)}</tr>
              ))}</tbody>
            </table>
          </div>
        )}
      {caption && <p className="mt-2 text-[11px] text-ink-faint">{caption}</p>}
    </div>
  );
}

const n = (v: number | null | undefined, d = 2) => (v == null ? "—" : v.toLocaleString("en-IN", { maximumFractionDigits: d }));

/** Dataset yield by year (one series) with an optional reference line for the user's estimate. */
export function YieldHistoryChart({ rows, estimate }: { rows: { year: number; yield_t_per_ha: number; production_t: number; area_ha: number }[]; estimate?: number | null }) {
  return (
    <ChartFrame
      legend={estimate != null ? <Legend items={[{ label: "District yield (dataset)", color: SERIES.primary }, { label: "Your estimate", color: SERIES.secondary, dashed: true }]} /> : <span className="text-xs text-ink-muted">District yield, t/ha</span>}
      table={{ head: ["Year", "Yield (t/ha)", "Area (ha)", "Production (t)"], rows: rows.map((r) => [r.year, n(r.yield_t_per_ha), n(r.area_ha, 0), n(r.production_t, 0)]) }}
      chart={
        <ResponsiveContainer>
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="year" {...AXIS} tickLine={false} />
            <YAxis {...AXIS} tickLine={false} axisLine={false} width={44} />
            <Tooltip cursor={{ stroke: "rgba(243,248,244,.25)" }} content={({ active, payload, label }) => active && payload?.length ? (
              <TooltipBox title={label} rows={[{ label: "Yield", value: `${n(payload[0].value as number)} t/ha`, color: SERIES.primary },
                { label: "Production", value: `${n((payload[0].payload as any).production_t, 0)} t` }]} />) : null} />
            {estimate != null && <ReferenceLine y={estimate} stroke={SERIES.secondary} strokeDasharray="5 4" strokeWidth={2}
              label={{ value: `Your estimate ${n(estimate)}`, fill: "#C9CFF7", fontSize: 11, position: "insideTopRight" }} />}
            <Line type="monotone" dataKey="yield_t_per_ha" stroke={SERIES.primary} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#0B2B20", strokeWidth: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      } />
  );
}

/** AI estimate vs farmer-entered actual production by crop year. */
export function EstimateVsActualChart({ rows }: { rows: { year: number; estimate_t?: number; actual_t?: number }[] }) {
  return (
    <ChartFrame
      legend={<Legend items={[{ label: "AI estimate", color: SERIES.primary }, { label: "Your actual harvest", color: SERIES.secondary, dashed: true }]} />}
      table={{ head: ["Crop year", "AI estimate (t)", "Actual (t)"], rows: rows.map((r) => [r.year, n(r.estimate_t), n(r.actual_t)]) }}
      chart={
        <ResponsiveContainer>
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="year" {...AXIS} tickLine={false} />
            <YAxis {...AXIS} tickLine={false} axisLine={false} width={44} />
            <Tooltip cursor={{ stroke: "rgba(243,248,244,.25)" }} content={({ active, payload, label }) => active && payload?.length ? (
              <TooltipBox title={`Crop year ${label}`} rows={[
                { label: "AI estimate", value: `${n((payload[0].payload as any).estimate_t)} t`, color: SERIES.primary },
                { label: "Actual", value: `${n((payload[0].payload as any).actual_t)} t`, color: SERIES.secondary, dashed: true }]} />) : null} />
            <Line type="monotone" dataKey="estimate_t" stroke={SERIES.primary} strokeWidth={2} connectNulls dot={{ r: 4, fill: SERIES.primary, stroke: "#0B2B20", strokeWidth: 2 }} />
            <Line type="monotone" dataKey="actual_t" stroke={SERIES.secondary} strokeWidth={2} strokeDasharray="6 4" connectNulls dot={{ r: 4, fill: SERIES.secondary, stroke: "#0B2B20", strokeWidth: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      } />
  );
}

/** The user's saved price estimates over time, with the model's likely range as a band. */
export function PriceEstimatesChart({ rows }: { rows: { date: string; market: string; estimate: number; low: number; high: number }[] }) {
  const data = rows.map((r) => ({ ...r, label: new Date(r.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }), band: [r.low, r.high] }));
  return (
    <ChartFrame
      legend={<Legend items={[{ label: "Model estimate", color: SERIES.primary }, { label: "Likely range", color: SERIES.primary, band: true }]} />}
      caption="Your saved model estimates — not observed mandi prices. ₹ per quintal."
      table={{ head: ["Saved", "Mandi", "Estimate (₹/q)", "Range (₹/q)"], rows: rows.map((r) => [new Date(r.date).toLocaleString("en-IN"), r.market, n(r.estimate, 0), `${n(r.low, 0)} – ${n(r.high, 0)}`]) }}
      chart={
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" {...AXIS} tickLine={false} />
            <YAxis {...AXIS} tickLine={false} axisLine={false} width={52} />
            <Tooltip cursor={{ stroke: "rgba(243,248,244,.25)" }} content={({ active, payload }) => active && payload?.length ? (() => {
              const p = payload[0].payload as any;
              return <TooltipBox title={`${p.market} · ${p.label}`} rows={[{ label: "Estimate", value: `₹${n(p.estimate, 0)}`, color: SERIES.primary }, { label: "Range", value: `₹${n(p.low, 0)} – ₹${n(p.high, 0)}` }]} />;
            })() : null} />
            <Area dataKey="band" stroke="none" fill={SERIES.primary} fillOpacity={0.14} isAnimationActive={false} />
            <Line type="monotone" dataKey="estimate" stroke={SERIES.primary} strokeWidth={2} dot={{ r: 4, fill: SERIES.primary, stroke: "#0B2B20", strokeWidth: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
      } />
  );
}

/** Soil moisture used in each irrigation check (from description or meter). */
export function MoistureChart({ rows }: { rows: { date: string; moisture: number; need: string; source: string; crop: string }[] }) {
  const data = rows.map((r) => ({ ...r, label: new Date(r.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) }));
  return (
    <ChartFrame height={200}
      legend={<span className="text-xs text-ink-muted">Soil moisture used per check, %</span>}
      caption="Soil moisture comes from your description or your meter reading — not from sensors."
      table={{ head: ["Checked", "Crop", "Moisture %", "From", "Need"], rows: rows.map((r) => [new Date(r.date).toLocaleString("en-IN"), r.crop, n(r.moisture, 1), r.source, r.need]) }}
      chart={
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" {...AXIS} tickLine={false} />
            <YAxis {...AXIS} tickLine={false} axisLine={false} width={40} domain={[0, 70]} />
            <Tooltip cursor={{ stroke: "rgba(243,248,244,.25)" }} content={({ active, payload }) => active && payload?.length ? (() => {
              const p = payload[0].payload as any;
              return <TooltipBox title={`${p.crop} · ${p.label}`} rows={[{ label: "Moisture", value: `${n(p.moisture, 1)}%`, color: SERIES.primary }, { label: "Need", value: p.need }, { label: "From", value: p.source }]} />;
            })() : null} />
            <Line type="monotone" dataKey="moisture" stroke={SERIES.primary} strokeWidth={2} dot={{ r: 4, fill: SERIES.primary, stroke: "#0B2B20", strokeWidth: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      } />
  );
}

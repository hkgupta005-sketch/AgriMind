import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChartNoAxesCombined, ClipboardList, Droplets, LayoutDashboard, Leaf, MessageCircle, ScanSearch, ShieldCheck, Sprout, type LucideIcon } from "lucide-react";
import { HeroSequence } from "../components/hero/HeroSequence";
import { Logo } from "../components/layout/Logo";
import { useAssistant } from "../context/AssistantContext";

const frame = (n: number) => `/assets/hero-frames/mobile/frame_${String(n).padStart(4, "0")}.webp`;

const FEATURES: { to: string; icon: LucideIcon; title: string; q: string; text: string; img: string; acc: string }[] = [
  { to: "/production", icon: Sprout, title: "Crop Production", q: "How much will my crop produce?", img: frame(36),
    text: "Yield per hectare and total production for your district, crop and season — then record your real harvest.", acc: "District averages · usually within ±30 %" },
  { to: "/irrigation", icon: Droplets, title: "Pre-Irrigation", q: "Does my field need water today?", img: frame(62),
    text: "Eight plain questions — soil feel, weather, crop stage — give a Low / Medium / High irrigation need.", acc: "Clean training data · real fields may differ" },
  { to: "/leaf-prediction", icon: Leaf, title: "Leaf Prediction", q: "Is my plant sick?", img: frame(92),
    text: "Photograph one leaf. The model names the plant and condition across 38 classes and 14 plants.", acc: "Best on clear single-leaf photos" },
  { to: "/crop-price", icon: ChartNoAxesCombined, title: "Crop Price", q: "What price will my crop get?", img: frame(122),
    text: "Wholesale mandi price estimate in ₹ per quintal and per kg, always with a likely range.", acc: "Often ±50 % · a guide, not a live rate" },
  { to: "/crop-analysis", icon: ScanSearch, title: "Crop Analysing", q: "Which crop should I grow?", img: frame(150),
    text: "Match your Soil Health Card and season weather to the best of 22 crops, with a % match.", acc: "Chooses among 22 crops only" },
];

function TopBar() {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const on = () => setSolid(window.scrollY > window.innerHeight * 4.8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition ${solid ? "border-b border-[color:var(--line)] bg-forest-900/85 backdrop-blur-xl" : ""}`}
      style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-8">
        <Link to="/" aria-label="AgriMind home"><Logo /></Link>
        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Site">
          <a href="#features" className="btn-ghost hidden sm:inline-flex">Features</a>
          <a href="#how" className="btn-ghost hidden sm:inline-flex">How it works</a>
          <Link to="/dashboard" className="btn-secondary btn-sm sm:px-4 sm:py-2.5 sm:text-sm"><LayoutDashboard className="h-4 w-4" />Open Dashboard</Link>
        </nav>
      </div>
    </header>
  );
}

export default function LandingPage() {
  const { setOpen } = useAssistant();
  return (
    <div className="bg-forest-950">
      <TopBar />
      <main>
        <HeroSequence />

        <section id="features" className="relative scroll-mt-16 bg-forest-900 px-4 py-20 sm:px-8">
          <div className="mx-auto max-w-6xl">
            <p className="eyebrow mb-3">Five tools · one workspace</p>
            <h2 className="max-w-2xl text-3xl font-semibold sm:text-4xl">Answers to the questions farmers ask every season</h2>
            <p className="mt-3 max-w-2xl text-ink-muted">Each tool tells you what to enter, where to find it and how reliable the answer is — before you type anything.</p>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <Link key={f.to} to={f.to} className="glass card-link group overflow-hidden">
                  <div className="relative h-36 overflow-hidden">
                    <img src={f.img} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-forest-900/95 via-forest-900/30 to-transparent" />
                    <span className="absolute bottom-3 left-4 flex items-center gap-2 font-display text-lg font-semibold"><f.icon className="h-5 w-5 text-neon" />{f.title}</span>
                  </div>
                  <div className="p-4">
                    <p className="text-sm font-medium text-cyan-accent">“{f.q}”</p>
                    <p className="mt-2 text-sm text-ink-muted">{f.text}</p>
                    <p className="mt-3 text-[11px] text-ink-faint">{f.acc}</p>
                    <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-neon">Open<ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></span>
                  </div>
                </Link>
              ))}
              <button onClick={() => setOpen(true)} className="glass card-link flex flex-col items-start justify-between p-5 text-left">
                <div>
                  <MessageCircle className="mb-3 h-7 w-7 text-neon" />
                  <p className="font-display text-lg font-semibold">Ask the AgriMind Assistant</p>
                  <p className="mt-2 text-sm text-ink-muted">Ask in English, Hindi or Hinglish. It uses the same models and datasets, and shows which one it used.</p>
                </div>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-neon">Start a chat<ArrowRight className="h-4 w-4" /></span>
              </button>
            </div>
          </div>
        </section>

        <section id="how" className="scroll-mt-16 border-t border-[color:var(--line)] bg-forest-900 px-4 py-20 sm:px-8">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2">
            <div>
              <p className="eyebrow mb-3">How it works</p>
              <h2 className="text-3xl font-semibold">Built for real farmers, honest about limits</h2>
              <ol className="mt-8 space-y-6">
                {[
                  { icon: ClipboardList, t: "See what you need", d: "Every tool lists its inputs, units, examples and where to find them — Soil Health Card, weather app, your own eyes." },
                  { icon: Sprout, t: "Answer in plain words", d: "Choose “Dry” instead of typing 18 %, type “aloo” or “UP”, skip what you don’t know — we fill typical values and tell you." },
                  { icon: LayoutDashboard, t: "Keep a farm record", d: "Results are saved privately to your dashboard so you can compare seasons and track your real harvest." },
                ].map((s, i) => (
                  <li key={s.t} className="flex gap-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[color:var(--line)] bg-forest-800 font-display text-neon">{i + 1}</span>
                    <div><p className="font-semibold">{s.t}</p><p className="mt-1 text-sm text-ink-muted">{s.d}</p></div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="glass self-start p-6">
              <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5 text-neon" />What AgriMind will never do</p>
              <ul className="mt-4 space-y-3 text-sm text-ink-muted">
                <li>• Invent a prediction — if a model is not configured, the tool says so.</li>
                <li>• Present a model estimate as today’s live mandi price.</li>
                <li>• Draw a price trend from data that has no dates.</li>
                <li>• Claim sensor readings — soil moisture comes from your description or your meter.</li>
                <li>• Replace your KVK or agriculture officer before spraying chemicals.</li>
              </ul>
              <Link to="/dashboard" className="btn-primary mt-6">Open Dashboard<ArrowRight className="h-4 w-4" /></Link>
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-[color:var(--line)] bg-forest-950 px-4 py-8 text-sm text-ink-faint sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <Logo />
          <p>Grow Smarter. Farm Better. · Estimates are guides — confirm important decisions with an expert.</p>
        </div>
      </footer>
    </div>
  );
}

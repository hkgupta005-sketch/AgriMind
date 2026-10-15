import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChartNoAxesCombined, ChevronDown, Droplets, LayoutDashboard, Leaf, ScanSearch, Sprout } from "lucide-react";
import { FrameSequence, type HeroManifest } from "./frameSequence";
import { usePrefersReducedMotion } from "../../hooks/useApi";

const ZONE_INFO: Record<string, { icon: typeof Sprout; to: string; text: string; label: string }> = {
  production: { icon: Sprout, to: "/production", label: "Crop Production", text: "Estimate yield for your district, crop and season — then track what you actually harvest." },
  irrigation: { icon: Droplets, to: "/irrigation", label: "Pre-Irrigation", text: "Answer 8 simple questions about your field to see whether it needs water today." },
  leaf: { icon: Leaf, to: "/leaf-prediction", label: "Leaf Prediction", text: "Photograph one leaf and the model names the plant and the likely condition." },
  price: { icon: ChartNoAxesCombined, to: "/crop-price", label: "Crop Price", text: "Estimate the wholesale mandi price for your crop, with an honest likely range." },
  recommend: { icon: ScanSearch, to: "/crop-analysis", label: "Crop Analysing", text: "Match your soil test and weather to the crops that grow best in them." },
};

/**
 * Full-screen cinematic hero. The section is tall; an inner viewport is pinned (position: sticky)
 * and page scroll progress selects the video frame drawn on the canvas. Scrolling up reverses it.
 * All per-frame work happens in one requestAnimationFrame loop with refs — React does not re-render
 * on scroll (only when the visible zone changes).
 */
export function HeroSequence() {
  const reduced = usePrefersReducedMotion();
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const intro = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [manifest, setManifest] = useState<HeroManifest | null>(null);
  const [zone, setZone] = useState(-1);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/assets/hero-frames/manifest.json").then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setManifest).catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    if (!manifest || reduced || !canvas.current || !section.current) return;
    const cv = canvas.current;
    const ctx = cv.getContext("2d", { alpha: false });
    if (!ctx) return;
    const mobile = window.matchMedia("(max-width: 768px)").matches && window.devicePixelRatio < 2.5;
    const seq = new FrameSequence(manifest, mobile ? "mobile" : "desktop");
    let target = 0, current = 0, drawn = -1, raf = 0, running = false, visible = true, lastZone = -2;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(cv.clientWidth * dpr);
      cv.height = Math.round(cv.clientHeight * dpr);
      drawn = -1;
    };

    const draw = (index: number) => {
      const img = seq.nearest(index);
      if (!img) return false;
      const cw = cv.width, ch = cv.height, iw = img.naturalWidth, ih = img.naturalHeight;
      const s = Math.max(cw / iw, ch / ih);                // cover
      const w = iw * s, h = ih * s;
      ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
      return seq.has(index);              // false -> redraw when the exact frame arrives
    };

    const progress = () => {
      const el = section.current!;
      const total = el.offsetHeight - window.innerHeight;
      const y = -el.getBoundingClientRect().top;
      return total > 0 ? Math.min(1, Math.max(0, y / total)) : 0;
    };

    const tick = () => {
      raf = 0;
      current += (target - current) * 0.18;                 // eased, never jumps
      if (Math.abs(target - current) < 0.002) current = target;
      const p = current;
      const index = Math.min(seq.count - 1, Math.round(p * (seq.count - 1)));
      if (index !== drawn) {
        seq.focus(index);
        if (draw(index)) drawn = index;
      }
      if (intro.current) {
        const o = Math.max(0, 1 - p / 0.1);
        intro.current.style.opacity = String(o);
        intro.current.style.transform = `translateY(${(1 - o) * -24}px)`;
        intro.current.style.visibility = o < 0.02 ? "hidden" : "visible";
      }
      if (bar.current) bar.current.style.transform = `scaleY(${p})`;
      const z = p < 0.1 ? -1 : manifest.zones.findIndex((zn) => index >= zn.firstFrame && index <= zn.lastFrame);
      if (z !== lastZone) { lastZone = z; setZone(z); }
      if (current !== target) raf = requestAnimationFrame(tick);
      else running = false;
    };
    const kick = () => {
      if (!visible) return;
      target = progress();
      if (!raf) { running = true; raf = requestAnimationFrame(tick); }
    };

    seq.onFrameReady = (i) => {
      if (i === 0 && drawn === -1) { draw(0); }
      if (!running) { drawn = -1; kick(); }
    };
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); }, { rootMargin: "100px" });
    io.observe(section.current);
    resize();
    seq.start();
    target = current = progress();
    kick();
    window.addEventListener("scroll", kick, { passive: true });
    const onResize = () => { resize(); kick(); };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("scroll", kick);
      window.removeEventListener("resize", onResize);
      seq.dispose();
    };
  }, [manifest, reduced]);

  const zones = manifest?.zones ?? [];
  const staticMode = reduced || failed;

  return (
    <section ref={section} aria-label="AgriMind introduction"
      className="relative" style={{ height: staticMode ? "100svh" : "560vh" }}>
      <div className="sticky top-0 h-[100svh] overflow-hidden bg-forest-950">
        {staticMode || !manifest
          ? <img src="/assets/hero-frames/poster.webp" alt="" className="absolute inset-0 h-full w-full object-cover" />
          : (
            <>
              <img src={manifest.poster} alt="" className="absolute inset-0 h-full w-full object-cover" aria-hidden />
              <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-hidden />
            </>
          )}
        {/* readability overlays */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-forest-950/85 via-forest-950/35 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-forest-950/90 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-forest-950/70 to-transparent" />

        {/* intro copy */}
        <div ref={intro} className="absolute inset-0 flex items-center">
          <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
            <div className="max-w-xl">
              <p className="eyebrow mb-4">AI for Indian farms</p>
              <h1 className="text-[2.6rem] font-semibold leading-[1.05] sm:text-6xl">
                Grow Smarter.<br /><span className="text-neon drop-shadow-[0_0_24px_rgba(57,242,122,.35)]">Farm Better.</span>
              </h1>
              <p className="mt-5 max-w-md text-base text-ink/85 sm:text-lg">
                AI-powered insights for healthier crops, smarter irrigation and better farming decisions.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#features" className="btn-primary px-5 py-3 text-[15px]">Explore AgriMind<ArrowRight className="h-4 w-4" /></a>
                <Link to="/dashboard" className="btn-secondary px-5 py-3 text-[15px] backdrop-blur"><LayoutDashboard className="h-4 w-4" />Open Dashboard</Link>
              </div>
            </div>
          </div>
        </div>

        {/* zone captions */}
        {zones.map((z, i) => {
          const info = ZONE_INFO[z.id];
          if (!info) return null;
          const Icon = info.icon;
          const on = zone === i;
          return (
            <div key={z.id} aria-hidden={!on}
              className={`absolute bottom-24 left-0 right-0 px-5 transition-all duration-500 sm:bottom-auto sm:left-8 sm:right-auto sm:top-1/2 sm:-translate-y-1/2 sm:px-0
                ${on ? "opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}>
              <div className="glass-strong max-w-sm p-5">
                <p className="eyebrow mb-2">Explore the farm · {i + 1}/{zones.length}</p>
                <h2 className="flex items-center gap-2 text-xl font-semibold"><Icon className="h-5 w-5 text-neon" aria-hidden />{z.title}</h2>
                <p className="mt-2 text-sm text-ink-muted">{info.text}</p>
                <Link to={info.to} tabIndex={on ? 0 : -1} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-neon hover:underline">
                  Open {info.label}<ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          );
        })}

        {/* progress rail */}
        {!staticMode && zones.length > 0 && (
          <div className="glass absolute right-5 top-1/2 hidden -translate-y-1/2 items-center gap-3 rounded-xl px-4 py-3 md:flex" aria-hidden>
            <div className="relative h-48 w-px bg-white/15">
              <div ref={bar} className="absolute inset-x-0 top-0 h-full origin-top bg-neon shadow-[0_0_8px_#39F27A]" style={{ transform: "scaleY(0)" }} />
            </div>
            <ol className="flex h-48 flex-col justify-between text-[11px]">
              {zones.map((z, i) => (
                <li key={z.id} className={`transition ${zone === i ? "text-neon" : "text-ink/45"}`}>{z.title}</li>
              ))}
            </ol>
          </div>
        )}

        {!staticMode && (
          <div className={`absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 text-xs text-ink/70 transition-opacity ${zone === -1 ? "opacity-100" : "opacity-0"}`} aria-hidden>
            <span className="flex h-9 w-5 justify-center rounded-full border border-ink/40 pt-1.5"><span className="h-1.5 w-1 rounded-full bg-neon animate-scroll-dot" /></span>
            Scroll to explore the farm
            <ChevronDown className="h-3.5 w-3.5" />
          </div>
        )}
      </div>
    </section>
  );
}

import { useEffect, useId, useRef } from "react";

export type CharacterMood = "idle" | "hover" | "thinking" | "happy";

/**
 * The AgriMind farmer, redrawn as layered SVG from the reference illustration
 * (assets-src/assistant/agrimind-farmer-reference.png): straw hat, grey hair and beard,
 * headset with microphone, red-blue plaid shirt, denim overalls, wooden ring with vines,
 * a tablet and the green chat badge.
 *
 * The head turns toward the cursor and the pupils follow it inside the eyes. All motion runs in
 * one requestAnimationFrame loop that writes transforms to refs — no React re-render per move.
 */
export function AssistantCharacter({ size = 80, mood = "idle", reduced = false, decorative = true }: {
  size?: number; mood?: CharacterMood; reduced?: boolean; decorative?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const svg = useRef<SVGSVGElement>(null);
  const head = useRef<SVGGElement>(null);
  const pupils = useRef<SVGGElement[]>([]);
  const lids = useRef<SVGRectElement[]>([]);
  const kick = useRef<() => void>(() => {});
  const moodRef = useRef(mood);
  moodRef.current = mood;

  useEffect(() => {
    const root = svg.current;
    if (!root) return;
    let raf = 0, alive = true, visible = true;
    let lastMove = 0;
    let target = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
    let tapUntil = 0;

    const setLids = (closed: number) => lids.current.forEach((l) => l && (l.style.transform = `scaleY(${closed})`));

    // blinking (also in reduced motion, slowly)
    let blinkTimer = 0;
    const blink = () => {
      setLids(1);
      setTimeout(() => setLids(moodRef.current === "thinking" ? 0.45 : 0), moodRef.current === "thinking" ? 260 : 120);
      blinkTimer = window.setTimeout(blink, (reduced ? 6000 : 3000) + Math.random() * 3000);
    };
    blinkTimer = window.setTimeout(blink, 1500 + Math.random() * 2000);

    if (reduced) return () => { clearTimeout(blinkTimer); };

    const aimAt = (px: number, py: number) => {
      const r = root.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height * 0.45;
      const dx = px - cx, dy = py - cy;
      const dist = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, dist / 260);              // far cursor = full turn
      target = { x: (dx / dist) * reach, y: (dy / dist) * reach };
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      lastMove = performance.now();
      aimAt(e.clientX, e.clientY);
      start();
    };
    const onTap = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      tapUntil = performance.now() + 1600;
      lastMove = performance.now();
      aimAt(e.clientX, e.clientY);
      start();
    };

    const tick = () => {
      raf = 0;
      if (!alive || !visible || document.hidden) return;
      const now = performance.now();
      let t = target;
      const m = moodRef.current;
      if (m === "hover") t = { x: 0, y: 0.05 };
      else if (m === "thinking") t = { x: 0.15, y: -0.9 };
      else if (now - lastMove > 3000 || (tapUntil && now > tapUntil && now - lastMove > 1600)) t = { x: 0, y: 0 };
      cur.x += (t.x - cur.x) * 0.12;
      cur.y += (t.y - cur.y) * 0.12;
      if (head.current) {
        const rot = cur.x * 16;                             // ±16° turn
        head.current.style.transform = `translate(${cur.x * 3.2}px, ${cur.y * 2.4}px) rotate(${rot}deg)`;
      }
      pupils.current.forEach((p) => p && (p.style.transform = `translate(${cur.x * 2.4}px, ${cur.y * 1.7}px)`));
      const settling = Math.abs(t.x - cur.x) > 0.002 || Math.abs(t.y - cur.y) > 0.002;
      if (settling || now - lastMove < 3200) raf = requestAnimationFrame(tick);
    };
    const start = () => { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(tick); };

    kick.current = () => { lastMove = performance.now() - 2800; start(); };
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); });
    io.observe(root);
    const onVis = () => !document.hidden && start();
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onTap, { passive: true });
    document.addEventListener("visibilitychange", onVis);
    start();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(blinkTimer);
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onTap);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [reduced]);

  // mood changes that need a nudge of the loop
  useEffect(() => {
    if (mood === "thinking") lids.current.forEach((l) => l && (l.style.transform = "scaleY(.45)"));
    else lids.current.forEach((l) => l && (l.style.transform = "scaleY(0)"));
    kick.current();
  }, [mood]);

  const happy = mood === "hover" || mood === "happy";
  const p = (n: string) => `${uid}-${n}`;

  return (
    <svg ref={svg} viewBox="0 0 200 200" width={size} height={size} role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined} aria-label={decorative ? undefined : "AgriMind assistant, a friendly farmer"}
      className={`select-none overflow-visible ${!reduced ? "agri-float" : ""} ${mood === "happy" && !reduced ? "agri-bounce" : ""}`}>
      <defs>
        <radialGradient id={p("bg")} cx="50%" cy="40%" r="60%">
          <stop offset="0" stopColor="#F4FAF4" /><stop offset="1" stopColor="#D3E8D8" />
        </radialGradient>
        <linearGradient id={p("wood")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#B88A55" /><stop offset=".5" stopColor="#8A6034" /><stop offset="1" stopColor="#6E4A27" />
        </linearGradient>
        <pattern id={p("plaid")} width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(-4)">
          <rect width="16" height="16" fill="#C9472F" />
          <rect y="5" width="16" height="5" fill="#3B4C8A" opacity=".82" />
          <rect x="5" width="5" height="16" fill="#3B4C8A" opacity=".7" />
          <rect y="12.5" width="16" height=".7" fill="#E9B44C" opacity=".8" />
          <rect x="12.5" width=".7" height="16" fill="#E9B44C" opacity=".8" />
          <rect y="2" width="16" height=".5" fill="#1E2A55" opacity=".5" />
        </pattern>
        <linearGradient id={p("denim")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6683B4" /><stop offset="1" stopColor="#4A6496" />
        </linearGradient>
        <linearGradient id={p("straw")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E2C27E" /><stop offset="1" stopColor="#B98F4C" />
        </linearGradient>
        <radialGradient id={p("skin")} cx="45%" cy="40%" r="65%">
          <stop offset="0" stopColor="#F6C3A3" /><stop offset="1" stopColor="#E39C7C" />
        </radialGradient>
        <linearGradient id={p("beard")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E9E7E2" /><stop offset="1" stopColor="#BDB9B2" />
        </linearGradient>
        <radialGradient id={p("badge")} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#3FA36A" /><stop offset="1" stopColor="#1C5E40" />
        </radialGradient>
        <clipPath id={p("eyeL")}><ellipse cx="88" cy="93" rx="6.6" ry="5.6" /></clipPath>
        <clipPath id={p("eyeR")}><ellipse cx="112" cy="93" rx="6.6" ry="5.6" /></clipPath>
        <clipPath id={p("inside")}><circle cx="100" cy="106" r="84" /></clipPath>
      </defs>

      {/* ring frame with speech-bubble tail and vines */}
      <g id="frame">
        <path d="M44 166 L30 192 L66 178 Z" fill={`url(#${p("wood")})`} />
        <circle cx="100" cy="106" r="84" fill={`url(#${p("bg")})`} />
        <circle cx="100" cy="106" r="84" fill="none" stroke={`url(#${p("wood")})`} strokeWidth="5.5" />
        <circle cx="100" cy="106" r="80.5" fill="none" stroke="#4F7A2E" strokeWidth="1.4" opacity=".7" />
        <path d="M24 128 C14 96 22 66 40 46" fill="none" stroke="#5E8F35" strokeWidth="2.2" strokeLinecap="round" />
        <ellipse cx="22" cy="96" rx="9" ry="4.6" transform="rotate(-62 22 96)" fill="#7DBF4A" />
        <ellipse cx="30" cy="62" rx="8" ry="4.2" transform="rotate(-30 30 62)" fill="#8ACC55" />
        <ellipse cx="14" cy="122" rx="7" ry="3.8" transform="rotate(-100 14 122)" fill="#6FB343" />
        <path d="M168 140 C182 128 186 112 184 96" fill="none" stroke="#5E8F35" strokeWidth="2" strokeLinecap="round" />
        <ellipse cx="188" cy="118" rx="8" ry="4" transform="rotate(-70 188 118)" fill="#7DBF4A" />
        <path d="M150 30 C158 24 166 22 172 22" fill="none" stroke="#5E8F35" strokeWidth="1.8" strokeLinecap="round" />
        <ellipse cx="170" cy="18" rx="6.5" ry="3.4" transform="rotate(-20 170 18)" fill="#8ACC55" />
        <ellipse cx="160" cy="28" rx="5.5" ry="3" transform="rotate(30 160 28)" fill="#7DBF4A" />
      </g>

      {/* body: plaid shirt + denim overalls */}
      <g id="body" clipPath={`url(#${p("inside")})`}>
        <path d="M30 206 C32 170 56 150 84 145 L116 145 C144 150 168 170 170 206 Z" fill={`url(#${p("plaid")})`} />
        <path d="M30 206 C32 170 56 150 84 145 L90 150 C66 156 48 176 46 206 Z" fill="#000" opacity=".12" />
        <path d="M90 145 L100 160 L110 145 Z" fill="#F1ECE1" />
        <path d="M84 144 L100 160 L92 166 L80 150 Z" fill="#B23B27" />
        <path d="M116 144 L100 160 L108 166 L120 150 Z" fill="#B23B27" />
        <rect x="76" y="148" width="11" height="60" rx="3" fill={`url(#${p("denim")})`} transform="rotate(-6 81 178)" />
        <rect x="113" y="148" width="11" height="60" rx="3" fill={`url(#${p("denim")})`} transform="rotate(6 118 178)" />
        <path d="M74 180 H126 V210 H74 Z" fill={`url(#${p("denim")})`} />
        <path d="M86 186 H114 V200 H86 Z" fill="none" stroke="#C8A15A" strokeDasharray="2 2" strokeWidth=".8" />
        <rect x="74" y="174" width="10" height="7" rx="1.5" fill="#D6A447" stroke="#9C7426" strokeWidth=".8" />
        <rect x="116" y="174" width="10" height="7" rx="1.5" fill="#D6A447" stroke="#9C7426" strokeWidth=".8" />
        <circle cx="100" cy="166" r="1.6" fill="#7A3423" />
      </g>

      {/* head (turns toward the cursor) */}
      <g ref={head} id="head" style={{ transformOrigin: "100px 140px", transformBox: "view-box" } as React.CSSProperties}>
        {/* hair at the back/sides */}
        <path d="M68 78 C64 92 66 110 72 118 L78 112 C74 100 74 88 76 80 Z" fill="#CFCBC4" />
        <path d="M132 78 C136 92 134 110 128 118 L122 112 C126 100 126 88 124 80 Z" fill="#CFCBC4" />
        {/* face */}
        <ellipse cx="100" cy="98" rx="30" ry="33" fill={`url(#${p("skin")})`} />
        <path d="M80 76 Q100 70 120 76" fill="none" stroke="#C97C5E" strokeWidth=".8" opacity=".55" />
        <path d="M83 80 Q100 75 117 80" fill="none" stroke="#C97C5E" strokeWidth=".7" opacity=".45" />
        <path d="M77 95 l-3 -1.5 M77 98 l-3.5 0 M123 95 l3 -1.5 M123 98 l3.5 0" stroke="#C97C5E" strokeWidth=".7" opacity=".6" />
        <circle cx="83" cy="106" r="5.5" fill="#EE8E77" opacity=".35" />
        <circle cx="117" cy="106" r="5.5" fill="#EE8E77" opacity=".35" />

        {/* eyebrows */}
        <path d="M80 85 Q88 80 95 84" fill="none" stroke="#B9B4AC" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M105 84 Q112 80 120 85" fill="none" stroke="#B9B4AC" strokeWidth="3.2" strokeLinecap="round" />

        {/* eyes: white, pupil group (moves), eyelid (blinks) */}
        {([["L", 88], ["R", 112]] as const).map(([side, cx], i) => (
          <g key={side} clipPath={`url(#${p("eye" + side)})`}>
            <ellipse cx={cx} cy="93" rx="6.6" ry="5.6" fill="#FFFDF8" />
            <g ref={(el) => { if (el) pupils.current[i] = el; }}>
              <circle cx={cx} cy="93.4" r="3.9" fill="#6B4022" />
              <circle cx={cx} cy="93.4" r="2" fill="#20120A" />
              <circle cx={cx + 1.3} cy="92" r="1" fill="#fff" />
            </g>
            <rect ref={(el) => { if (el) lids.current[i] = el; }} x={cx - 8} y="86.5" width="16" height="13.5" fill="#EBA585"
              style={{ transformBox: "fill-box", transformOrigin: "top", transform: "scaleY(0)", transition: "transform 90ms ease-in" }} />
            <path d={`M${cx - 7} 89 Q${cx} 85.6 ${cx + 7} 89`} fill="none" stroke="#B9735A" strokeWidth=".9" />
          </g>
        ))}

        {/* nose */}
        <ellipse cx="100" cy="104" rx="6.5" ry="5.4" fill="#EC8E74" />
        <ellipse cx="98" cy="102.4" rx="2" ry="1.3" fill="#FBC1AA" opacity=".8" />

        {/* beard + mustache + mouth */}
        <path d="M71 103 C72 126 84 142 100 144 C116 142 128 126 129 103 C124 116 116 120 100 120 C84 120 76 116 71 103 Z" fill={`url(#${p("beard")})`} />
        <path d="M100 136 C96 141 98 146 100 147 C102 146 104 141 100 136 Z" fill="#CFCBC4" />
        {happy
          ? <path d="M90 115 Q100 125 110 115 Q100 119 90 115 Z" fill="#7A3423" stroke="#5A2416" strokeWidth=".6" />
          : <path d="M92 116 Q100 121 108 116" fill="none" stroke="#7A3423" strokeWidth="1.8" strokeLinecap="round" />}
        <path d="M84 113 C88 107 96 108 100 111 C104 108 112 107 116 113 C110 114 104 114 100 113 C96 114 90 114 84 113 Z" fill="#DAD6CF" stroke="#BDB9B2" strokeWidth=".5" />

        {/* headset: band, ear cups, microphone */}
        <path d="M70 92 C68 76 72 66 78 62" fill="none" stroke="#4B5660" strokeWidth="3" strokeLinecap="round" />
        <path d="M130 92 C132 76 128 66 122 62" fill="none" stroke="#4B5660" strokeWidth="3" strokeLinecap="round" />
        <rect x="62" y="88" width="12" height="22" rx="5" fill="#3E4851" />
        <rect x="64" y="90" width="5" height="18" rx="2.5" fill="#7FA3A0" opacity=".55" />
        <rect x="126" y="88" width="12" height="22" rx="5" fill="#3E4851" />
        <rect x="131" y="90" width="5" height="18" rx="2.5" fill="#7FA3A0" opacity=".55" />
        <path d="M130 106 C130 120 124 126 114 127" fill="none" stroke="#3E4851" strokeWidth="2.2" strokeLinecap="round" />
        <ellipse cx="112" cy="127.3" rx="3.6" ry="2.6" fill="#2D343B" />

        {/* straw hat */}
        <path d="M44 72 C52 58 148 58 156 72 C150 80 50 80 44 72 Z" fill={`url(#${p("straw")})`} stroke="#9C7637" strokeWidth=".8" />
        <path d="M72 66 C72 46 78 32 100 30 C122 32 128 46 128 66 C116 69 84 69 72 66 Z" fill={`url(#${p("straw")})`} stroke="#9C7637" strokeWidth=".8" />
        <path d="M86 36 Q100 41 114 36" fill="none" stroke="#A9823F" strokeWidth="1.4" />
        <path d="M73 58 C86 61 114 61 127 58 L127.5 65 C114 68 86 68 72.5 65 Z" fill="#7A4E2A" />
        <path d="M60 70 l3 4 M80 74 l2 3 M120 74 l-2 3 M140 70 l-3 4" stroke="#9C7637" strokeWidth=".8" />
        <path d="M130 30 C134 22 140 18 146 16" fill="none" stroke="#5E8F35" strokeWidth="1.5" strokeLinecap="round" />
        <ellipse cx="146" cy="14" rx="5" ry="2.6" transform="rotate(-25 146 14)" fill="#8ACC55" />
        <ellipse cx="138" cy="20" rx="4.4" ry="2.3" transform="rotate(30 138 20)" fill="#7DBF4A" />
      </g>

      {/* tablet and chat badge */}
      <g id="tablet" transform="rotate(-14 46 168)">
        <rect x="30" y="150" width="30" height="38" rx="4" fill="#3A434B" />
        <rect x="33" y="154" width="24" height="30" rx="2" fill="#BFE6F2" />
        <rect x="35" y="156" width="9" height="9" rx="2" fill="#F2B544" />
        <rect x="46" y="156" width="9" height="9" rx="2" fill="#5DB44A" />
        <rect x="35" y="167" width="9" height="9" rx="2" fill="#E07A3E" />
        <rect x="46" y="167" width="9" height="9" rx="2" fill="#4E8EDB" />
      </g>
      <g id="badge">
        <circle cx="160" cy="166" r="18" fill={`url(#${p("badge")})`} stroke="#0F3B27" strokeWidth="1" />
        <path d="M150 158 h20 a3 3 0 0 1 3 3 v9 a3 3 0 0 1 -3 3 h-12 l-5 4 v-4 h-3 a3 3 0 0 1 -3 -3 v-9 a3 3 0 0 1 3 -3 Z"
          fill="none" stroke="#7CF7A6" strokeWidth="2" style={{ filter: "drop-shadow(0 0 3px #39F27A)" }} />
        <circle cx="156" cy="165.5" r="1.8" fill="#7CF7A6" />
        <circle cx="164" cy="165.5" r="1.8" fill="#7CF7A6" />
      </g>
    </svg>
  );
}

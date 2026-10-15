export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#0B2B20" stroke="rgba(57,242,122,.35)" />
      <path d="M16 25.5c0-7 2.2-12 9.2-15-.9 8-4.2 12.2-9.2 15Z" fill="#39F27A" />
      <path d="M16 25.5c0-6-2-10.2-8.2-12.2 1 6 3.2 10.2 8.2 12.2Z" fill="#43D9D0" />
      <path d="M16 25.5V14" stroke="#F3F8F4" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ collapsed, tagline }: { collapsed?: boolean; tagline?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      {!collapsed && (
        <span className="leading-tight">
          <span className="block font-display text-lg font-semibold tracking-tight">Agri<span className="text-neon">Mind</span></span>
          {tagline && <span className="block text-[10px] uppercase tracking-[.16em] text-ink-faint">Grow smarter</span>}
        </span>
      )}
    </span>
  );
}

import { ArrowRight, Phone } from "lucide-react";

/**
 * CommercialPoster
 *
 * Cinematic, print-ad style brand band. Sits as a full-width plate between
 * the calculator heading row and the calculator content. Pure SVG artwork —
 * no asset uploads, no new dependencies. All colors come from semantic
 * design tokens defined in src/styles.css.
 */
export function CommercialPoster() {
  return (
    <section
      aria-label="Astromar Logistics — commercial"
      className="no-print group/poster relative isolate mb-4 overflow-hidden rounded-2xl border border-brand-navy/20 text-white shadow-[0_18px_40px_-22px_rgba(10,30,80,0.55)]"
      style={{
        background:
          "linear-gradient(125deg, var(--brand-navy-strong) 0%, var(--brand-navy) 55%, #0f2a5c 100%)",
      }}
    >
      {/* Halftone dotted texture — gives it a printed-poster feel */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.10]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.9) 1px, transparent 1.4px)",
          backgroundSize: "14px 14px",
        }}
      />

      {/* Soft warm glow anchored bottom-left */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-20 size-72 rounded-full opacity-60 blur-3xl"
        style={{ background: "var(--brand-orange)", filter: "blur(80px)" }}
      />

      {/* Port skyline silhouette — bottom-right, layered */}
      <svg
        aria-hidden
        viewBox="0 0 800 220"
        preserveAspectRatio="xMaxYMax slice"
        className="pointer-events-none absolute bottom-0 right-0 h-[55%] w-[70%] opacity-[0.55] transition-transform duration-[2200ms] ease-out group-hover/poster:translate-x-[-8px] motion-reduce:!transform-none"
      >
        {/* Water line */}
        <rect x="0" y="190" width="800" height="30" fill="rgba(255,255,255,0.04)" />

        {/* Distant ship */}
        <g opacity="0.55" fill="rgba(255,255,255,0.25)">
          <rect x="60" y="160" width="120" height="22" rx="3" />
          <rect x="80" y="146" width="80" height="14" />
          <rect x="92" y="134" width="56" height="12" />
          <rect x="170" y="158" width="6" height="24" />
        </g>

        {/* Foreground container ship + stacked containers */}
        <g fill="rgba(255,255,255,0.55)">
          <path d="M260 178 L760 178 L740 200 L280 200 Z" />
          {/* Stacked containers row 1 */}
          <rect x="290" y="148" width="44" height="30" />
          <rect x="338" y="148" width="44" height="30" />
          <rect x="386" y="148" width="44" height="30" />
          <rect x="434" y="148" width="44" height="30" />
          <rect x="482" y="148" width="44" height="30" />
          <rect x="530" y="148" width="44" height="30" />
          <rect x="578" y="148" width="44" height="30" />
          <rect x="626" y="148" width="44" height="30" />
          <rect x="674" y="148" width="44" height="30" />
          {/* Stacked containers row 2 */}
          <rect x="314" y="120" width="44" height="28" opacity="0.85" />
          <rect x="362" y="120" width="44" height="28" opacity="0.85" />
          <rect x="458" y="120" width="44" height="28" opacity="0.85" />
          <rect x="506" y="120" width="44" height="28" opacity="0.85" />
          <rect x="602" y="120" width="44" height="28" opacity="0.85" />
          <rect x="650" y="120" width="44" height="28" opacity="0.85" />
          {/* Bridge tower */}
          <rect x="700" y="92" width="36" height="56" />
          <rect x="708" y="76" width="20" height="16" />
        </g>

        {/* One accent container in brand orange */}
        <rect x="410" y="120" width="44" height="28" fill="var(--brand-orange)" opacity="0.85" />
        <rect x="554" y="148" width="44" height="30" fill="var(--brand-orange)" opacity="0.7" />

        {/* Port crane */}
        <g fill="rgba(255,255,255,0.6)" stroke="rgba(255,255,255,0.6)" strokeWidth="2">
          <line x1="220" y1="50" x2="220" y2="178" />
          <line x1="240" y1="50" x2="240" y2="178" />
          <line x1="220" y1="50" x2="240" y2="50" />
          <line x1="160" y1="50" x2="320" y2="50" />
          <line x1="180" y1="50" x2="220" y2="80" />
          <line x1="280" y1="50" x2="240" y2="80" />
          <rect x="240" y="50" width="6" height="40" />
          <rect x="234" y="88" width="20" height="8" />
        </g>
      </svg>

      {/* Diagonal orange slash — the bold graphic device */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 top-0 h-full w-[40%] origin-top-right rotate-[8deg] opacity-90 transition-transform duration-700 ease-out group-hover/poster:translate-x-[-6px] motion-reduce:!transform-none"
        style={{
          background:
            "linear-gradient(115deg, transparent 0%, transparent 35%, var(--brand-orange) 35%, var(--brand-orange) 42%, transparent 42%, transparent 60%, var(--brand-orange) 60%, var(--brand-orange) 62%, transparent 62%)",
          mixBlendMode: "screen",
        }}
      />

      {/* Content */}
      <div className="relative z-10 grid gap-5 p-5 sm:p-7 md:grid-cols-[1fr_auto] md:items-end md:gap-8 md:p-10">
        <div className="min-w-0">
          {/* Brand sign-off */}
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.32em] text-white/70">
            <span
              aria-hidden
              className="inline-block size-1.5 rounded-full"
              style={{ background: "var(--brand-orange)" }}
            />
            Astromar <span className="text-white/40">│</span> Logistics
          </div>

          {/* Hero claim */}
          <h2
            className="mt-3 font-black uppercase leading-[0.95] tracking-tight text-white"
            style={{ fontSize: "clamp(1.75rem, 5.6vw, 4.25rem)" }}
          >
            Move cargo
            <br className="hidden sm:block" />{" "}
            <span style={{ color: "var(--brand-orange)" }}>like you mean it.</span>
          </h2>

          {/* Sub-claim */}
          <p className="mt-3 max-w-xl text-sm text-white/75 sm:text-base">
            End-to-end freight, customs and FTWZ — out of Chennai. Ocean, air,
            landed-cost and container planning under one roof.
          </p>
        </div>

        {/* CTA stack */}
        <div className="flex flex-col items-stretch gap-2 md:items-end">
          <a
            href="mailto:sales@astromarfreezone.com?subject=Shipment%20Enquiry"
            className="inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-brand-navy-strong shadow-[0_10px_24px_-10px_rgba(255,127,42,0.85)] transition-transform hover:scale-[1.03] motion-reduce:hover:scale-100"
            style={{ background: "var(--brand-orange)" }}
          >
            Talk to Astromar
            <ArrowRight className="size-4" />
          </a>
          <a
            href="tel:+919940211014"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-white/30 px-5 py-2 text-xs font-semibold text-white/90 transition-colors hover:border-white hover:bg-white/10"
          >
            <Phone className="size-3.5" />
            +91 99402 11014
          </a>
        </div>
      </div>

      {/* Credibility strip */}
      <div className="relative z-10 border-t border-white/10 bg-black/15 px-5 py-2.5 sm:px-7 md:px-10">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60 sm:text-[11px]">
          <span>25+ Yrs</span>
          <span aria-hidden className="text-white/25">·</span>
          <span>50K+ TEU Moved</span>
          <span aria-hidden className="text-white/25">·</span>
          <span>FTWZ Licensed</span>
          <span aria-hidden className="text-white/25">·</span>
          <span>Chennai</span>
        </div>
      </div>
    </section>
  );
}

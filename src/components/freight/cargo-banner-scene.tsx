import { useEffect, useState } from "react";

/**
 * CargoBannerScene
 * A tiny self-contained CSS-3D scene of a shipping container in motion.
 * Drops into the inline promo banner where the static SVG icon used to live.
 * Pure CSS — no Three.js, no canvas, zero new deps.
 */
export function CargoBannerScene() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  return (
    <div
      aria-hidden
      className="cargo-scene pointer-events-none select-none"
      data-reduced={reduced ? "true" : "false"}
    >
      {/* motion trail dots drifting back */}
      <span className="cargo-trail cargo-trail--1" />
      <span className="cargo-trail cargo-trail--2" />
      <span className="cargo-trail cargo-trail--3" />

      {/* ground shadow */}
      <span className="cargo-shadow" />

      {/* secondary container in the back, half opacity, offset rotation */}
      <div className="cargo-stage cargo-stage--back">
        <div className="cargo-box cargo-box--back">
          <span className="cargo-face cargo-face--front" />
          <span className="cargo-face cargo-face--back" />
          <span className="cargo-face cargo-face--right" />
          <span className="cargo-face cargo-face--left" />
          <span className="cargo-face cargo-face--top" />
          <span className="cargo-face cargo-face--bottom" />
        </div>
      </div>

      {/* primary hero container */}
      <div className="cargo-stage cargo-stage--front">
        <div className="cargo-box cargo-box--front">
          <span className="cargo-face cargo-face--front">
            <span className="cargo-doors" />
          </span>
          <span className="cargo-face cargo-face--back" />
          <span className="cargo-face cargo-face--right">
            <span className="cargo-label">ASTROMAR</span>
          </span>
          <span className="cargo-face cargo-face--left">
            <span className="cargo-label">ASTROMAR</span>
          </span>
          <span className="cargo-face cargo-face--top" />
          <span className="cargo-face cargo-face--bottom" />
        </div>
      </div>

      <style>{`
        .cargo-scene {
          position: absolute;
          right: 0.75rem;
          top: 50%;
          transform: translateY(-50%);
          width: 110px;
          height: 80px;
          perspective: 600px;
          perspective-origin: 50% 45%;
          display: none;
        }
        @media (min-width: 768px) {
          .cargo-scene { display: block; }
        }

        .cargo-stage {
          position: absolute;
          inset: 0;
          transform-style: preserve-3d;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .cargo-stage--front { animation: cargo-float 4s ease-in-out infinite; }
        .cargo-stage--back {
          transform: translate3d(-22px, 6px, -40px) scale(0.65);
          opacity: 0.45;
          animation: cargo-float 5.5s ease-in-out infinite reverse;
        }

        .cargo-box {
          position: relative;
          width: 60px;
          height: 30px;
          transform-style: preserve-3d;
          --depth: 28px;
        }
        .cargo-box--front { animation: cargo-spin 12s linear infinite; }
        .cargo-box--back  { animation: cargo-spin 18s linear infinite reverse; }

        .cargo-face {
          position: absolute;
          display: block;
          background: var(--brand-orange, #ff7f2a);
          background-image:
            repeating-linear-gradient(
              90deg,
              rgba(0,0,0,0.18) 0 1px,
              transparent 1px 4px
            );
          box-shadow: inset 0 0 0 1px rgba(0,0,0,0.25);
        }
        /* container faces — box: 60w x 30h x 28 depth */
        .cargo-face--front {
          width: 60px; height: 30px;
          transform: translateZ(14px);
          background-image:
            repeating-linear-gradient(90deg, rgba(0,0,0,0.22) 0 1px, transparent 1px 5px);
        }
        .cargo-face--back {
          width: 60px; height: 30px;
          transform: rotateY(180deg) translateZ(14px);
          filter: brightness(0.8);
        }
        .cargo-face--right {
          width: 28px; height: 30px;
          left: 16px;
          transform: rotateY(90deg) translateZ(30px);
          filter: brightness(1.05);
        }
        .cargo-face--left {
          width: 28px; height: 30px;
          left: 16px;
          transform: rotateY(-90deg) translateZ(30px);
          filter: brightness(0.85);
        }
        .cargo-face--top {
          width: 60px; height: 28px;
          top: 1px;
          transform: rotateX(90deg) translateZ(14px);
          background: color-mix(in oklab, var(--brand-orange, #ff7f2a) 80%, white);
          background-image:
            repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0 1px, transparent 1px 6px);
        }
        .cargo-face--bottom {
          width: 60px; height: 28px;
          top: 1px;
          transform: rotateX(-90deg) translateZ(14px);
          filter: brightness(0.55);
        }

        /* door split lines on the front face */
        .cargo-doors {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(90deg, transparent 49%, rgba(0,0,0,0.45) 49%, rgba(0,0,0,0.45) 51%, transparent 51%),
            linear-gradient(0deg,  transparent 8%,  rgba(0,0,0,0.3) 8%,  rgba(0,0,0,0.3) 9%,  transparent 9%,
                                   transparent 91%, rgba(0,0,0,0.3) 91%, rgba(0,0,0,0.3) 92%, transparent 92%);
        }

        /* side panel ASTROMAR text */
        .cargo-label {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 5px;
          font-weight: 800;
          letter-spacing: 0.12em;
          color: rgba(255,255,255,0.92);
          text-shadow: 0 1px 0 rgba(0,0,0,0.35);
          font-family: ui-sans-serif, system-ui, sans-serif;
        }

        /* ground shadow */
        .cargo-shadow {
          position: absolute;
          left: 50%;
          bottom: 6px;
          width: 64px;
          height: 8px;
          transform: translateX(-50%);
          background: radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 70%);
          filter: blur(2px);
          animation: cargo-shadow 4s ease-in-out infinite;
        }

        /* motion trail */
        .cargo-trail {
          position: absolute;
          top: 50%;
          right: -6px;
          width: 4px;
          height: 4px;
          border-radius: 9999px;
          background: var(--brand-orange, #ff7f2a);
          box-shadow: 0 0 6px rgba(255,127,42,0.7);
          opacity: 0;
          animation: cargo-trail 3s linear infinite;
        }
        .cargo-trail--1 { animation-delay: 0s;   top: 30%; }
        .cargo-trail--2 { animation-delay: 1s;   top: 55%; }
        .cargo-trail--3 { animation-delay: 2s;   top: 70%; }

        @keyframes cargo-spin {
          from { transform: rotateX(-12deg) rotateY(0deg); }
          to   { transform: rotateX(-12deg) rotateY(360deg); }
        }
        @keyframes cargo-float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-3px); }
        }
        .cargo-stage--back {
          /* keep base translate when floating */
          animation-name: cargo-float-back;
        }
        @keyframes cargo-float-back {
          0%, 100% { transform: translate3d(-22px, 6px, -40px) scale(0.65); }
          50%      { transform: translate3d(-22px, 2px, -40px) scale(0.65); }
        }
        @keyframes cargo-shadow {
          0%, 100% { transform: translateX(-50%) scale(1, 1);   opacity: 0.55; }
          50%      { transform: translateX(-50%) scale(0.85, 1); opacity: 0.4; }
        }
        @keyframes cargo-trail {
          0%   { transform: translateX(0)     scale(1);   opacity: 0; }
          15%  { opacity: 0.9; }
          100% { transform: translateX(-110px) scale(0.4); opacity: 0; }
        }

        /* reduced motion: hold a nice 3/4 hero pose, kill all keyframes */
        .cargo-scene[data-reduced="true"] .cargo-box--front,
        .cargo-scene[data-reduced="true"] .cargo-box--back,
        .cargo-scene[data-reduced="true"] .cargo-stage--front,
        .cargo-scene[data-reduced="true"] .cargo-stage--back,
        .cargo-scene[data-reduced="true"] .cargo-shadow,
        .cargo-scene[data-reduced="true"] .cargo-trail {
          animation: none !important;
        }
        .cargo-scene[data-reduced="true"] .cargo-box--front {
          transform: rotateX(-15deg) rotateY(-28deg);
        }
        .cargo-scene[data-reduced="true"] .cargo-box--back {
          transform: rotateX(-15deg) rotateY(-28deg);
        }
        .cargo-scene[data-reduced="true"] .cargo-trail { display: none; }
      `}</style>
    </div>
  );
}

export default CargoBannerScene;

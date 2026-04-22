import { useEffect, useState } from "react";

/**
 * CargoBannerScene
 * A tiny CSS-3D shipping container that drives across the right half of the
 * banner (entering after the "...plan" text), past the View plan button, and
 * exits at the far right. Wheels spin, body bobs, headlight glows, exhaust
 * puffs trail behind, dashed road moves underneath.
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
      {/* dashed road moving underneath */}
      <span className="cargo-road" />
      {/* speed streaks */}
      <span className="cargo-speed cargo-speed--1" />
      <span className="cargo-speed cargo-speed--2" />
      <span className="cargo-speed cargo-speed--3" />

      {/* the truck */}
      <div className="cargo-truck">
        {/* exhaust puffs (behind the truck, from stack) */}
        <span className="cargo-puff cargo-puff--1" />
        <span className="cargo-puff cargo-puff--2" />
        <span className="cargo-puff cargo-puff--3" />

        <div className="cargo-bob">
          {/* 3D container body (trailer) */}
          <div className="cargo-box">
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

          {/* trailer wheels */}
          <span className="cargo-wheel cargo-wheel--rear" />
          <span className="cargo-wheel cargo-wheel--mid" />

          {/* truck cab (tractor unit) in front of trailer */}
          <div className="cargo-cab">
            <span className="cargo-cab-body" />
            <span className="cargo-cab-roof" />
            <span className="cargo-cab-window" />
            <span className="cargo-cab-grille" />
            <span className="cargo-cab-bumper" />
            <span className="cargo-stack" />
            <span className="cargo-headlight cargo-headlight--lo" />
            <span className="cargo-headlight cargo-headlight--hi" />
          </div>

          {/* cab wheels */}
          <span className="cargo-wheel cargo-wheel--cab-rear" />
          <span className="cargo-wheel cargo-wheel--cab-front" />
        </div>

        {/* ground shadow */}
        <span className="cargo-shadow" />
      </div>

      <style>{`
        .cargo-scene {
          position: absolute;
          /* lane begins ~1cm (≈38px) after the "...plan" text */
          left: calc(55% + 38px);
          right: 0;
          top: 0;
          bottom: 0;
          perspective: 800px;
          perspective-origin: 50% 55%;
          overflow: hidden;
          display: none;
          z-index: 1;
          opacity: 0.9;
        }
        @media (min-width: 768px) {
          .cargo-scene { display: block; }
        }

        /* dashed road moving right-to-left under the truck */
        .cargo-road {
          position: absolute;
          left: 0; right: 0;
          bottom: 7px;
          height: 1px;
          background-image: linear-gradient(
            90deg,
            rgba(255,255,255,0.35) 0 8px,
            transparent 8px 16px
          );
          background-size: 16px 1px;
          background-repeat: repeat-x;
          animation: cargo-road 0.9s linear infinite;
          opacity: 0.6;
        }

        /* speed streaks */
        .cargo-speed {
          position: absolute;
          height: 1px;
          width: 22px;
          background: linear-gradient(90deg, transparent, rgba(255,127,42,0.9));
          opacity: 0;
          animation: cargo-speed 2.6s linear infinite;
        }
        .cargo-speed--1 { top: 18%; animation-delay: 0s;    }
        .cargo-speed--2 { top: 42%; animation-delay: 0.9s;  width: 28px; }
        .cargo-speed--3 { top: 64%; animation-delay: 1.7s;  width: 16px; }

        /* the whole truck */
        .cargo-truck {
          position: absolute;
          left: -120px;
          top: 50%;
          transform: translateY(-50%);
          width: 84px;
          height: 40px;
          animation: cargo-drive 9s linear infinite;
          will-change: transform;
        }

        /* gentle vertical bob */
        .cargo-bob {
          position: absolute;
          inset: 0;
          transform-style: preserve-3d;
          animation: cargo-bob 0.65s ease-in-out infinite;
        }

        /* headlight glow at the front of the container */
        .cargo-headlight {
          position: absolute;
          top: 50%;
          right: -14px;
          width: 36px;
          height: 14px;
          transform: translateY(-50%);
          background: radial-gradient(
            ellipse at left center,
            rgba(255, 220, 140, 0.85) 0%,
            rgba(255, 200, 100, 0.35) 35%,
            transparent 70%
          );
          filter: blur(1px);
          animation: cargo-headlight 1.4s ease-in-out infinite;
        }

        /* exhaust puffs behind */
        .cargo-puff {
          position: absolute;
          bottom: 8px;
          left: -2px;
          width: 8px;
          height: 8px;
          border-radius: 9999px;
          background: rgba(255,255,255,0.55);
          filter: blur(2px);
          opacity: 0;
          animation: cargo-puff 2.2s ease-out infinite;
        }
        .cargo-puff--1 { animation-delay: 0s;   }
        .cargo-puff--2 { animation-delay: 0.7s; }
        .cargo-puff--3 { animation-delay: 1.4s; }

        /* 3D container body — scaled ~30% larger */
        .cargo-box {
          position: absolute;
          top: 0;
          left: 6px;
          width: 72px;
          height: 32px;
          transform-style: preserve-3d;
          transform: rotateX(-10deg) rotateY(-22deg);
        }
        .cargo-face {
          position: absolute;
          display: block;
          background: var(--brand-orange, #ff7f2a);
          background-image: repeating-linear-gradient(
            90deg,
            rgba(0,0,0,0.22) 0 1px,
            transparent 1px 6px
          );
          box-shadow: inset 0 0 0 1px rgba(0,0,0,0.3);
        }
        .cargo-face--front {
          width: 72px; height: 32px;
          transform: translateZ(13px);
        }
        .cargo-face--back {
          width: 72px; height: 32px;
          transform: rotateY(180deg) translateZ(13px);
          filter: brightness(0.78);
        }
        .cargo-face--right {
          width: 26px; height: 32px;
          left: 23px;
          transform: rotateY(90deg) translateZ(36px);
          filter: brightness(1.05);
        }
        .cargo-face--left {
          width: 26px; height: 32px;
          left: 23px;
          transform: rotateY(-90deg) translateZ(36px);
          filter: brightness(0.85);
        }
        .cargo-face--top {
          width: 72px; height: 26px;
          top: 3px;
          transform: rotateX(90deg) translateZ(13px);
          background: color-mix(in oklab, var(--brand-orange, #ff7f2a) 80%, white);
          background-image: repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0 1px, transparent 1px 6px);
        }
        .cargo-face--bottom {
          width: 72px; height: 26px;
          top: 3px;
          transform: rotateX(-90deg) translateZ(13px);
          filter: brightness(0.5);
        }
        .cargo-doors {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(90deg, transparent 49%, rgba(0,0,0,0.5) 49%, rgba(0,0,0,0.5) 51%, transparent 51%);
        }
        .cargo-label {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 6px;
          font-weight: 800;
          letter-spacing: 0.14em;
          color: rgba(255,255,255,0.95);
          text-shadow: 0 1px 0 rgba(0,0,0,0.4);
          font-family: ui-sans-serif, system-ui, sans-serif;
        }

        /* wheels */
        .cargo-wheel {
          position: absolute;
          bottom: -2px;
          width: 11px;
          height: 11px;
          border-radius: 9999px;
          background: #111;
          box-shadow:
            inset 0 0 0 1.5px #2a2a2a,
            inset 0 0 0 3px #111;
          animation: cargo-wheel 0.6s linear infinite;
        }
        .cargo-wheel::after {
          content: "";
          position: absolute;
          inset: 35%;
          background: #555;
          border-radius: 9999px;
        }
        .cargo-wheel--rear  { left: 16px; }
        .cargo-wheel--front { left: 56px; }

        /* ground shadow */
        .cargo-shadow {
          position: absolute;
          left: 50%;
          bottom: -5px;
          width: 78px;
          height: 6px;
          transform: translateX(-50%);
          background: radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 70%);
          filter: blur(2px);
          animation: cargo-shadow 0.65s ease-in-out infinite;
        }

        @keyframes cargo-drive {
          0%   { transform: translateX(0); }
          100% { transform: translateX(calc(100% + 200px)); }
        }
        @keyframes cargo-bob {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-1.5px); }
        }
        @keyframes cargo-wheel {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes cargo-shadow {
          0%, 100% { transform: translateX(-50%) scaleX(1);    opacity: 0.55; }
          50%      { transform: translateX(-50%) scaleX(0.92); opacity: 0.4; }
        }
        @keyframes cargo-speed {
          0%   { transform: translateX(100%); opacity: 0; }
          15%  { opacity: 0.85; }
          100% { transform: translateX(-60px); opacity: 0; }
        }
        @keyframes cargo-road {
          from { background-position: 0 0; }
          to   { background-position: -32px 0; }
        }
        @keyframes cargo-headlight {
          0%, 100% { opacity: 0.9; }
          50%      { opacity: 0.65; }
        }
        @keyframes cargo-puff {
          0%   { transform: translate(0, 0) scale(0.6); opacity: 0; }
          15%  { opacity: 0.7; }
          100% { transform: translate(-30px, -10px) scale(1.6); opacity: 0; }
        }

        /* reduced motion: park truck in middle, kill animations */
        .cargo-scene[data-reduced="true"] .cargo-truck,
        .cargo-scene[data-reduced="true"] .cargo-bob,
        .cargo-scene[data-reduced="true"] .cargo-wheel,
        .cargo-scene[data-reduced="true"] .cargo-shadow,
        .cargo-scene[data-reduced="true"] .cargo-speed,
        .cargo-scene[data-reduced="true"] .cargo-road,
        .cargo-scene[data-reduced="true"] .cargo-headlight,
        .cargo-scene[data-reduced="true"] .cargo-puff {
          animation: none !important;
        }
        .cargo-scene[data-reduced="true"] .cargo-truck {
          transform: translateX(120px);
        }
        .cargo-scene[data-reduced="true"] .cargo-speed,
        .cargo-scene[data-reduced="true"] .cargo-puff { display: none; }
      `}</style>
    </div>
  );
}

export default CargoBannerScene;

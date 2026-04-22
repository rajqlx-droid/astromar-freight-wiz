import { useEffect, useState } from "react";

/**
 * CargoBannerScene
 * A tiny CSS-3D shipping container that physically drives across the banner,
 * left → right, then loops. Wheels spin, body bobs, ground shadow tracks it.
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
      {/* road / ground line */}
      <span className="cargo-road" />
      {/* speed lines */}
      <span className="cargo-speed cargo-speed--1" />
      <span className="cargo-speed cargo-speed--2" />
      <span className="cargo-speed cargo-speed--3" />

      {/* the truck travels across */}
      <div className="cargo-truck">
        <div className="cargo-bob">
          {/* 3D container body */}
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
          {/* wheels */}
          <span className="cargo-wheel cargo-wheel--rear" />
          <span className="cargo-wheel cargo-wheel--front" />
        </div>
        {/* ground shadow that travels with the truck */}
        <span className="cargo-shadow" />
      </div>

      <style>{`
        .cargo-scene {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 30px;
          perspective: 700px;
          perspective-origin: 50% 60%;
          overflow: hidden;
          display: none;
          z-index: 1;
          opacity: 0.55;
        }
        @media (min-width: 768px) {
          .cargo-scene { display: block; }
        }

        /* faint road line at the bottom */
        .cargo-road {
          position: absolute;
          left: 0; right: 0;
          bottom: 10px;
          height: 1px;
          background: linear-gradient(
            90deg,
            transparent 0,
            rgba(255,255,255,0.18) 20%,
            rgba(255,255,255,0.18) 80%,
            transparent 100%
          );
        }

        /* speed streaks blowing past behind the truck */
        .cargo-speed {
          position: absolute;
          height: 1px;
          width: 18px;
          background: linear-gradient(90deg, transparent, rgba(255,127,42,0.85));
          opacity: 0;
          animation: cargo-speed 1.6s linear infinite;
        }
        .cargo-speed--1 { top: 22%; animation-delay: 0s;    }
        .cargo-speed--2 { top: 48%; animation-delay: 0.55s; width: 24px; }
        .cargo-speed--3 { top: 70%; animation-delay: 1.1s;  width: 14px; }

        /* the whole truck moves across the scene */
        .cargo-truck {
          position: absolute;
          left: -80px;
          bottom: -2px;
          width: 64px;
          height: 30px;
          animation: cargo-drive 7s linear infinite;
          will-change: transform;
        }

        /* gentle vertical bob on top of the horizontal drive */
        .cargo-bob {
          position: absolute;
          inset: 0;
          transform-style: preserve-3d;
          animation: cargo-bob 0.6s ease-in-out infinite;
        }

        /* 3D container body — sits on top of the wheels */
        .cargo-box {
          position: absolute;
          top: 0;
          left: 4px;
          width: 56px;
          height: 28px;
          transform-style: preserve-3d;
          /* slight 3/4 perspective so we read it as a real box */
          transform: rotateX(-10deg) rotateY(-22deg);
        }
        .cargo-face {
          position: absolute;
          display: block;
          background: var(--brand-orange, #ff7f2a);
          background-image: repeating-linear-gradient(
            90deg,
            rgba(0,0,0,0.22) 0 1px,
            transparent 1px 5px
          );
          box-shadow: inset 0 0 0 1px rgba(0,0,0,0.3);
        }
        .cargo-face--front {
          width: 56px; height: 28px;
          transform: translateZ(11px);
        }
        .cargo-face--back {
          width: 56px; height: 28px;
          transform: rotateY(180deg) translateZ(11px);
          filter: brightness(0.78);
        }
        .cargo-face--right {
          width: 22px; height: 28px;
          left: 17px;
          transform: rotateY(90deg) translateZ(28px);
          filter: brightness(1.05);
        }
        .cargo-face--left {
          width: 22px; height: 28px;
          left: 17px;
          transform: rotateY(-90deg) translateZ(28px);
          filter: brightness(0.85);
        }
        .cargo-face--top {
          width: 56px; height: 22px;
          top: 3px;
          transform: rotateX(90deg) translateZ(11px);
          background: color-mix(in oklab, var(--brand-orange, #ff7f2a) 80%, white);
          background-image: repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0 1px, transparent 1px 6px);
        }
        .cargo-face--bottom {
          width: 56px; height: 22px;
          top: 3px;
          transform: rotateX(-90deg) translateZ(11px);
          filter: brightness(0.5);
        }

        /* door split lines on front face */
        .cargo-doors {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(90deg, transparent 49%, rgba(0,0,0,0.5) 49%, rgba(0,0,0,0.5) 51%, transparent 51%);
        }

        /* ASTROMAR side label */
        .cargo-label {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 5px;
          font-weight: 800;
          letter-spacing: 0.14em;
          color: rgba(255,255,255,0.95);
          text-shadow: 0 1px 0 rgba(0,0,0,0.4);
          font-family: ui-sans-serif, system-ui, sans-serif;
        }

        /* wheels */
        .cargo-wheel {
          position: absolute;
          bottom: 0;
          width: 9px;
          height: 9px;
          border-radius: 9999px;
          background: #111;
          box-shadow:
            inset 0 0 0 1.5px #2a2a2a,
            inset 0 0 0 3px #111;
          animation: cargo-wheel 0.45s linear infinite;
        }
        .cargo-wheel::after {
          content: "";
          position: absolute;
          inset: 35%;
          background: #555;
          border-radius: 9999px;
        }
        .cargo-wheel--rear  { left: 10px; }
        .cargo-wheel--front { left: 44px; }

        /* ground shadow under the truck */
        .cargo-shadow {
          position: absolute;
          left: 50%;
          bottom: -3px;
          width: 64px;
          height: 6px;
          transform: translateX(-50%);
          background: radial-gradient(ellipse at center, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 70%);
          filter: blur(2px);
          animation: cargo-shadow 0.6s ease-in-out infinite;
        }

        @keyframes cargo-drive {
          0%   { transform: translateX(0); }
          100% { transform: translateX(calc(100vw + 160px)); }
        }
        @keyframes cargo-bob {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-1.5px); }
        }
        @keyframes cargo-wheel {
          from { box-shadow: inset 0 0 0 1.5px #2a2a2a, inset 0 0 0 3px #111; transform: rotate(0deg); }
          to   { box-shadow: inset 0 0 0 1.5px #2a2a2a, inset 0 0 0 3px #111; transform: rotate(360deg); }
        }
        @keyframes cargo-shadow {
          0%, 100% { transform: translateX(-50%) scaleX(1);    opacity: 0.55; }
          50%      { transform: translateX(-50%) scaleX(0.92); opacity: 0.4; }
        }
        @keyframes cargo-speed {
          0%   { transform: translateX(190px); opacity: 0; }
          15%  { opacity: 0.9; }
          100% { transform: translateX(-40px); opacity: 0; }
        }

        /* reduced motion: park the truck centered, kill animations */
        .cargo-scene[data-reduced="true"] .cargo-truck,
        .cargo-scene[data-reduced="true"] .cargo-bob,
        .cargo-scene[data-reduced="true"] .cargo-wheel,
        .cargo-scene[data-reduced="true"] .cargo-shadow,
        .cargo-scene[data-reduced="true"] .cargo-speed {
          animation: none !important;
        }
        .cargo-scene[data-reduced="true"] .cargo-truck {
          transform: translateX(60px);
        }
        .cargo-scene[data-reduced="true"] .cargo-speed { display: none; }
      `}</style>
    </div>
  );
}

export default CargoBannerScene;

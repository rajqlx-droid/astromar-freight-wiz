import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Sequence,
  Series,
} from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadBody } from "@remotion/google-fonts/Inter";

import { ContainerScene } from "./ContainerScene";
import { CAM_PRESETS, lerpCam, type Camera } from "./projection";
import type { Scenario, Row } from "./scenario-demo";
import { buildDemoScenario } from "./scenario-demo";

const { fontFamily: DISPLAY } = loadDisplay("normal", {
  weights: ["500", "700"],
  subsets: ["latin"],
});
const { fontFamily: BODY } = loadBody("normal", {
  weights: ["400", "500", "600"],
  subsets: ["latin"],
});

const BG = "#0f172a";
const TEXT = "#f5f5f4";
const MUTED = "rgba(245,245,244,0.65)";
const ACCENT = "#14b8a6";
const AMBER = "#f59e0b";
const RED = "#ef4444";

/* ──────────────────────────────────────────────────────────
 * Timing — extended 40s @ 30fps = 1200 frames
 * Intro 120 + Rules 90 + Rows N×150 + COG 90 + Dunnage 60 + Door 75 + Outro 45
 * For demo (5 rows): 120 + 90 + 750 + 90 + 60 + 75 + 45 = 1230 frames ≈ 41s
 * ────────────────────────────────────────────────────────── */
export const INTRO_DUR = 120;
export const RULES_DUR = 90;
export const ROW_DUR = 150;
export const COG_DUR = 90;
export const DUNNAGE_DUR = 60;
export const DOOR_DUR = 75;
export const OUTRO_DUR = 45;

export function totalFrames(rowCount: number): number {
  return INTRO_DUR + RULES_DUR + rowCount * ROW_DUR + COG_DUR + DUNNAGE_DUR + DOOR_DUR + OUTRO_DUR;
}

/** Default scenario used when no props are provided (e.g. Studio preview). */
const DEFAULT_SCENARIO = buildDemoScenario();

export interface LoadingGuideProps {
  scenario?: Scenario;
}

/* ──────────────────────────────────────────────────────────
 * Scene 1: Intro (0–4s = 120 frames) — orbit empty container
 * ────────────────────────────────────────────────────────── */
const IntroScene: React.FC<{ scenario: Scenario }> = ({ scenario }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // 360° orbit (slower over 120f)
  const yaw = -0.55 + interpolate(frame, [0, INTRO_DUR], [0, Math.PI * 2]);
  const cam: Camera = { ...CAM_PRESETS.iso, yaw, scale: 0.13 };

  const titleProg = spring({ frame, fps, config: { damping: 20, stiffness: 120 } });
  const titleY = interpolate(titleProg, [0, 1], [40, 0]);
  const titleOp = titleProg;

  // Dimension call-outs at frame 50+
  const dimsP = spring({ frame: frame - 50, fps, config: { damping: 22 } });

  return (
    <AbsoluteFill style={{ background: BG }}>
      <ContainerScene cam={cam} container={scenario.container} visibleBoxes={[]} doorClose={0} />
      <div
        style={{
          position: "absolute",
          left: 100,
          top: 90,
          color: TEXT,
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontSize: 72,
          letterSpacing: -1,
          opacity: titleOp,
          transform: `translateY(${titleY}px)`,
          lineHeight: 1.05,
        }}
      >
        How to load
        <br />
        your container
      </div>
      <div
        style={{
          position: "absolute",
          left: 100,
          top: 290,
          color: ACCENT,
          fontFamily: BODY,
          fontWeight: 600,
          fontSize: 22,
          letterSpacing: 4,
          opacity: titleOp,
          textTransform: "uppercase",
        }}
      >
        Step-by-step · Row by row · 3D
      </div>
      {/* Dimension chips */}
      <div
        style={{
          position: "absolute",
          right: 100,
          top: 110,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          opacity: dimsP,
          transform: `translateX(${(1 - dimsP) * 30}px)`,
        }}
      >
        <DimChip label="L" value={`${scenario.container.inner.l} mm`} />
        <DimChip label="W" value={`${scenario.container.inner.w} mm`} />
        <DimChip label="H" value={`${scenario.container.inner.h} mm`} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 100,
          bottom: 90,
          color: MUTED,
          fontFamily: BODY,
          fontSize: 24,
          fontWeight: 500,
          display: "flex",
          gap: 40,
          opacity: titleOp,
        }}
      >
        <Stat label="Container" value={scenario.container.name} />
        <Stat label="Cartons" value={`${scenario.totalCartons}`} />
        <Stat label="Volume" value={`${scenario.totalCbm.toFixed(2)} m³`} />
        <Stat label="Weight" value={`${scenario.totalWeightKg} kg`} />
      </div>
    </AbsoluteFill>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div
      style={{
        fontSize: 13,
        textTransform: "uppercase",
        letterSpacing: 2,
        color: MUTED,
      }}
    >
      {label}
    </div>
    <div style={{ color: TEXT, fontFamily: DISPLAY, fontSize: 32, fontWeight: 500 }}>
      {value}
    </div>
  </div>
);

const DimChip: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      background: "rgba(20,184,166,0.12)",
      border: "1px solid rgba(20,184,166,0.5)",
      padding: "8px 18px",
      borderRadius: 999,
    }}
  >
    <span style={{ color: ACCENT, fontFamily: DISPLAY, fontWeight: 700, fontSize: 22 }}>
      {label}
    </span>
    <span style={{ color: TEXT, fontFamily: BODY, fontWeight: 600, fontSize: 18 }}>
      {value}
    </span>
  </div>
);

/* ──────────────────────────────────────────────────────────
 * Scene 2: Rules recap (90 frames)
 * ────────────────────────────────────────────────────────── */
const RULES = [
  { icon: "↓", title: "Heavy at bottom", body: "Stack heaviest pallets on the floor first." },
  { icon: "▣", title: "Back wall first", body: "Build full-height columns from the back." },
  { icon: "✦", title: "Fragile near door", body: "Cap the load — fragile rides last." },
  { icon: "✕", title: "No-stack stays floor", body: "Never stack on items marked no-stack." },
];

const RulesScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const headerOp = spring({ frame, fps, config: { damping: 22 } });

  return (
    <AbsoluteFill style={{ background: BG, padding: "100px 120px" }}>
      <div
        style={{
          color: ACCENT,
          fontFamily: BODY,
          fontWeight: 600,
          fontSize: 18,
          letterSpacing: 4,
          textTransform: "uppercase",
          opacity: headerOp,
        }}
      >
        The four rules
      </div>
      <div
        style={{
          color: TEXT,
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontSize: 64,
          letterSpacing: -1,
          marginTop: 12,
          opacity: headerOp,
          transform: `translateY(${(1 - headerOp) * 30}px)`,
        }}
      >
        Match these in the trailer.
      </div>
      <div
        style={{
          marginTop: 90,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 36,
        }}
      >
        {RULES.map((r, i) => {
          const delay = 12 + i * 6;
          const p = spring({
            frame: frame - delay,
            fps,
            config: { damping: 18, stiffness: 180 },
          });
          return (
            <div
              key={r.title}
              style={{
                opacity: p,
                transform: `translateY(${(1 - p) * 24}px)`,
                background: "rgba(245,245,244,0.04)",
                border: "1px solid rgba(245,245,244,0.08)",
                borderRadius: 18,
                padding: "32px 36px",
                display: "flex",
                gap: 26,
                alignItems: "center",
              }}
            >
              <div
                style={{
                  width: 78,
                  height: 78,
                  borderRadius: 14,
                  background: i === 2 ? AMBER : i === 3 ? RED : ACCENT,
                  color: BG,
                  fontFamily: DISPLAY,
                  fontWeight: 700,
                  fontSize: 44,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {r.icon}
              </div>
              <div>
                <div
                  style={{
                    color: TEXT,
                    fontFamily: DISPLAY,
                    fontSize: 32,
                    fontWeight: 500,
                  }}
                >
                  {r.title}
                </div>
                <div
                  style={{
                    color: MUTED,
                    fontFamily: BODY,
                    fontSize: 20,
                    marginTop: 4,
                  }}
                >
                  {r.body}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* ──────────────────────────────────────────────────────────
 * Scene 3: Row-by-row loading (N rows × 150 frames each)
 * Phases: 0..0.25 iso→side, 0.25..0.50 side→top, 0.50..0.73 top→iso,
 *         0.73..1.0 → 360° micro-orbit around iso
 * ────────────────────────────────────────────────────────── */

const RowScene: React.FC<{ scenario: Scenario; rowIdx: number }> = ({ scenario, rowIdx }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ROWS = scenario.rows;
  const row = ROWS[rowIdx];
  const totalRows = ROWS.length;

  // Camera arc per row
  const phase = frame / ROW_DUR;
  let cam: Camera;
  if (phase < 0.25) {
    const t = phase / 0.25;
    cam = lerpCam(CAM_PRESETS.iso, CAM_PRESETS.side, t);
  } else if (phase < 0.5) {
    const t = (phase - 0.25) / 0.25;
    cam = lerpCam(CAM_PRESETS.side, CAM_PRESETS.top, t);
  } else if (phase < 0.73) {
    const t = (phase - 0.5) / 0.23;
    cam = lerpCam(CAM_PRESETS.top, CAM_PRESETS.iso, t);
  } else {
    // 360° micro-orbit in last 27% of scene
    const t = (phase - 0.73) / 0.27;
    const orbitYaw = CAM_PRESETS.iso.yaw + t * Math.PI * 2;
    cam = { ...CAM_PRESETS.iso, yaw: orbitYaw };
  }
  // Subtle yaw drift in non-orbit phases
  if (phase < 0.73) {
    cam = { ...cam, yaw: cam.yaw + Math.sin(phase * Math.PI * 2) * 0.05 };
  }

  // Visible boxes = all rows up to & including this one
  const previousBoxes = ROWS.slice(0, rowIdx).flatMap((r) => r.boxes);
  const currentBoxes = row.boxes;
  // Sort current row by z so bottom layer drops first
  const sortedCurrent = [...currentBoxes]
    .map((b, idx) => ({ b, idx }))
    .sort((a, b) => a.b.z - b.b.z || a.idx - b.idx);

  // Per-box entrance progress
  const boxProgress = new Map<number, number>();
  previousBoxes.forEach((_, i) => boxProgress.set(i, 1));
  const startOffset = previousBoxes.length;
  const STAGGER = 6;
  const ENTRY_START = 12;
  sortedCurrent.forEach(({ idx }, k) => {
    const localStart = ENTRY_START + k * STAGGER;
    const p = spring({
      frame: frame - localStart,
      fps,
      config: { damping: 18, stiffness: 180 },
    });
    boxProgress.set(startOffset + idx, Math.max(0, Math.min(1, p)));
  });

  // Highlight pulse
  const pulse = 0.5 + 0.5 * Math.sin(frame * 0.18);
  const highlightOp = interpolate(frame, [0, 12, 100, ROW_DUR], [0, 1, 1, 0.4], {
    extrapolateRight: "clamp",
  });
  const highlight =
    highlightOp > 0
      ? { xStart: row.xStart, xEnd: row.xEnd, pulse: pulse * highlightOp }
      : null;

  // Gap rectangles
  const gapRects: { x: number; y: number; w: number; h: number; pulse: number }[] = [];
  if (row.gapWarning && frame > 80) {
    const bottomBoxes = row.boxes.filter((b) => b.z < 10);
    if (bottomBoxes.length > 0) {
      const maxY = Math.max(...bottomBoxes.map((b) => b.y + b.w));
      if (maxY < scenario.container.inner.w - 10) {
        gapRects.push({
          x: row.xStart,
          y: maxY,
          w: row.xEnd - row.xStart,
          h: scenario.container.inner.w - maxY,
          pulse: 0.5 + 0.5 * Math.sin(frame * 0.25),
        });
      }
    }
  }

  // Caption fade-in
  const capProg = spring({ frame: frame - 4, fps, config: { damping: 22 } });
  const capOp = capProg;
  const capY = (1 - capProg) * 20;

  const placement = rowIdx === 0 ? "back wall" : `row ${rowIdx}`;
  const captionTitle = `Row ${rowIdx + 1} of ${totalRows}`;
  const captionLine1 = `${row.boxes.length} cartons · ${row.totalWeightKg} kg · ${row.layers} layer${row.layers > 1 ? "s" : ""}`;
  const captionLine2 = `Push tight against ${placement}.`;

  // Show "360° check" hint during orbit phase
  const orbitHintOp = interpolate(phase, [0.7, 0.75, 0.95, 1], [0, 1, 1, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: BG }}>
      <ContainerScene
        cam={cam}
        container={scenario.container}
        visibleBoxes={[...previousBoxes, ...currentBoxes]}
        boxProgress={boxProgress}
        highlightRow={highlight}
        gapRects={gapRects}
      />
      <div
        style={{
          position: "absolute",
          left: 80,
          top: 100,
          width: 460,
          opacity: capOp,
          transform: `translateY(${capY}px)`,
        }}
      >
        <div
          style={{
            color: ACCENT,
            fontFamily: BODY,
            fontWeight: 600,
            fontSize: 16,
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          Loading guide
        </div>
        <div
          style={{
            color: TEXT,
            fontFamily: DISPLAY,
            fontWeight: 700,
            fontSize: 64,
            letterSpacing: -1,
            marginTop: 8,
          }}
        >
          {captionTitle}
        </div>
        <div
          style={{
            color: TEXT,
            fontFamily: BODY,
            fontWeight: 500,
            fontSize: 26,
            marginTop: 18,
            lineHeight: 1.35,
          }}
        >
          {captionLine1}
        </div>
        <div
          style={{
            color: MUTED,
            fontFamily: BODY,
            fontSize: 22,
            marginTop: 8,
            lineHeight: 1.4,
          }}
        >
          {captionLine2}
        </div>
        <div style={{ marginTop: 24, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {row.hasFragile && <Badge color={AMBER} text="✦ FRAGILE — cap last" />}
          {row.hasNonStack && <Badge color={RED} text="✕ NO-STACK — floor only" />}
          {row.rotatedCount > 0 && (
            <Badge color={AMBER} text={`↻ ROTATE H↔L (${row.rotatedCount})`} />
          )}
          {row.gapWarning && (
            <Badge color={RED} text={`⚠ GAP — ${Math.round(row.wallUtilizationPct)}% wall`} />
          )}
        </div>
        {row.gapWarning && frame > 80 && (
          <div
            style={{
              marginTop: 18,
              color: RED,
              fontFamily: BODY,
              fontWeight: 600,
              fontSize: 22,
            }}
          >
            ► Add dunnage in the red zone.
          </div>
        )}
      </div>
      {/* 360° orbit hint */}
      <div
        style={{
          position: "absolute",
          right: 80,
          bottom: 80,
          opacity: orbitHintOp,
          color: ACCENT,
          fontFamily: BODY,
          fontWeight: 600,
          fontSize: 18,
          letterSpacing: 4,
          textTransform: "uppercase",
          background: "rgba(20,184,166,0.12)",
          border: "1px solid rgba(20,184,166,0.5)",
          padding: "10px 18px",
          borderRadius: 999,
        }}
      >
        ↻ 360° check
      </div>
      {/* Progress dots */}
      <div
        style={{
          position: "absolute",
          right: 80,
          top: 110,
          display: "flex",
          gap: 10,
        }}
      >
        {ROWS.map((_, i) => (
          <div
            key={i}
            style={{
              width: i === rowIdx ? 36 : 12,
              height: 12,
              borderRadius: 6,
              background: i <= rowIdx ? ACCENT : "rgba(245,245,244,0.18)",
            }}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};

const Badge: React.FC<{ color: string; text: string }> = ({ color, text }) => (
  <div
    style={{
      background: `${color}22`,
      border: `1.5px solid ${color}`,
      color,
      fontFamily: BODY,
      fontWeight: 600,
      fontSize: 16,
      padding: "6px 14px",
      borderRadius: 999,
      letterSpacing: 1,
    }}
  >
    {text}
  </div>
);

/* ──────────────────────────────────────────────────────────
 * Scene 4: COG explainer (90 frames)
 * Top-down camera, weight-weighted centroid slides into safe-zone band.
 * ────────────────────────────────────────────────────────── */
const CogScene: React.FC<{ scenario: Scenario }> = ({ scenario }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cam: Camera = { ...CAM_PRESETS.top, scale: 0.16 };

  // COG slides from back wall (0%) to its final % over frames 10..60
  const cogP = interpolate(frame, [10, 60], [0, scenario.cogOffsetPct / 100], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });
  const titleP = spring({ frame, fps, config: { damping: 22 } });

  // Container floor outline (top-down) — render via simple SVG overlay
  const allBoxes = scenario.allBoxes;

  // Safe zone: 40-60% of length from back wall
  const containerL = scenario.container.inner.l;
  const containerW = scenario.container.inner.w;

  // Marker position in screen space — project the container floor and
  // compute marker as a percentage along x.
  const safeOk = scenario.cogOffsetPct >= 40 && scenario.cogOffsetPct <= 60;

  return (
    <AbsoluteFill style={{ background: BG }}>
      <ContainerScene
        cam={cam}
        container={scenario.container}
        visibleBoxes={allBoxes}
        showShell
        doorClose={0}
      />
      {/* Overlay: safe zone band + COG marker drawn in mm via projection */}
      <CogOverlay
        cam={cam}
        containerL={containerL}
        containerW={containerW}
        cogFrac={cogP}
        safeOk={safeOk}
      />
      <div
        style={{
          position: "absolute",
          left: 80,
          top: 90,
          opacity: titleP,
          transform: `translateY(${(1 - titleP) * 20}px)`,
        }}
      >
        <div
          style={{
            color: ACCENT,
            fontFamily: BODY,
            fontWeight: 600,
            fontSize: 16,
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          Center of gravity
        </div>
        <div
          style={{
            color: TEXT,
            fontFamily: DISPLAY,
            fontWeight: 700,
            fontSize: 56,
            letterSpacing: -1,
            marginTop: 10,
          }}
        >
          {scenario.cogOffsetPct.toFixed(0)}% from back wall
        </div>
        <div
          style={{
            color: safeOk ? ACCENT : AMBER,
            fontFamily: BODY,
            fontWeight: 600,
            fontSize: 22,
            marginTop: 10,
          }}
        >
          {safeOk ? "✓ Inside the 40–60% safe zone" : "⚠ Outside the 40–60% safe zone — re-balance"}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const CogOverlay: React.FC<{
  cam: Camera;
  containerL: number;
  containerW: number;
  cogFrac: number;
  safeOk: boolean;
}> = ({ cam, containerL, containerW, cogFrac, safeOk }) => {
  // Lazily import project to keep this scene self-contained
  // We use SVG positioned absolutely on top of the ContainerScene SVG.
  const { project } = require("./projection") as typeof import("./projection");
  // Safe zone polygon (40-60% of L)
  const x1 = 0.4 * containerL;
  const x2 = 0.6 * containerL;
  const safe = [
    project(x1, 0, 1, cam),
    project(x2, 0, 1, cam),
    project(x2, containerW, 1, cam),
    project(x1, containerW, 1, cam),
  ];
  const cogX = cogFrac * containerL;
  const cogPt = project(cogX, containerW / 2, 1, cam);

  return (
    <svg
      viewBox="0 0 1920 1080"
      width="1920"
      height="1080"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      <polygon
        points={safe.map((p) => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(" ")}
        fill="rgba(20,184,166,0.18)"
        stroke="rgba(20,184,166,0.7)"
        strokeWidth={2}
        strokeDasharray="6 5"
      />
      {/* Glowing COG marker */}
      <circle
        cx={cogPt.sx}
        cy={cogPt.sy}
        r={28}
        fill={safeOk ? ACCENT : AMBER}
        opacity={0.25}
      />
      <circle
        cx={cogPt.sx}
        cy={cogPt.sy}
        r={14}
        fill={safeOk ? ACCENT : AMBER}
        stroke={BG}
        strokeWidth={3}
      />
      <text
        x={cogPt.sx}
        y={cogPt.sy - 40}
        fill={TEXT}
        fontSize={22}
        fontFamily="Inter, sans-serif"
        fontWeight={700}
        textAnchor="middle"
      >
        COG
      </text>
    </svg>
  );
};

/* ──────────────────────────────────────────────────────────
 * Scene 5: Dunnage close-up (60 frames)
 * Zoom into the gap row, slide an animated dunnage block into the void.
 * ────────────────────────────────────────────────────────── */
const DunnageScene: React.FC<{ scenario: Scenario }> = ({ scenario }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Find first gap row, fall back to last row
  const gapRow: Row =
    scenario.rows.find((r) => r.gapWarning) ?? scenario.rows[scenario.rows.length - 1];

  // Zoom camera focused on this row — pan cx so the row sits centered
  const cam: Camera = {
    ...CAM_PRESETS.iso,
    scale: 0.2,
    cx: 960 - (gapRow.xStart + gapRow.xEnd) / 2 * 0.2 * Math.cos(-0.55) * 0.4,
    cy: 620,
    yaw: -0.85,
    pitch: 0.55,
  };

  // Compute dunnage block target — fills the lateral void on the bottom layer
  const bottomBoxes = gapRow.boxes.filter((b) => b.z < 10);
  const maxY = bottomBoxes.length > 0 ? Math.max(...bottomBoxes.map((b) => b.y + b.w)) : 0;
  const containerW = scenario.container.inner.w;
  const dunnageY0 = maxY;
  const dunnageW = Math.max(0, containerW - maxY - 20);
  const dunnageH = 600;
  const dunnageL = gapRow.xEnd - gapRow.xStart;

  // Dunnage slides in from above (z = 2500 → row floor) over frames 10..40
  const slideP = spring({
    frame: frame - 10,
    fps,
    config: { damping: 16, stiffness: 140 },
  });
  const dunnageZ = interpolate(slideP, [0, 1], [2500, 0], { extrapolateRight: "clamp" });

  const allBoxes = scenario.rows.flatMap((r) => r.boxes);

  // Build an extended box array including the animated dunnage as the last box
  const dunnageBox = {
    x: gapRow.xStart,
    y: dunnageY0,
    z: dunnageZ,
    l: dunnageL,
    w: dunnageW,
    h: dunnageH,
    color: "#fbbf24",
    nonStack: false,
  };

  const titleP = spring({ frame, fps, config: { damping: 22 } });

  return (
    <AbsoluteFill style={{ background: BG }}>
      <ContainerScene
        cam={cam}
        container={scenario.container}
        visibleBoxes={dunnageW > 0 ? [...allBoxes, dunnageBox] : allBoxes}
        doorClose={0}
      />
      <div
        style={{
          position: "absolute",
          left: 80,
          top: 90,
          opacity: titleP,
          transform: `translateY(${(1 - titleP) * 20}px)`,
        }}
      >
        <div
          style={{
            color: AMBER,
            fontFamily: BODY,
            fontWeight: 600,
            fontSize: 16,
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          Dunnage close-up
        </div>
        <div
          style={{
            color: TEXT,
            fontFamily: DISPLAY,
            fontWeight: 700,
            fontSize: 56,
            letterSpacing: -1,
            marginTop: 10,
          }}
        >
          Fill the void.
        </div>
        <div
          style={{
            color: MUTED,
            fontFamily: BODY,
            fontSize: 22,
            marginTop: 10,
            maxWidth: 520,
            lineHeight: 1.4,
          }}
        >
          Drop dunnage bags or airbags into the red zone of row {gapRow.rowIdx + 1} to
          stop the load shifting in transit.
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ──────────────────────────────────────────────────────────
 * Scene 6: Door close (75 frames)
 * ────────────────────────────────────────────────────────── */
const DoorScene: React.FC<{ scenario: Scenario }> = ({ scenario }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = interpolate(frame, [0, DOOR_DUR], [0, 1], { extrapolateRight: "clamp" });
  const cam: Camera = lerpCam(CAM_PRESETS.iso, { ...CAM_PRESETS.iso, scale: 0.10, cy: 580 }, t);
  const doorClose = interpolate(frame, [0, 55], [0, 1], { extrapolateRight: "clamp" });
  const allBoxes = scenario.rows.flatMap((r) => r.boxes);
  const titleP = spring({ frame: frame - 30, fps, config: { damping: 20 } });
  return (
    <AbsoluteFill style={{ background: BG }}>
      <ContainerScene
        cam={cam}
        container={scenario.container}
        visibleBoxes={allBoxes}
        doorClose={doorClose}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 90,
          textAlign: "center",
          opacity: titleP,
          transform: `translateY(${(1 - titleP) * 20}px)`,
        }}
      >
        <div
          style={{
            color: AMBER,
            fontFamily: BODY,
            fontWeight: 600,
            fontSize: 18,
            letterSpacing: 6,
            textTransform: "uppercase",
          }}
        >
          Doors closed · sealed
        </div>
        <div
          style={{
            color: TEXT,
            fontFamily: DISPLAY,
            fontWeight: 700,
            fontSize: 56,
            letterSpacing: -1,
            marginTop: 8,
          }}
        >
          Container ready to ship.
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ──────────────────────────────────────────────────────────
 * Scene 7: Outro (45 frames)
 * ────────────────────────────────────────────────────────── */
const OutroScene: React.FC<{ scenario: Scenario }> = ({ scenario }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: { damping: 20 } });
  return (
    <AbsoluteFill
      style={{
        background: BG,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: 100,
      }}
    >
      <div
        style={{
          color: ACCENT,
          fontFamily: BODY,
          fontWeight: 600,
          fontSize: 18,
          letterSpacing: 6,
          textTransform: "uppercase",
          opacity: p,
        }}
      >
        Load summary
      </div>
      <div
        style={{
          color: TEXT,
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontSize: 90,
          letterSpacing: -2,
          marginTop: 20,
          opacity: p,
          transform: `translateY(${(1 - p) * 30}px)`,
        }}
      >
        Match this in the trailer.
      </div>
      <div
        style={{
          marginTop: 70,
          display: "flex",
          gap: 80,
          opacity: p,
        }}
      >
        <BigStat label="Utilization" value={`${scenario.utilizationPct.toFixed(0)}%`} accent={ACCENT} />
        <BigStat label="Total weight" value={`${scenario.totalWeightKg} kg`} accent={TEXT} />
        <BigStat label="COG (from back)" value={`${scenario.cogOffsetPct.toFixed(0)}%`} accent={AMBER} />
      </div>
    </AbsoluteFill>
  );
};

const BigStat: React.FC<{ label: string; value: string; accent: string }> = ({
  label,
  value,
  accent,
}) => (
  <div style={{ textAlign: "center" }}>
    <div
      style={{
        color: MUTED,
        fontFamily: BODY,
        fontSize: 16,
        letterSpacing: 3,
        textTransform: "uppercase",
      }}
    >
      {label}
    </div>
    <div
      style={{
        color: accent,
        fontFamily: DISPLAY,
        fontWeight: 700,
        fontSize: 90,
        marginTop: 6,
        letterSpacing: -1,
      }}
    >
      {value}
    </div>
  </div>
);

/* ──────────────────────────────────────────────────────────
 * Top-level composition — props.scenario drives everything
 * ────────────────────────────────────────────────────────── */

export const TOTAL_FRAMES = totalFrames(DEFAULT_SCENARIO.rows.length);

export const LoadingGuide: React.FC<LoadingGuideProps> = ({ scenario = DEFAULT_SCENARIO }) => {
  return (
    <AbsoluteFill style={{ background: BG }}>
      <Series>
        <Series.Sequence durationInFrames={INTRO_DUR}>
          <IntroScene scenario={scenario} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={RULES_DUR}>
          <RulesScene />
        </Series.Sequence>
        {scenario.rows.map((r) => (
          <Series.Sequence key={r.rowIdx} durationInFrames={ROW_DUR}>
            <RowScene scenario={scenario} rowIdx={r.rowIdx} />
          </Series.Sequence>
        ))}
        <Series.Sequence durationInFrames={COG_DUR}>
          <CogScene scenario={scenario} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={DUNNAGE_DUR}>
          <DunnageScene scenario={scenario} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={DOOR_DUR}>
          <DoorScene scenario={scenario} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={OUTRO_DUR}>
          <OutroScene scenario={scenario} />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};

void Sequence;

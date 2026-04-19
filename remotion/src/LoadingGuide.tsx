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
import {
  ROWS,
  CONTAINER,
  TOTAL_CARTONS,
  TOTAL_CBM,
  TOTAL_WEIGHT_KG,
  UTILIZATION_PCT,
  COG_OFFSET_PCT,
} from "./scenario";

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
 * Scene 1: Intro (0–3s = 90 frames) — orbit empty container
 * ────────────────────────────────────────────────────────── */
const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // 360° orbit
  const yaw = -0.55 + interpolate(frame, [0, 90], [0, Math.PI * 2]);
  const cam: Camera = { ...CAM_PRESETS.iso, yaw, scale: 0.13 };

  const titleProg = spring({ frame, fps, config: { damping: 20, stiffness: 120 } });
  const titleY = interpolate(titleProg, [0, 1], [40, 0]);
  const titleOp = titleProg;

  return (
    <AbsoluteFill style={{ background: BG }}>
      <ContainerScene cam={cam} visibleBoxes={[]} doorClose={0} />
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
        <Stat label="Container" value={CONTAINER.name} />
        <Stat label="Cartons" value={`${TOTAL_CARTONS}`} />
        <Stat label="Volume" value={`${TOTAL_CBM.toFixed(2)} m³`} />
        <Stat label="Weight" value={`${TOTAL_WEIGHT_KG} kg`} />
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

/* ──────────────────────────────────────────────────────────
 * Scene 2: Rules recap (3–6s = 90 frames)
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
 * Scene 3: Row-by-row loading (6–22s = 480 frames)
 * One sub-sequence per row, ~96 frames each (5 rows × 96 = 480).
 * ────────────────────────────────────────────────────────── */

const ROW_DUR = 96;

const RowScene: React.FC<{ rowIdx: number }> = ({ rowIdx }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const row = ROWS[rowIdx];
  const totalRows = ROWS.length;

  // Camera arc per row: iso → side → top → iso
  // Distribute over 4 phases of the 96-frame sub-sequence
  const phase = frame / ROW_DUR; // 0..1
  let cam: Camera;
  if (phase < 0.33) {
    const t = phase / 0.33;
    cam = lerpCam(CAM_PRESETS.iso, CAM_PRESETS.side, t);
  } else if (phase < 0.66) {
    const t = (phase - 0.33) / 0.33;
    cam = lerpCam(CAM_PRESETS.side, CAM_PRESETS.top, t);
  } else {
    const t = (phase - 0.66) / 0.34;
    cam = lerpCam(CAM_PRESETS.top, CAM_PRESETS.iso, t);
  }
  // Slow yaw drift on top of preset
  cam = { ...cam, yaw: cam.yaw + Math.sin(phase * Math.PI * 2) * 0.05 };

  // Visible boxes = all rows up to & including this one
  const previousBoxes = ROWS.slice(0, rowIdx).flatMap((r) => r.boxes);
  const currentBoxes = row.boxes;
  // Sort current row by z then by load order so bottom layer drops first
  const sortedCurrent = [...currentBoxes]
    .map((b, idx) => ({ b, idx }))
    .sort((a, b) => a.b.z - b.b.z || a.idx - b.idx);

  // Compute per-box entrance progress
  const boxProgress = new Map<number, number>();
  // Previous boxes are fully present
  previousBoxes.forEach((_, i) => boxProgress.set(i, 1));
  // Current row drops in over frames 10..70, staggered
  const startOffset = previousBoxes.length;
  const STAGGER = 5;
  const ENTRY_START = 10;
  sortedCurrent.forEach(({ idx }, k) => {
    const localStart = ENTRY_START + k * STAGGER;
    const p = spring({
      frame: frame - localStart,
      fps,
      config: { damping: 18, stiffness: 180 },
    });
    boxProgress.set(startOffset + idx, Math.max(0, Math.min(1, p)));
  });

  // Highlight pulse (during first half of scene)
  const pulse = 0.5 + 0.5 * Math.sin(frame * 0.18);
  const highlightOp = interpolate(frame, [0, 10, 70, 96], [0, 1, 1, 0.4], {
    extrapolateRight: "clamp",
  });
  const highlight =
    highlightOp > 0
      ? { xStart: row.xStart, xEnd: row.xEnd, pulse: pulse * highlightOp }
      : null;

  // Gap rectangles for rows with gapWarning — appear after boxes settled
  const gapRects: { x: number; y: number; w: number; h: number; pulse: number }[] = [];
  if (row.gapWarning && frame > 60) {
    // Compute simplest gap: where bottom-layer footprint doesn't cover full width
    const bottomBoxes = row.boxes.filter((b) => b.z < 10);
    // assume rows where right side empty (matches our row3 demo)
    const maxY = Math.max(...bottomBoxes.map((b) => b.y + b.w));
    if (maxY < CONTAINER.inner.w - 10) {
      gapRects.push({
        x: row.xStart,
        y: maxY,
        w: row.xEnd - row.xStart,
        h: CONTAINER.inner.w - maxY,
        pulse: 0.5 + 0.5 * Math.sin(frame * 0.25),
      });
    }
  }

  // Caption fade-in
  const capProg = spring({ frame: frame - 4, fps, config: { damping: 22 } });
  const capOp = capProg;
  const capY = (1 - capProg) * 20;

  // Caption text
  const placement = rowIdx === 0 ? "back wall" : `row ${rowIdx}`;
  const captionTitle = `Row ${rowIdx + 1} of ${totalRows}`;
  const captionLine1 = `${row.boxes.length} cartons · ${row.totalWeightKg} kg · ${row.layers} layer${row.layers > 1 ? "s" : ""}`;
  const captionLine2 = `Push tight against ${placement}.`;

  return (
    <AbsoluteFill style={{ background: BG }}>
      <ContainerScene
        cam={cam}
        visibleBoxes={[...previousBoxes, ...currentBoxes]}
        boxProgress={boxProgress}
        highlightRow={highlight}
        gapRects={gapRects}
      />
      {/* Side caption panel */}
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
        {/* Badges */}
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
        {row.gapWarning && frame > 60 && (
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
 * Scene 4: Door close (22–24s = 60 frames)
 * ────────────────────────────────────────────────────────── */
const DoorScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // pull camera back from iso
  const t = interpolate(frame, [0, 60], [0, 1], { extrapolateRight: "clamp" });
  const cam: Camera = lerpCam(CAM_PRESETS.iso, { ...CAM_PRESETS.iso, scale: 0.10, cy: 580 }, t);
  // doorClose 0..1 over the first 45 frames
  const doorClose = interpolate(frame, [0, 45], [0, 1], { extrapolateRight: "clamp" });
  const allBoxes = ROWS.flatMap((r) => r.boxes);
  const titleP = spring({ frame: frame - 30, fps, config: { damping: 20 } });
  return (
    <AbsoluteFill style={{ background: BG }}>
      <ContainerScene
        cam={cam}
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
 * Scene 5: Outro (24–25s = 30 frames)
 * ────────────────────────────────────────────────────────── */
const OutroScene: React.FC = () => {
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
        <BigStat label="Utilization" value={`${UTILIZATION_PCT.toFixed(0)}%`} accent={ACCENT} />
        <BigStat label="Total weight" value={`${TOTAL_WEIGHT_KG} kg`} accent={TEXT} />
        <BigStat label="COG (from back)" value={`${COG_OFFSET_PCT.toFixed(0)}%`} accent={AMBER} />
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
 * Top-level composition timing
 * Intro 90 + Rules 90 + Rows 480 + Door 60 + Outro 30 = 750 frames @ 30fps = 25s
 * ────────────────────────────────────────────────────────── */

export const TOTAL_FRAMES = 750;

export const LoadingGuide: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: BG }}>
      <Series>
        <Series.Sequence durationInFrames={90}>
          <IntroScene />
        </Series.Sequence>
        <Series.Sequence durationInFrames={90}>
          <RulesScene />
        </Series.Sequence>
        {ROWS.map((r) => (
          <Series.Sequence key={r.rowIdx} durationInFrames={ROW_DUR}>
            <RowScene rowIdx={r.rowIdx} />
          </Series.Sequence>
        ))}
        <Series.Sequence durationInFrames={60}>
          <DoorScene />
        </Series.Sequence>
        <Series.Sequence durationInFrames={30}>
          <OutroScene />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};

// silence unused import in some bundlers
void Sequence;

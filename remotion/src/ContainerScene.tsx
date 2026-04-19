/**
 * Stateless 3D-ish container scene rendered in pure SVG.
 * Caller supplies which boxes are visible and the active camera.
 */

import React from "react";
import { boxFaces, project, type Camera } from "./projection";
import type { Box, ContainerSpec } from "./scenario-demo";

export interface SceneProps {
  cam: Camera;
  /** Container dimensions to render. */
  container: ContainerSpec;
  visibleBoxes: Box[];
  /** Box index → 0..1 entrance progress. Missing = fully present. */
  boxProgress?: Map<number, number>;
  /** Whether to render the container shell (off during exterior shots). */
  showShell?: boolean;
  /** Highlight a specific row's bounding wall on the floor (mm xStart/xEnd). */
  highlightRow?: { xStart: number; xEnd: number; pulse: number } | null;
  /** Floor/back-wall gap heatmap rectangles (mm coords). */
  gapRects?: { x: number; y: number; w: number; h: number; pulse: number }[];
  /** When true, draw a thick orange band on rotated boxes. */
  showRotateBands?: boolean;
  /** 0..1, animates door swing. 0 = wide open, 1 = sealed. */
  doorClose?: number;
}

const SHELL_COLOR = "rgba(245,245,244,0.25)";
const FLOOR_COLOR = "rgba(245,245,244,0.06)";
const BACK_WALL_COLOR = "rgba(245,245,244,0.10)";

function shadeColor(hex: string, lum: number): string {
  // simple HEX → RGB → multiply
  const m = hex.replace("#", "");
  const r = parseInt(m.substring(0, 2), 16);
  const g = parseInt(m.substring(2, 4), 16);
  const b = parseInt(m.substring(4, 6), 16);
  const rr = Math.max(0, Math.min(255, Math.round(r * lum)));
  const gg = Math.max(0, Math.min(255, Math.round(g * lum)));
  const bb = Math.max(0, Math.min(255, Math.round(b * lum)));
  return `rgb(${rr},${gg},${bb})`;
}

function pointsAttr(pts: { sx: number; sy: number }[]): string {
  return pts.map((p) => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(" ");
}

export const ContainerScene: React.FC<SceneProps> = ({
  cam,
  visibleBoxes,
  boxProgress,
  showShell = true,
  highlightRow,
  gapRects,
  showRotateBands = true,
  doorClose = 0,
}) => {
  const { l, w, h } = CONTAINER.inner;

  // --- Container shell wireframe ---
  const shellPaths: React.ReactNode[] = [];
  if (showShell) {
    // Floor (4 corners)
    const floor = [
      project(0, 0, 0, cam),
      project(l, 0, 0, cam),
      project(l, w, 0, cam),
      project(0, w, 0, cam),
    ];
    shellPaths.push(
      <polygon
        key="floor"
        points={pointsAttr(floor)}
        fill={FLOOR_COLOR}
        stroke={SHELL_COLOR}
        strokeWidth={1.4}
      />,
    );
    // Back wall (x=0)
    const back = [
      project(0, 0, 0, cam),
      project(0, w, 0, cam),
      project(0, w, h, cam),
      project(0, 0, h, cam),
    ];
    shellPaths.push(
      <polygon
        key="back"
        points={pointsAttr(back)}
        fill={BACK_WALL_COLOR}
        stroke={SHELL_COLOR}
        strokeWidth={1.4}
      />,
    );
    // Side walls (left y=0, right y=w)
    const leftWall = [
      project(0, 0, 0, cam),
      project(l, 0, 0, cam),
      project(l, 0, h, cam),
      project(0, 0, h, cam),
    ];
    shellPaths.push(
      <polygon
        key="left"
        points={pointsAttr(leftWall)}
        fill="none"
        stroke={SHELL_COLOR}
        strokeWidth={1}
        strokeDasharray="3 4"
      />,
    );
    const rightWall = [
      project(0, w, 0, cam),
      project(l, w, 0, cam),
      project(l, w, h, cam),
      project(0, w, h, cam),
    ];
    shellPaths.push(
      <polygon
        key="right"
        points={pointsAttr(rightWall)}
        fill="none"
        stroke={SHELL_COLOR}
        strokeWidth={1}
        strokeDasharray="3 4"
      />,
    );
    // Top edges
    const top = [
      project(0, 0, h, cam),
      project(l, 0, h, cam),
      project(l, w, h, cam),
      project(0, w, h, cam),
    ];
    shellPaths.push(
      <polygon
        key="top"
        points={pointsAttr(top)}
        fill="none"
        stroke={SHELL_COLOR}
        strokeWidth={1}
        strokeDasharray="3 4"
      />,
    );
  }

  // --- Highlighted row backdrop on floor (a colored slab) ---
  let highlightSlab: React.ReactNode = null;
  if (highlightRow) {
    const slab = [
      project(highlightRow.xStart, 0, 1, cam),
      project(highlightRow.xEnd, 0, 1, cam),
      project(highlightRow.xEnd, w, 1, cam),
      project(highlightRow.xStart, w, 1, cam),
    ];
    const opacity = 0.18 + 0.12 * highlightRow.pulse;
    highlightSlab = (
      <polygon
        points={pointsAttr(slab)}
        fill={`rgba(20,184,166,${opacity})`}
        stroke="rgba(20,184,166,0.6)"
        strokeWidth={1.5}
      />
    );
  }

  // --- Gap heatmap on floor (red rectangles) ---
  const gapNodes: React.ReactNode[] = [];
  if (gapRects && gapRects.length > 0) {
    for (let i = 0; i < gapRects.length; i++) {
      const g = gapRects[i];
      const rect = [
        project(g.x, g.y, 1, cam),
        project(g.x + g.w, g.y, 1, cam),
        project(g.x + g.w, g.y + g.h, 1, cam),
        project(g.x, g.y + g.h, 1, cam),
      ];
      const a = 0.35 + 0.35 * g.pulse;
      gapNodes.push(
        <polygon
          key={`gap-${i}`}
          points={pointsAttr(rect)}
          fill={`rgba(239,68,68,${a})`}
          stroke="rgba(239,68,68,0.9)"
          strokeWidth={1.5}
        />,
      );
    }
  }

  // --- Boxes (sorted back-to-front by depth) ---
  const sorted = visibleBoxes
    .map((b, i) => {
      const f = boxFaces(b.x, b.y, b.z, b.l, b.w, b.h, cam);
      return { b, f, i };
    })
    .sort((a, b) => a.f.avgDepth - b.f.avgDepth);

  const boxNodes: React.ReactNode[] = [];
  for (const { b, f, i } of sorted) {
    const prog = boxProgress?.get(i) ?? 1;
    if (prog <= 0) continue;
    // entrance: drop in from above with fade
    const dropPx = (1 - prog) * 200;
    const op = Math.max(0, Math.min(1, prog));

    const base = b.color;
    const topShade = shadeColor(base, 1.18);
    const frontShade = shadeColor(base, 0.92);
    const rightShade = shadeColor(base, 0.7);

    boxNodes.push(
      <g key={`box-${i}`} transform={`translate(0 ${-dropPx})`} opacity={op}>
        <polygon
          points={pointsAttr(f.right)}
          fill={rightShade}
          stroke="rgba(15,23,42,0.7)"
          strokeWidth={0.8}
        />
        <polygon
          points={pointsAttr(f.front)}
          fill={frontShade}
          stroke="rgba(15,23,42,0.7)"
          strokeWidth={0.8}
        />
        <polygon
          points={pointsAttr(f.top)}
          fill={topShade}
          stroke="rgba(15,23,42,0.7)"
          strokeWidth={0.8}
        />
        {/* fragile / non-stack / rotated indicators */}
        {b.fragile && (
          <polygon
            points={pointsAttr(f.top)}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={2.5}
            strokeDasharray="6 4"
          />
        )}
        {b.nonStack && (
          <polygon
            points={pointsAttr(f.top)}
            fill="rgba(239,68,68,0.18)"
            stroke="#ef4444"
            strokeWidth={2}
          />
        )}
        {b.rotated && showRotateBands && (
          <polygon
            points={pointsAttr(f.front)}
            fill="rgba(245,158,11,0.35)"
            stroke="#f59e0b"
            strokeWidth={2}
          />
        )}
      </g>,
    );
  }

  // --- Container doors (swing + seal as doorClose 0→1) ---
  let doorNodes: React.ReactNode = null;
  if (showShell) {
    const swing = (1 - doorClose) * 1.2; // radians of opening
    // Right door hinged at (l, w, *), swings toward +y when open
    const rightHingeY = w;
    const rightDoorW = w / 2;
    const rdEndY = rightHingeY + Math.sin(swing) * rightDoorW;
    const rdEndX = l + Math.cos(swing) * 0; // hinge is at x=l, door extends along y
    const rd = [
      project(l, rightHingeY, 0, cam),
      project(rdEndX, rdEndY, 0, cam),
      project(rdEndX, rdEndY, h, cam),
      project(l, rightHingeY, h, cam),
    ];
    // Left door hinged at (l, 0, *), swings toward -y
    const ldEndY = 0 - Math.sin(swing) * rightDoorW;
    const ld = [
      project(l, 0, 0, cam),
      project(l, ldEndY, 0, cam),
      project(l, ldEndY, h, cam),
      project(l, 0, h, cam),
    ];
    doorNodes = (
      <>
        <polygon
          points={pointsAttr(rd)}
          fill="rgba(245,245,244,0.12)"
          stroke={SHELL_COLOR}
          strokeWidth={1.4}
        />
        <polygon
          points={pointsAttr(ld)}
          fill="rgba(245,245,244,0.12)"
          stroke={SHELL_COLOR}
          strokeWidth={1.4}
        />
        {doorClose > 0.95 && (
          <text
            x={cam.cx}
            y={cam.cy + 220}
            fill="#f59e0b"
            fontSize={28}
            fontFamily="Inter, sans-serif"
            fontWeight={600}
            textAnchor="middle"
          >
            ● SEALED
          </text>
        )}
      </>
    );
  }

  return (
    <svg
      viewBox="0 0 1920 1080"
      width="1920"
      height="1080"
      style={{ display: "block" }}
    >
      {shellPaths}
      {highlightSlab}
      {gapNodes}
      {boxNodes}
      {doorNodes}
    </svg>
  );
};

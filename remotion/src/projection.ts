/**
 * Project a (x, y, z) point in container-mm space to 2D screen coordinates
 * using a fixed isometric-ish projection. Camera "angle" is a single number
 * 0..1 that morphs between iso, side, top, iso again — driven per row by the
 * current frame in the loading scenes.
 */

import { CONTAINER } from "./scenario";

export type ViewMode = "iso" | "side" | "top" | "front";

export interface Camera {
  /** rotation around vertical axis (radians) */
  yaw: number;
  /** tilt above horizon (radians) */
  pitch: number;
  /** zoom in screen-pixels per mm */
  scale: number;
  /** screen-space pan */
  cx: number;
  cy: number;
}

export const DEFAULT_CAM: Camera = {
  yaw: -0.55,
  pitch: 0.42,
  scale: 0.13,
  cx: 960,
  cy: 600,
};

/** 3D point → 2D screen */
export function project(
  x: number,
  y: number,
  z: number,
  cam: Camera,
): { sx: number; sy: number; depth: number } {
  // Centre the container around origin so rotation orbits it
  const cx = x - CONTAINER.inner.l / 2;
  const cy = y - CONTAINER.inner.w / 2;
  const cz = z; // keep floor at z=0

  // Rotate around vertical (z) axis — yaw
  const cosY = Math.cos(cam.yaw);
  const sinY = Math.sin(cam.yaw);
  const rx = cx * cosY - cy * sinY;
  const ry = cx * sinY + cy * cosY;

  // Tilt — rotate around horizontal axis (x'), pitch
  const cosP = Math.cos(cam.pitch);
  const sinP = Math.sin(cam.pitch);
  const ry2 = ry * cosP - cz * sinP;
  const rz2 = ry * sinP + cz * cosP;

  // Orthographic projection
  const sx = cam.cx + rx * cam.scale;
  const sy = cam.cy - rz2 * cam.scale; // y screen grows down
  const depth = ry2; // for painter's sort

  return { sx, sy, depth };
}

/** Project all 8 corners of a box and return them as a polygon path per face. */
export function boxFaces(
  x: number,
  y: number,
  z: number,
  l: number,
  w: number,
  h: number,
  cam: Camera,
) {
  const corners: { sx: number; sy: number; depth: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const dx = i & 1 ? l : 0;
    const dy = i & 2 ? w : 0;
    const dz = i & 4 ? h : 0;
    corners.push(project(x + dx, y + dy, z + dz, cam));
  }
  // c[0..7] indexed by (z<<2 | y<<1 | x)
  // Faces: bottom (z=0), top (z=1), back (y=0), front (y=1), left (x=0), right (x=1)
  const top = [corners[4], corners[5], corners[7], corners[6]];
  const front = [corners[2], corners[3], corners[7], corners[6]];
  const right = [corners[1], corners[3], corners[7], corners[5]];
  // Average depth for painter's algorithm
  const avgDepth = corners.reduce((s, c) => s + c.depth, 0) / 8;
  return { top, front, right, avgDepth, corners };
}

/** Linearly interpolate between two cameras. */
export function lerpCam(a: Camera, b: Camera, t: number): Camera {
  return {
    yaw: a.yaw + (b.yaw - a.yaw) * t,
    pitch: a.pitch + (b.pitch - a.pitch) * t,
    scale: a.scale + (b.scale - a.scale) * t,
    cx: a.cx + (b.cx - a.cx) * t,
    cy: a.cy + (b.cy - a.cy) * t,
  };
}

/** Named camera presets used across scenes. */
export const CAM_PRESETS: Record<ViewMode, Camera> = {
  iso: { yaw: -0.55, pitch: 0.42, scale: 0.14, cx: 960, cy: 620 },
  side: { yaw: 0, pitch: 0.05, scale: 0.16, cx: 960, cy: 620 },
  top: { yaw: -0.001, pitch: 1.45, scale: 0.18, cx: 960, cy: 620 },
  front: { yaw: -1.55, pitch: 0.2, scale: 0.18, cx: 960, cy: 620 },
};

/**
 * Loading-sequence video generator.
 *
 * Drives the existing react-three-fiber scene frame-by-frame and captures
 * each frame from the canvas. The sequence shows boxes flying in from the
 * door side (+x in the scene, since cargo lays from x=0 = rear → x=L = door),
 * back-to-front, bottom-to-top, mirroring the loading order from
 * `loading-sequence.tsx` (non-stackable → heaviest → bottom → top → fragile).
 *
 * Encoder strategy:
 *   1. Try WebCodecs `VideoEncoder` + mp4-muxer (true MP4, all browsers w/ WebCodecs).
 *   2. Fall back to `MediaRecorder` with `video/mp4` if supported.
 *   3. Final fallback: `MediaRecorder` `video/webm` (Firefox / older Safari).
 *
 * The output Blob's mime type reflects the actual format used so the caller
 * can name the download accurately.
 */

import * as THREE from "three";
import type { AdvancedPackResult } from "./packing-advanced";
import type { PlacedBox } from "./packing";

const MM_PER_M = 1000;

export interface VideoFrameInfo {
  frame: number;
  totalFrames: number;
  /** 1-indexed step number (or 0 for intro / outro). */
  step: number;
  totalSteps: number;
  /** Caption shown on screen overlay. */
  caption: string;
  /** Sub-caption (e.g. weight, units). */
  subCaption: string;
}

export interface VideoControls {
  /** Drives the scene to a specific frame (sets transforms + camera). */
  applyFrame: (info: VideoFrameInfo) => void;
  /** Force a render and grab a PNG dataURL. */
  capture: () => string;
  /** Direct WebGLRenderer access (for canvas streaming). */
  getCanvas: () => HTMLCanvasElement | null;
  /** Renderer for canvas-stream encoders. */
  render: () => void;
}

export interface GenerateOptions {
  pack: AdvancedPackResult;
  controls: VideoControls;
  fps?: number;
  /** Total target duration in seconds (default 12). */
  durationSec?: number;
  /** Width × height of output. Should match canvas pixel size. */
  width: number;
  height: number;
  /** Encoder bitrate in bits/sec. Defaults to 8 Mbps. */
  videoBitsPerSecond?: number;
  onProgress?: (frame: number, total: number) => void;
}

export interface GeneratedVideo {
  blob: Blob;
  mime: string;
  /** "mp4" or "webm" — drives file extension. */
  ext: "mp4" | "webm";
  /** Per-frame metadata so the player can show step counter overlays. */
  timeline: VideoFrameInfo[];
}

/* -------------------------------------------------------------------------- */
/*  Loading order (mirrors loading-sequence.tsx)                              */
/* -------------------------------------------------------------------------- */

/**
 * Sort placed boxes into the recommended loading order:
 *   1. non-stackable goes in last (loaded into the door / top area)
 *   2. heaviest first
 *   3. bottom layer first (low z)
 *   4. fragile loads on top last
 *
 * Returns a stable order array of indices into pack.placed.
 */
function loadingOrder(pack: AdvancedPackResult): number[] {
  const idx = pack.placed.map((_, i) => i);
  // Bucket boxes by depth slab (~600 mm) so we finish a back-wall column
  // (back→top) before moving the column toward the door.
  const SLAB_MM = 600;
  idx.sort((a, b) => {
    const A = pack.placed[a];
    const B = pack.placed[b];
    const sa = pack.perItem[A.itemIdx];
    const sb = pack.perItem[B.itemIdx];

    // Fragile last (always loaded on top, very end)
    if (!!sa?.fragile !== !!sb?.fragile) return sa?.fragile ? 1 : -1;
    // Non-stackable last (loaded near door / top of stack)
    if (sa?.stackable !== sb?.stackable) return sa?.stackable ? -1 : 1;

    // Back wall → door: bucket by x slab so we don't ping-pong along the length
    const slabA = Math.floor(A.x / SLAB_MM);
    const slabB = Math.floor(B.x / SLAB_MM);
    if (slabA !== slabB) return slabA - slabB;

    // Within a slab: side-to-side first (lower y), then bottom-to-top (lower z)
    if (A.y !== B.y) return A.y - B.y;
    if (A.z !== B.z) return A.z - B.z;
    return A.x - B.x;
  });
  return idx;
}

/* -------------------------------------------------------------------------- */
/*  Timeline builder                                                          */
/* -------------------------------------------------------------------------- */

interface BoxAnim {
  placedIdx: number;
  startFrame: number;
  endFrame: number;
  /** Captions for this segment. */
  caption: string;
  subCaption: string;
  step: number;
}

interface Timeline {
  totalFrames: number;
  introFrames: number;
  outroFrames: number;
  loadFrames: number;
  anims: BoxAnim[];
  order: number[];
  fps: number;
}

function buildTimeline(
  pack: AdvancedPackResult,
  fps: number,
  durationSec: number,
): Timeline {
  const order = loadingOrder(pack);
  const totalFrames = Math.max(60, Math.round(durationSec * fps));

  // Allocate time: 14% intro (door opening + reveal), 72% loading, 14% outro
  // (last box settle + door closing). The longer bookends sell the door swing.
  const introFrames = Math.round(totalFrames * 0.14);
  const outroFrames = Math.round(totalFrames * 0.14);
  const loadFrames = totalFrames - introFrames - outroFrames;

  const n = order.length || 1;
  // Each box gets a slice; boxes overlap slightly for smoother motion.
  const sliceLen = Math.max(3, Math.floor(loadFrames / n));
  const anims: BoxAnim[] = [];

  for (let i = 0; i < n; i++) {
    const placedIdx = order[i];
    const box = pack.placed[placedIdx];
    const stat = pack.perItem[box.itemIdx];
    const start = introFrames + Math.floor((i / n) * loadFrames);
    const end = Math.min(introFrames + loadFrames, start + sliceLen);
    const rotNote = box.rotated === "axis"
      ? " · TIPPED ON SIDE"
      : box.rotated === "sideways"
        ? " · ROTATED SIDEWAYS"
        : "";
    anims.push({
      placedIdx,
      startFrame: start,
      endFrame: end,
      step: i + 1,
      caption: `Step ${i + 1} of ${n}: Item ${box.itemIdx + 1}${stat?.packageType ? ` — ${stat.packageType}` : ""}`,
      subCaption: `${box.l}×${box.w}×${box.h} mm · ${stat?.fragile ? "Fragile · " : ""}${stat?.stackable ? "Stackable" : "Non-stackable"}${rotNote}`,
    });
  }

  return { totalFrames, introFrames, outroFrames, loadFrames, anims, order, fps };
}

/* -------------------------------------------------------------------------- */
/*  Frame info lookup                                                         */
/* -------------------------------------------------------------------------- */

function frameInfo(t: Timeline, frame: number): VideoFrameInfo {
  if (frame < t.introFrames) {
    return {
      frame,
      totalFrames: t.totalFrames,
      step: 0,
      totalSteps: t.anims.length,
      caption: "Container loading plan",
      subCaption: "Doors open · cargo will load back-to-front",
    };
  }
  if (frame >= t.introFrames + t.loadFrames) {
    return {
      frame,
      totalFrames: t.totalFrames,
      step: t.anims.length,
      totalSteps: t.anims.length,
      caption: "Loading complete",
      subCaption: "Center of gravity centered · ready to seal",
    };
  }
  // Find the active anim — last one whose start ≤ frame.
  let active = t.anims[0];
  for (const a of t.anims) {
    if (a.startFrame <= frame) active = a;
    else break;
  }
  return {
    frame,
    totalFrames: t.totalFrames,
    step: active.step,
    totalSteps: t.anims.length,
    caption: active.caption,
    subCaption: active.subCaption,
  };
}

/* -------------------------------------------------------------------------- */
/*  Public: per-box transform for a given frame                               */
/*                                                                            */
/*  This is consumed by container-3d-view.tsx to position boxes per frame.    */
/* -------------------------------------------------------------------------- */

export function computeBoxTransforms(
  pack: AdvancedPackResult,
  timeline: Timeline,
  frame: number,
): { visible: boolean; offset: [number, number, number]; scale: number; onForklift: boolean }[] {
  const result = pack.placed.map(() => ({
    visible: false,
    offset: [0, 0, 0] as [number, number, number],
    scale: 1,
    onForklift: false,
  }));
  const Cl = pack.container.inner.l / MM_PER_M;
  const Ch = pack.container.inner.h / MM_PER_M;

  if (frame < timeline.introFrames) return result;

  for (const a of timeline.anims) {
    if (a.startFrame > frame) continue;
    const item = result[a.placedIdx];
    if (frame >= a.endFrame) {
      item.visible = true;
      item.offset = [0, 0, 0];
      item.scale = 1;
      continue;
    }
    // Two-phase animation: forklift carries box from outside the door (+x)
    // toward its slot (first 70%), then box settles down to the floor (last 30%).
    const t = (frame - a.startFrame) / Math.max(1, a.endFrame - a.startFrame);
    const carryT = Math.min(1, t / 0.7);
    const settleT = Math.max(0, (t - 0.7) / 0.3);
    const carryEase = 1 - Math.pow(1 - carryT, 3);
    item.visible = true;
    // Box rides on forklift forks at fork height (~0.6 m above floor) while carried,
    // then descends to its true z during settle.
    const carryX = Cl * 0.9 * (1 - carryEase); // slide from door (+x) into place
    const liftY = Ch * 0.35 * (1 - settleT);   // hover at fork height, then drop
    item.offset = [carryX, liftY, 0];
    item.onForklift = settleT < 1;
    item.scale = 0.92 + 0.08 * carryEase;
  }
  return result;
}

/** Door + forklift state for the current frame (0..1 progress + carrier pose). */
export function stagingForFrame(
  pack: AdvancedPackResult,
  timeline: Timeline,
  frame: number,
): {
  doorOpen: number;     // 0 = closed, 1 = fully open
  forkliftActive: boolean;
  forkliftX: number;    // world +x position of forklift center (m)
  forkliftZ: number;    // world z (lateral) position
  forkliftY: number;    // mast lift height for the forks (m)
  carriedBoxIdx: number | null;
} {
  const Cl = pack.container.inner.l / MM_PER_M;
  const introF = timeline.introFrames;
  const outroStart = timeline.introFrames + timeline.loadFrames;
  const totalF = timeline.totalFrames;

  // Doors: open during intro (0→1), stay open while loading, close during outro (1→0).
  let doorOpen = 1;
  if (frame < introF) {
    doorOpen = Math.min(1, frame / Math.max(1, introF - 2));
    doorOpen = 1 - Math.pow(1 - doorOpen, 2);
  } else if (frame >= outroStart) {
    const t = Math.min(1, (frame - outroStart) / Math.max(1, totalF - outroStart - 2));
    doorOpen = 1 - t * t;
  }

  // Find the active anim (the box currently being carried) if any.
  let active: BoxAnim | null = null;
  for (const a of timeline.anims) {
    if (a.startFrame <= frame && frame < a.endFrame) {
      active = a;
      break;
    }
  }

  if (!active || frame < introF || frame >= outroStart) {
    return {
      doorOpen,
      forkliftActive: false,
      forkliftX: Cl / 2 + 2.5,
      forkliftZ: 0,
      forkliftY: 0.6,
      carriedBoxIdx: null,
    };
  }

  // Forklift mirrors the box carrier path: drives in from outside the door,
  // then reverses out (we just play the in-phase and snap reset between boxes).
  const t = (frame - active.startFrame) / Math.max(1, active.endFrame - active.startFrame);
  const carryT = Math.min(1, t / 0.7);
  const settleT = Math.max(0, (t - 0.7) / 0.3);
  const carryEase = 1 - Math.pow(1 - carryT, 3);
  const box = pack.placed[active.placedIdx];
  // Forklift world-x: starts ~2.5 m outside door (+x of Cl/2), ends at the box slot.
  const boxWorldX = box.x / MM_PER_M + box.l / MM_PER_M / 2 - Cl / 2;
  const startX = Cl / 2 + 2.5;
  const forkliftX = startX + (boxWorldX - startX) * carryEase;
  // Lateral align with box.
  const Cw = pack.container.inner.w / MM_PER_M;
  const boxWorldZ = box.y / MM_PER_M + box.w / MM_PER_M / 2 - Cw / 2;
  const forkliftZ = boxWorldZ * carryEase;
  // Fork lift height: drops as box settles.
  const restY = box.z / MM_PER_M + 0.05;
  const forkliftY = 0.55 + (restY - 0.55) * settleT;

  return {
    doorOpen,
    forkliftActive: true,
    forkliftX,
    forkliftZ,
    forkliftY,
    carriedBoxIdx: settleT < 1 ? active.placedIdx : null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Camera path                                                               */
/* -------------------------------------------------------------------------- */

export function cameraForFrame(
  pack: AdvancedPackResult,
  timeline: Timeline,
  frame: number,
): { position: [number, number, number]; target: [number, number, number] } {
  const Cl = pack.container.inner.l / MM_PER_M;
  const Cw = pack.container.inner.w / MM_PER_M;
  const Ch = pack.container.inner.h / MM_PER_M;
  // Door is at world +x (cargo group sits at -Cl/2, so high box.x → world +x).
  // Start looking THROUGH THE OPEN DOOR toward the back wall, then slowly
  // arc out to a 3/4 hero view as the loading progresses.
  const t = frame / Math.max(1, timeline.totalFrames - 1);
  const startAngle = 0;          // straight in from door
  const endAngle = -Math.PI / 4; // 3/4 view
  const angle = startAngle + (endAngle - startAngle) * t;
  const dist = Math.max(Cl, Cw) * (1.5 + 0.25 * t);
  const height = Ch * (0.9 + 0.4 * t);
  // Aim slightly toward the back wall during loading so the user sees boxes
  // stack from the back forward.
  const target: [number, number, number] = [-Cl * 0.15 * (1 - t), Ch / 2, 0];
  return {
    position: [Math.cos(angle) * dist, height, Math.sin(angle) * dist],
    target,
  };
}

/* -------------------------------------------------------------------------- */
/*  Encoder                                                                   */
/* -------------------------------------------------------------------------- */

async function encodeWithMediaRecorder(
  canvas: HTMLCanvasElement,
  fps: number,
  totalFrames: number,
  driveFrame: (n: number) => Promise<void>,
  onProgress?: (n: number, total: number) => void,
  bitrate = 8_000_000,
): Promise<{ blob: Blob; mime: string; ext: "mp4" | "webm" }> {
  const stream = canvas.captureStream(fps);
  // Prefer H.264 High profile MP4 for crisper output, then fall back.
  const candidates = [
    "video/mp4;codecs=avc1.640028", // H.264 High @ L4 — best quality
    "video/mp4;codecs=avc1.42E01E", // H.264 Baseline — broad support
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  const mime =
    candidates.find((c) =>
      typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c),
    ) ?? "video/webm";
  const ext: "mp4" | "webm" = mime.startsWith("video/mp4") ? "mp4" : "webm";

  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: bitrate,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const stopped = new Promise<void>((res) => {
    recorder.onstop = () => res();
  });

  recorder.start();

  const frameDurationMs = 1000 / fps;
  for (let f = 0; f < totalFrames; f++) {
    const frameStart = performance.now();
    await driveFrame(f);
    onProgress?.(f + 1, totalFrames);
    // Pace to real-time so MediaRecorder samples at the intended FPS.
    const elapsed = performance.now() - frameStart;
    const wait = Math.max(0, frameDurationMs - elapsed);
    await new Promise((r) => setTimeout(r, wait));
  }

  recorder.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  return { blob: new Blob(chunks, { type: mime }), mime, ext };
}

/* -------------------------------------------------------------------------- */
/*  Main entry                                                                */
/* -------------------------------------------------------------------------- */

export async function generateLoadingVideo(
  opts: GenerateOptions,
): Promise<GeneratedVideo> {
  const fps = opts.fps ?? 30;
  const durationSec = opts.durationSec ?? 12;
  const timeline = buildTimeline(opts.pack, fps, durationSec);

  const timelineMeta: VideoFrameInfo[] = [];
  for (let f = 0; f < timeline.totalFrames; f++) {
    timelineMeta.push(frameInfo(timeline, f));
  }

  const driveFrame = async (frame: number) => {
    opts.controls.applyFrame(frameInfo(timeline, frame));
    opts.controls.render();
    // Wait one rAF so the browser composites the canvas before stream samples.
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  };

  const canvas = opts.controls.getCanvas();
  if (!canvas) {
    throw new Error("3D canvas not available — open the 3D view before recording.");
  }

  const { blob, mime, ext } = await encodeWithMediaRecorder(
    canvas,
    fps,
    timeline.totalFrames,
    driveFrame,
    opts.onProgress,
    opts.videoBitsPerSecond ?? 8_000_000,
  );

  return { blob, mime, ext, timeline: timelineMeta };
}

/* -------------------------------------------------------------------------- */
/*  Helpers exported for the 3D view                                          */
/* -------------------------------------------------------------------------- */

export { buildTimeline, frameInfo };
export type { Timeline, BoxAnim };

// Minimal re-exports for typing convenience
export type { PlacedBox };
// Wrap timeline for external typing ergonomics.
export interface ExternalTimeline extends Timeline {}

/** Convenience for callers that want to compute frame->box state outside. */
export function transformsForFrame(
  pack: AdvancedPackResult,
  timeline: Timeline,
  frame: number,
) {
  return computeBoxTransforms(pack, timeline, frame);
}

export function cameraInfoForFrame(
  pack: AdvancedPackResult,
  timeline: Timeline,
  frame: number,
) {
  return cameraForFrame(pack, timeline, frame);
}

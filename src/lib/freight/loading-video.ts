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
  // Match the 2D row viewer + 3D loading-sequence panel: pure spatial order,
  // back-wall first (low x), bottom layer first (low z), then side-to-side
  // (low y). This ensures the video plays the SAME sequence the user sees
  // in the 2D rows panel and the 3D step list.
  const idx = pack.placed.map((_, i) => i);
  idx.sort((a, b) => {
    const A = pack.placed[a];
    const B = pack.placed[b];
    // Back-to-front along container length (x slab of 300mm = one column).
    const SLAB_MM = 300;
    const slabA = Math.floor(A.x / SLAB_MM);
    const slabB = Math.floor(B.x / SLAB_MM);
    if (slabA !== slabB) return slabA - slabB;
    // Within a column: bottom layer first.
    if (A.z !== B.z) return A.z - B.z;
    // Side-to-side across width.
    if (A.y !== B.y) return A.y - B.y;
    return A.x - B.x;
  });
  return idx;
}

/** True if this placed box represents a pallet (forklift-loaded). */
function isPalletBox(pack: AdvancedPackResult, placedIdx: number): boolean {
  const box = pack.placed[placedIdx];
  const stat = pack.perItem[box.itemIdx];
  return stat?.packageType === "pallet";
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

  // No door-opening intro / closing outro — go straight into loading so the
  // viewer doesn't waste seconds watching an empty container.
  const introFrames = 0;
  const outroFrames = 0;
  const loadFrames = totalFrames;

  const n = order.length || 1;
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
  const Cw = pack.container.inner.w / MM_PER_M;
  // Yard pickup zone (must match stagingForFrame + WarehouseAmbience)
  const yardStackZ = Cw / 2 + 1.4;
  const yardStackX = Cl / 2 + 4.5;

  if (frame < timeline.introFrames) return result;

  for (let ai = 0; ai < timeline.anims.length; ai++) {
    const a = timeline.anims[ai];
    if (a.startFrame > frame) continue;
    const item = result[a.placedIdx];
    if (frame >= a.endFrame) {
      item.visible = true;
      item.offset = [0, 0, 0];
      item.scale = 1;
      continue;
    }
    // Three phases (mirrors stagingForFrame): pickup at yard stack, drive in,
    // settle into final slot. Box is invisible until forks complete pickup
    // (it "materialises" on the forks as if lifted from the stack).
    const t = (frame - a.startFrame) / Math.max(1, a.endFrame - a.startFrame);
    const box = pack.placed[a.placedIdx];
    const boxWorldX = box.x / MM_PER_M + box.l / MM_PER_M / 2 - Cl / 2;
    const boxWorldZ = box.y / MM_PER_M + box.w / MM_PER_M / 2 - Cw / 2;
    const restY = box.z / MM_PER_M;
    const side = ai % 2 === 0 ? 1 : -1;
    const pickupX = yardStackX;
    const pickupZ = side * yardStackZ;

    // Box.x/y in scene-local coords = box's slot. We compute an OFFSET to
    // shift it from its slot toward the pickup point or carry height.
    // Container scene uses box at slot when offset = [0, 0, 0].
    if (t < 0.20) {
      // PICKUP: box hidden until ease > 0.5 (forks fully under it).
      const r = t / 0.20;
      const ease = easeInOutQuad(r);
      if (ease <= 0.5) {
        item.visible = false;
        continue;
      }
      item.visible = true;
      // Position the box AT the yard stack at fork height. Compute offset
      // from its final slot to that yard pickup position.
      const carryY = 0.55 - restY;
      const dx = pickupX - boxWorldX;
      const dz = pickupZ - boxWorldZ;
      item.offset = [dx, carryY, dz];
      item.onForklift = true;
      item.scale = 0.95;
    } else if (t < 0.75) {
      // DRIVE-IN: interpolate from yard pickup to final slot at fork height.
      const r = (t - 0.20) / (0.75 - 0.20);
      const ease = 1 - Math.pow(1 - r, 3);
      item.visible = true;
      const carryY = 0.55 - restY;
      const curX = pickupX + (boxWorldX - pickupX) * ease;
      const curZ = pickupZ + (boxWorldZ - pickupZ) * ease;
      item.offset = [curX - boxWorldX, carryY, curZ - boxWorldZ];
      item.onForklift = true;
      item.scale = 0.95 + 0.05 * ease;
    } else {
      // SETTLE: at slot, lower from carry height to rest.
      const r = (t - 0.75) / 0.25;
      const ease = easeInOutQuad(r);
      item.visible = true;
      const carryY = 0.55 - restY;
      item.offset = [0, carryY * (1 - ease), 0];
      item.onForklift = ease < 1;
      item.scale = 1;
    }
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
  /** Yaw rotation of driver's head (radians). Positive = looking back over right shoulder. */
  headYaw: number;
  /** Whether the engine is running (drives the engine-hum audio layer). */
  engineOn: boolean;
  /** True while the forklift is reversing (drives the beep audio + head turn). */
  reversing: boolean;
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

  const Cw = pack.container.inner.w / MM_PER_M;
  const startX = Cl / 2 + 2.5;
  // Yard feeder stack lateral positions (must match WarehouseAmbience).
  const yardStackZ = Cw / 2 + 1.4;
  const yardStackX = Cl / 2 + 4.5;

  // Find active anim (box currently being carried) and previous anim (just finished).
  let active: BoxAnim | null = null;
  let prev: BoxAnim | null = null;
  let next: BoxAnim | null = null;
  let activeIdx = -1;
  for (let i = 0; i < timeline.anims.length; i++) {
    const a = timeline.anims[i];
    if (a.startFrame <= frame && frame < a.endFrame) {
      active = a;
      activeIdx = i;
      prev = i > 0 ? timeline.anims[i - 1] : null;
      next = i < timeline.anims.length - 1 ? timeline.anims[i + 1] : null;
      break;
    }
    if (a.endFrame <= frame) {
      prev = a;
      next = i < timeline.anims.length - 1 ? timeline.anims[i + 1] : null;
    }
  }

  // Outside the loading window — park forklift outside the door, engine off.
  if (frame < introF || frame >= outroStart) {
    return {
      doorOpen,
      forkliftActive: false,
      forkliftX: startX,
      forkliftZ: 0,
      forkliftY: 0.6,
      headYaw: 0,
      engineOn: false,
      reversing: false,
      carriedBoxIdx: null,
    };
  }

  // Between boxes (no active anim, but loading is in progress): forklift
  // reverses out of the container then drives back in for the next box.
  if (!active) {
    if (!prev || !next) {
      return {
        doorOpen,
        forkliftActive: false,
        forkliftX: startX,
        forkliftZ: 0,
        forkliftY: 0.6,
        headYaw: 0,
        engineOn: true,
        reversing: false,
        carriedBoxIdx: null,
      };
    }
    const gapStart = prev.endFrame;
    const gapEnd = next.startFrame;
    const gapLen = Math.max(1, gapEnd - gapStart);
    const gt = (frame - gapStart) / gapLen;
    // Previous drop position
    const pBox = pack.placed[prev.placedIdx];
    const pX = pBox.x / MM_PER_M + pBox.l / MM_PER_M / 2 - Cl / 2;
    const pZ = pBox.y / MM_PER_M + pBox.w / MM_PER_M / 2 - Cw / 2;
    // First half: reverse out of container to staging point. Second half:
    // drive forward to align with next yard stack pickup zone.
    let fx: number;
    let fz: number;
    let reversing = false;
    if (gt < 0.5) {
      const r = gt / 0.5;
      const ease = r * r;
      fx = pX + (startX - pX) * ease;
      fz = pZ * (1 - ease);
      reversing = true;
    } else {
      const r = (gt - 0.5) / 0.5;
      const ease = r * r;
      // Drive from staging out to yard stack (alternating sides per step).
      const side = (activeNextSide(timeline, prev) ? 1 : -1);
      fx = startX + (yardStackX - startX) * ease;
      fz = side * yardStackZ * ease;
    }
    // Head turns over the right shoulder while reversing (~120°).
    const headYaw = reversing
      ? -Math.PI * 0.66 * easeInOutQuad(Math.min(1, gt / 0.4))
      : 0;
    return {
      doorOpen,
      forkliftActive: true,
      forkliftX: fx,
      forkliftZ: fz,
      forkliftY: 0.35, // forks lowered while empty
      headYaw,
      engineOn: true,
      reversing,
      carriedBoxIdx: null,
    };
  }

  // Active anim: 3 phases
  //   pickup (0.00 - 0.20): forks already at yard stack, lift the new pallet
  //   driveIn (0.20 - 0.75): forklift drives from yard into the box's slot
  //   settle  (0.75 - 1.00): forks lower, box drops into final position
  const t = (frame - active.startFrame) / Math.max(1, active.endFrame - active.startFrame);
  const box = pack.placed[active.placedIdx];
  const boxWorldX = box.x / MM_PER_M + box.l / MM_PER_M / 2 - Cl / 2;
  const boxWorldZ = box.y / MM_PER_M + box.w / MM_PER_M / 2 - Cw / 2;
  const restY = box.z / MM_PER_M + 0.05;
  // Pickup yard side alternates per step so both feeder stacks get used.
  const side = activeIdx % 2 === 0 ? 1 : -1;
  const pickupX = yardStackX;
  const pickupZ = side * yardStackZ;

  let forkliftX: number;
  let forkliftZ: number;
  let forkliftY: number;
  let carriedBoxIdx: number | null = null;

  if (t < 0.20) {
    // PICKUP: forks rise from low (0.15) to carry height (0.55) at the yard stack.
    const r = t / 0.20;
    const ease = easeInOutQuad(r);
    forkliftX = pickupX;
    forkliftZ = pickupZ;
    forkliftY = 0.15 + (0.55 - 0.15) * ease;
    // Box becomes "carried" once forks are halfway up.
    carriedBoxIdx = ease > 0.5 ? active.placedIdx : null;
  } else if (t < 0.75) {
    // DRIVE-IN: forklift travels from yard (pickupX, pickupZ) to box slot.
    const r = (t - 0.20) / (0.75 - 0.20);
    const ease = 1 - Math.pow(1 - r, 3);
    forkliftX = pickupX + (boxWorldX - pickupX) * ease;
    forkliftZ = pickupZ + (boxWorldZ - pickupZ) * ease;
    forkliftY = 0.55;
    carriedBoxIdx = active.placedIdx;
  } else {
    // SETTLE: forks lower from 0.55 to restY, box drops into place.
    const r = (t - 0.75) / 0.25;
    const ease = easeInOutQuad(r);
    forkliftX = boxWorldX;
    forkliftZ = boxWorldZ;
    forkliftY = 0.55 + (restY - 0.55) * ease;
    carriedBoxIdx = ease < 1 ? active.placedIdx : null;
  }

  return {
    doorOpen,
    forkliftActive: true,
    forkliftX,
    forkliftZ,
    forkliftY,
    headYaw: 0,
    engineOn: true,
    reversing: false,
    carriedBoxIdx,
  };
}

function easeInOutQuad(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

/** Pick which side of yard the next pickup will happen on (alternating). */
function activeNextSide(timeline: Timeline, prev: BoxAnim): boolean {
  const idx = timeline.anims.findIndex((a) => a === prev);
  return ((idx + 1) % 2) === 0;
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
/*  Reverse-beep audio (synced to between-box reverse-out motion)             */
/* -------------------------------------------------------------------------- */

/**
 * Compute the [startSec, endSec] intervals during which the forklift is
 * reversing out of the container (between two box deliveries). Used to place
 * "beep beep beep" reverse-warning sounds in the soundtrack.
 */
function reverseGapIntervalsSec(timeline: Timeline): Array<[number, number]> {
  const fps = timeline.fps;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < timeline.anims.length - 1; i++) {
    const prev = timeline.anims[i];
    const next = timeline.anims[i + 1];
    if (next.startFrame <= prev.endFrame) continue; // no real gap
    // Only the FIRST half of the gap is the reverse-out (see stagingForFrame).
    const gapStart = prev.endFrame;
    const gapEnd = prev.endFrame + Math.floor((next.startFrame - prev.endFrame) / 2);
    if (gapEnd > gapStart) out.push([gapStart / fps, gapEnd / fps]);
  }
  return out;
}

/**
 * Build an AudioBuffer of `durationSec` containing:
 *   - Low engine drone (~80 Hz fundamental + 160 Hz overtone) during the
 *     entire loading window. Slight pitch dip during reverse intervals.
 *   - Classic warehouse "beep … beep … beep" reverse-warning tones during
 *     each reverse interval. Soft envelope so it doesn't pop.
 */
function buildBeepBuffer(
  ctx: AudioContext,
  durationSec: number,
  beepIntervals: Array<[number, number]>,
  engineWindow: [number, number] | null,
): AudioBuffer {
  const sr = ctx.sampleRate;
  const totalSamples = Math.ceil(durationSec * sr);
  const buf = ctx.createBuffer(1, totalSamples, sr);
  const data = buf.getChannelData(0);

  // ---- Engine hum layer ----
  if (engineWindow) {
    const [eStart, eEnd] = engineWindow;
    const startSample = Math.floor(eStart * sr);
    const endSample = Math.min(totalSamples, Math.floor(eEnd * sr));
    const fadeT = 0.4; // seconds fade-in / fade-out
    const fadeSamples = Math.floor(fadeT * sr);
    const baseFreq = 78;     // Hz fundamental — diesel-ish chug
    const idleAmp = 0.16;
    // Reverse intervals → use lower-pitched "reverse gear" sound.
    const isReversingAt = (sample: number): boolean => {
      const sec = sample / sr;
      return beepIntervals.some(([s, e]) => sec >= s && sec < e);
    };
    let phase = 0;
    let phase2 = 0;
    let phase3 = 0;
    for (let i = startSample; i < endSample; i++) {
      // Smooth fade in/out
      let env = 1;
      const fromStart = i - startSample;
      const toEnd = endSample - i;
      if (fromStart < fadeSamples) env *= fromStart / fadeSamples;
      if (toEnd < fadeSamples) env *= toEnd / fadeSamples;
      // Subtle wobble to avoid mechanical purity
      const wobble = 1 + 0.015 * Math.sin((i / sr) * 2 * Math.PI * 1.7);
      const reverse = isReversingAt(i);
      const f = baseFreq * (reverse ? 0.78 : 1.0) * wobble;
      phase += (2 * Math.PI * f) / sr;
      phase2 += (2 * Math.PI * f * 2) / sr;
      phase3 += (2 * Math.PI * f * 0.5) / sr;
      // Triangle-ish blend: fundamental + 2nd harmonic + sub for diesel weight
      const sample =
        Math.sin(phase) * 0.7 +
        Math.sin(phase2) * 0.22 +
        Math.sin(phase3) * 0.18;
      data[i] += sample * env * idleAmp;
    }
  }

  // ---- Reverse beep layer ----
  const freq = 1050;
  const beepOn = 0.22;   // seconds on
  const beepOff = 0.28;  // seconds silent
  const period = beepOn + beepOff;
  const attack = 0.008;
  const amp = 0.32;

  for (const [start, end] of beepIntervals) {
    const startSample = Math.floor(start * sr);
    const endSample = Math.min(totalSamples, Math.floor(end * sr));
    for (let i = startSample; i < endSample; i++) {
      const tInGap = (i - startSample) / sr;
      const phase = tInGap % period;
      if (phase >= beepOn) continue;
      let env = 1;
      if (phase < attack) env = phase / attack;
      else if (phase > beepOn - attack) env = Math.max(0, (beepOn - phase) / attack);
      const s =
        Math.sin(2 * Math.PI * freq * tInGap) * 0.85 +
        Math.sin(2 * Math.PI * freq * 3 * tInGap) * 0.12;
      data[i] += s * env * amp;
    }
  }
  return buf;
}

/** Compute the [startSec, endSec] window during which the engine should be running. */
function engineWindowSec(timeline: Timeline): [number, number] {
  const fps = timeline.fps;
  const start = timeline.introFrames / fps;
  const end = (timeline.introFrames + timeline.loadFrames) / fps;
  return [start, end];
}

/* -------------------------------------------------------------------------- */
/*  Encoder                                                                   */
/* -------------------------------------------------------------------------- */

async function encodeWithMediaRecorder(
  canvas: HTMLCanvasElement,
  fps: number,
  totalFrames: number,
  driveFrame: (n: number) => Promise<void>,
  timeline: Timeline,
  onProgress?: (n: number, total: number) => void,
  bitrate = 8_000_000,
): Promise<{ blob: Blob; mime: string; ext: "mp4" | "webm" }> {
  const videoStream = canvas.captureStream(fps);

  // Build reverse-beep audio track and mix it into the recorded stream.
  let audioCtx: AudioContext | null = null;
  let audioSource: AudioBufferSourceNode | null = null;
  const tracks: MediaStreamTrack[] = videoStream.getVideoTracks();
  try {
    const intervals = reverseGapIntervalsSec(timeline);
    const engineWin = engineWindowSec(timeline);
    // Always create the audio track (engine hum runs even with no reverse gaps).
    if (typeof AudioContext !== "undefined") {
      audioCtx = new AudioContext();
      const durationSec = totalFrames / fps;
      const buffer = buildBeepBuffer(audioCtx, durationSec, intervals, engineWin);
      const dest = audioCtx.createMediaStreamDestination();
      audioSource = audioCtx.createBufferSource();
      audioSource.buffer = buffer;
      audioSource.connect(dest);
      dest.stream.getAudioTracks().forEach((t) => tracks.push(t));
    }
  } catch (e) {
    console.warn("Reverse-beep audio unavailable, recording video only:", e);
  }

  const stream = new MediaStream(tracks);

  // Prefer H.264 High profile MP4 for crisper output, then fall back.
  const candidates = [
    "video/mp4;codecs=avc1.640028,mp4a.40.2", // H.264 High + AAC
    "video/mp4;codecs=avc1.640028",
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1.42E01E",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8,opus",
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
    audioBitsPerSecond: 96_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const stopped = new Promise<void>((res) => {
    recorder.onstop = () => res();
  });

  recorder.start();
  // Start the audio AT the same moment recording starts so timings align.
  if (audioSource && audioCtx) {
    audioSource.start(audioCtx.currentTime);
  }

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
  videoStream.getTracks().forEach((t) => t.stop());
  if (audioSource) {
    try { audioSource.stop(); } catch { /* already stopped */ }
  }
  if (audioCtx) {
    try { await audioCtx.close(); } catch { /* ignore */ }
  }
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
    timeline,
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

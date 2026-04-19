/**
 * True 3D interactive container loader using react-three-fiber.
 * - Drag to orbit, scroll/pinch to zoom, double-click to reset.
 * - Camera presets (Iso, Front, Side, Top, Inside).
 * - Translucent container walls so cargo is always visible.
 * - Soft shadows + ambient lighting.
 * - Exposes a snapshot API (via ref) returning PNG dataURLs for the PDF.
 * - Exposes a frame-recording API (applyFrame / render / getCanvas) used by
 *   the loading-video generator.
 *
 * Lazy-loaded by container-load-view.tsx (client-only).
 */
import { Suspense, forwardRef, useImperativeHandle, useMemo, useRef, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Edges, Grid, Html } from "@react-three/drei";
import { Maximize2, Minimize2 } from "lucide-react";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFullscreen } from "@/hooks/use-fullscreen";
import type { AdvancedPackResult } from "@/lib/freight/packing-advanced";
import type { PlacedBox } from "@/lib/freight/packing";
import type { RowGroup } from "@/lib/freight/loading-rows";
import {
  buildTimeline,
  cameraInfoForFrame,
  stagingForFrame,
  transformsForFrame,
  type Timeline,
  type VideoFrameInfo,
} from "@/lib/freight/loading-video";

type Preset = "iso" | "front" | "side" | "top" | "inside";

export interface Container3DHandle {
  /** Capture a PNG dataURL from each preset angle. Used by PDF export. */
  captureAngles: () => Promise<{ iso: string; front: string; side: string }>;
  /** Frame-level recording controls used by the loading-video generator. */
  beginRecording: (fps: number, durationSec: number) => Timeline;
  endRecording: () => void;
  applyFrame: (info: VideoFrameInfo) => void;
  render: () => void;
  getCanvas: () => HTMLCanvasElement | null;
  /** Temporarily resize the WebGL drawing buffer (for HD video capture). */
  setRenderSize: (width: number, height: number) => void;
  /** Restore the renderer's drawing buffer to match the on-screen canvas size. */
  restoreRenderSize: () => void;
}

interface Props {
  pack: AdvancedPackResult;
  height?: number;
  /**
   * Per-box width-axis preview offset (placedIdx → metres along scene-z, the
   * container's width). Applied additively to every matched box so loaders
   * can visualise a "Suggested re-shuffle" before doing it physically.
   */
  shufflePreview?: Map<number, number> | null;
  /**
   * When provided, only boxes whose `placedIdx` is in this set are rendered.
   * Used by the manual row-stepper to reveal rows one at a time, back wall
   * → door. Pass `null` to show every box (default).
   */
  visiblePlacedSet?: Set<number> | null;
  /**
   * Hide the swing doors entirely. Useful while stepping rows or recording —
   * an open door at 135° still occludes the camera from many iso angles.
   */
  hideDoors?: boolean;
  /**
   * When set, paint translucent red void rectangles on the floor and back
   * wall of this row's slice so loaders can see exactly where dunnage or a
   * re-shuffle is needed. Cleared when null.
   */
  gapHeatmapRow?: RowGroup | null;
  /**
   * placedIdx of boxes that should fly in from the door this reveal. Boxes in
   * this set animate from a staging position (high + toward the door) to their
   * slot over ~600ms. Boxes NOT in this set render in place (already loaded).
   */
  flyInPlacedSet?: Set<number> | null;
  /**
   * Increments each time a new row is revealed — forces CargoBox to restart
   * its fly-in animation even if the same set reference is passed.
   */
  flyInKey?: number;
}

/**
 * We work in metres in the scene (mm / 1000) so the camera distances are sane.
 */
const MM_PER_M = 1000;

export const Container3DView = forwardRef<Container3DHandle, Props>(function Container3DView(
  { pack, height = 420, shufflePreview = null, visiblePlacedSet = null, hideDoors = false, gapHeatmapRow = null },
  ref,
) {
  const [preset, setPreset] = useState<Preset>("iso");
  const [recordingTimeline, setRecordingTimeline] = useState<Timeline | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // Container dims in metres.
  const Cm = useMemo(
    () => ({
      l: pack.container.inner.l / MM_PER_M,
      w: pack.container.inner.w / MM_PER_M,
      h: pack.container.inner.h / MM_PER_M,
    }),
    [pack.container.inner.l, pack.container.inner.w, pack.container.inner.h],
  );

  // Snapshot helper — render an offscreen canvas at fixed angle and return PNG.
  useImperativeHandle(ref, () => ({
    async captureAngles() {
      const angles: Record<"iso" | "front" | "side", string> = {
        iso: "",
        front: "",
        side: "",
      };
      const gl = glRef.current;
      const scene = sceneRef.current;
      const cam = cameraRef.current;
      if (!gl || !scene || !cam) return angles;

      const original = cam.position.clone();
      const originalTarget = new THREE.Vector3(0, Cm.h / 2, 0);

      const positions: Record<keyof typeof angles, THREE.Vector3> = {
        iso: new THREE.Vector3(Cm.l * 0.9, Cm.h * 1.4, Cm.w * 1.6),
        front: new THREE.Vector3(0, Cm.h / 2, Cm.w * 2.2),
        side: new THREE.Vector3(Cm.l * 1.6, Cm.h / 2, 0),
      };

      for (const key of Object.keys(positions) as Array<keyof typeof angles>) {
        cam.position.copy(positions[key]);
        cam.lookAt(originalTarget);
        gl.render(scene, cam);
        angles[key] = gl.domElement.toDataURL("image/png");
      }
      cam.position.copy(original);
      cam.lookAt(originalTarget);
      gl.render(scene, cam);
      return angles;
    },
    beginRecording(fps: number, durationSec: number) {
      const t = buildTimeline(pack, fps, durationSec);
      setRecordingTimeline(t);
      setCurrentFrame(0);
      return t;
    },
    endRecording() {
      setRecordingTimeline(null);
      setCurrentFrame(0);
    },
    applyFrame(info: VideoFrameInfo) {
      setCurrentFrame(info.frame);
      const cam = cameraRef.current;
      if (!cam || !recordingTimeline) return;
      const camInfo = cameraInfoForFrame(pack, recordingTimeline, info.frame);
      cam.position.set(...camInfo.position);
      cam.lookAt(...camInfo.target);
    },
    render() {
      const gl = glRef.current;
      const scene = sceneRef.current;
      const cam = cameraRef.current;
      if (gl && scene && cam) gl.render(scene, cam);
    },
    getCanvas() {
      return glRef.current?.domElement ?? null;
    },
    setRenderSize(width: number, height: number) {
      const gl = glRef.current;
      const cam = cameraRef.current;
      if (!gl || !cam) return;
      // false = don't update CSS size; keep on-screen layout stable.
      gl.setSize(width, height, false);
      cam.aspect = width / height;
      cam.updateProjectionMatrix();
    },
    restoreRenderSize() {
      const gl = glRef.current;
      const cam = cameraRef.current;
      if (!gl || !cam) return;
      const el = gl.domElement;
      const w = el.clientWidth || el.width;
      const h = el.clientHeight || el.height;
      gl.setSize(w, h, false);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    },
  }));

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(wrapperRef);

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "relative overflow-hidden rounded-lg border bg-background",
        isFullscreen && "h-screen w-screen rounded-none border-none [&_canvas]:!h-full [&_canvas]:!w-full",
      )}
      style={isFullscreen ? undefined : { height }}
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        camera={{ position: [Cm.l * 0.9, Cm.h * 1.4, Cm.w * 1.6], fov: 35 }}
        onCreated={({ gl, scene, camera }) => {
          glRef.current = gl;
          sceneRef.current = scene;
          cameraRef.current = camera as THREE.PerspectiveCamera;
          scene.background = makeSkyTexture();
          scene.fog = new THREE.Fog(0xb8c2cc, Cm.l * 4, Cm.l * 14);
        }}
      >
        <Suspense fallback={<Html center>Loading 3D…</Html>}>
          <SceneContents
            pack={pack}
            Cm={Cm}
            preset={preset}
            recording={recordingTimeline}
            frame={currentFrame}
            shufflePreview={shufflePreview}
            visiblePlacedSet={visiblePlacedSet}
            hideDoors={hideDoors}
            gapHeatmapRow={gapHeatmapRow}
          />
        </Suspense>
      </Canvas>

      {/* Camera preset buttons */}
      <div className="absolute right-2 top-2 flex flex-col gap-1 rounded-lg bg-background/85 p-1 shadow backdrop-blur">
        {(["iso", "front", "side", "top", "inside"] as Preset[]).map((p) => (
          <Button
            key={p}
            type="button"
            size="sm"
            variant={preset === p ? "default" : "ghost"}
            onClick={() => setPreset(p)}
            className={cn(
              "h-7 px-2 text-[11px] capitalize",
              preset === p
                ? "bg-brand-navy text-white hover:bg-brand-navy/90"
                : "text-brand-navy hover:bg-brand-navy/10",
            )}
          >
            {p}
          </Button>
        ))}
      </div>

      {/* Fullscreen toggle */}
      <button
        type="button"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? "Exit fullscreen" : "Open fullscreen"}
        title={isFullscreen ? "Exit fullscreen (Esc)" : "Open fullscreen"}
        className="absolute left-2 top-2 flex size-8 items-center justify-center rounded-md bg-background/85 text-brand-navy shadow backdrop-blur transition-colors hover:bg-background"
      >
        {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
      </button>

      <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-background/80 px-2 py-1 text-[10px] font-medium text-muted-foreground backdrop-blur">
        Drag to rotate · Scroll to zoom · Double-click to reset
      </div>
    </div>
  );
});

/* --------------- Procedural textures (real container look) --------------- */

function makeSkyTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#7ea9c9");
  g.addColorStop(0.55, "#cfd8dc");
  g.addColorStop(0.6, "#8a8378");
  g.addColorStop(1, "#5a534a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 256);
  return new THREE.CanvasTexture(c);
}

function makeCorrugatedTexture(color: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, 64);
  for (let x = 0; x < 256; x += 16) {
    const grad = ctx.createLinearGradient(x, 0, x + 16, 0);
    grad.addColorStop(0, "rgba(0,0,0,0.38)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.2)");
    grad.addColorStop(1, "rgba(0,0,0,0.38)");
    ctx.fillStyle = grad;
    ctx.fillRect(x, 0, 16, 64);
  }
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = i % 2 ? "#5a2e1a" : "#1a1a1a";
    ctx.fillRect(Math.random() * 256, Math.random() * 64, 2, 2);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makePlywoodTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#a07a4e";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i++) {
    ctx.strokeStyle = `rgba(${50 + Math.random() * 40}, ${30 + Math.random() * 20}, 10, ${0.18 + Math.random() * 0.2})`;
    ctx.lineWidth = 0.5 + Math.random() * 1.2;
    ctx.beginPath();
    const y = Math.random() * 256;
    ctx.moveTo(0, y);
    for (let x = 0; x < 256; x += 8) ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 3);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  for (let y = 0; y < 256; y += 64) ctx.fillRect(0, y, 256, 1);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/* --------------- Scene contents --------------- */

function SceneContents({
  pack,
  Cm,
  preset,
  recording,
  frame,
  shufflePreview,
  visiblePlacedSet,
  hideDoors,
  gapHeatmapRow,
}: {
  pack: AdvancedPackResult;
  Cm: { l: number; w: number; h: number };
  preset: Preset;
  recording: Timeline | null;
  frame: number;
  shufflePreview: Map<number, number> | null;
  visiblePlacedSet: Set<number> | null;
  hideDoors: boolean;
  gapHeatmapRow: RowGroup | null;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<React.ComponentRef<typeof OrbitControls> | null>(null);
  const target = useMemo(() => new THREE.Vector3(0, Cm.h / 2, 0), [Cm.h]);

  // Apply preset only when not recording (recording drives the camera externally).
  useEffect(() => {
    if (recording) return;
    if (!camera) return;
    const cam = camera as THREE.PerspectiveCamera;
    const positions: Record<Preset, THREE.Vector3> = {
      iso: new THREE.Vector3(Cm.l * 0.9, Cm.h * 1.4, Cm.w * 1.6),
      front: new THREE.Vector3(0, Cm.h / 2, Cm.w * 2.4),
      side: new THREE.Vector3(Cm.l * 1.7, Cm.h / 2, 0.001),
      top: new THREE.Vector3(0.001, Cm.h * 3, 0.001),
      inside: new THREE.Vector3(-Cm.l / 2 + 0.5, Cm.h * 0.6, 0),
    };
    cam.position.copy(positions[preset]);
    cam.lookAt(preset === "inside" ? new THREE.Vector3(Cm.l / 2, Cm.h / 2, 0) : target);
    controlsRef.current?.update?.();
  }, [preset, Cm.l, Cm.w, Cm.h, camera, target, recording]);

  // Per-frame transforms (only when recording).
  const transforms = useMemo(
    () =>
      recording ? transformsForFrame(pack, recording, frame) : null,
    [recording, pack, frame],
  );
  const staging = useMemo(
    () => (recording ? stagingForFrame(pack, recording, frame) : null),
    [recording, pack, frame],
  );
  // When NOT recording, leave doors fully open so the static scene reads as
  // "ready to load" (matches the new realistic shell).
  const doorOpen = staging?.doorOpen ?? 1;

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[Cm.l, Cm.h * 3, Cm.w * 2]}
        intensity={1.1}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <hemisphereLight intensity={0.35} groundColor={"#ddd"} />

      <OrbitControls
        ref={controlsRef}
        target={target}
        enablePan
        enabled={!recording}
        minDistance={Math.max(Cm.l, Cm.w) * 0.3}
        maxDistance={Math.max(Cm.l, Cm.w) * 4}
        maxPolarAngle={Math.PI / 2 - 0.05}
      />

      {/* Tarmac ground extending past the container — sells the "real yard" */}
      <mesh
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.02, 0]}
      >
        <planeGeometry args={[Math.max(Cm.l, Cm.w) * 12, Math.max(Cm.l, Cm.w) * 12]} />
        <meshStandardMaterial color="#6e6660" roughness={0.95} />
      </mesh>
      {/* Subtle parking grid only directly under the container */}
      <Grid
        position={[0, 0.001, 0]}
        args={[Cm.l * 1.4, Cm.w * 1.4]}
        cellSize={0.5}
        cellThickness={0.4}
        sectionSize={1}
        sectionThickness={0.8}
        sectionColor="#3a3530"
        cellColor="#7a716a"
        fadeDistance={Math.max(Cm.l, Cm.w) * 1.6}
        fadeStrength={1.2}
        infiniteGrid={false}
      />

      <WarehouseAmbience Cm={Cm} />

      <ContainerShell Cm={Cm} doorOpen={doorOpen} hideDoors={hideDoors} />

      {/* Cargo */}
      <group position={[-Cm.l / 2, 0, -Cm.w / 2]}>
        {pack.placed.map((b, i) => {
          const t = transforms?.[i];
          if (recording && t && !t.visible) return null;
          // Manual row-stepper: hide boxes whose placedIdx is not in the visible set.
          if (visiblePlacedSet && !visiblePlacedSet.has(i)) return null;
          // Combine per-frame transform offset (recording) with the shuffle
          // preview offset (applied to scene-z, the container width axis).
          const shuffleZ = shufflePreview?.get(i) ?? 0;
          const offset: [number, number, number] = [
            t?.offset[0] ?? 0,
            t?.offset[1] ?? 0,
            (t?.offset[2] ?? 0) + shuffleZ,
          ];
          const isPreviewed = !recording && shuffleZ !== 0;
          return (
            <CargoBox
              key={i}
              box={b}
              stat={pack.perItem[b.itemIdx]}
              offset={offset}
              scale={t?.scale}
              previewHighlight={isPreviewed}
            />
          );
        })}
        {/* Gap heatmap overlay — translucent red rectangles on the floor and
            back wall of the active row's slice. Hidden during recording so
            video frames stay clean. */}
        {!recording && gapHeatmapRow && (
          <GapHeatmap row={gapHeatmapRow} containerW={pack.container.inner.w} containerH={pack.container.inner.h} />
        )}
      </group>

      {/* Forklift — only visible while recording and a box is being carried */}
      {recording && staging?.forkliftActive && (
        <Forklift
          x={staging.forkliftX}
          z={staging.forkliftZ}
          forkY={staging.forkliftY}
          headYaw={staging.headYaw}
        />
      )}

      {/* Dimension labels — hidden during recording for clean video frames */}
      {!recording && (
        <>
          <Html position={[0, -0.2, Cm.w / 2 + 0.3]} center distanceFactor={Math.max(Cm.l, Cm.w) * 1.2}>
            <span className="rounded bg-brand-navy px-1.5 py-0.5 text-[10px] font-medium text-white shadow">
              {(Cm.l).toFixed(2)} m
            </span>
          </Html>
          <Html position={[Cm.l / 2 + 0.3, -0.2, 0]} center distanceFactor={Math.max(Cm.l, Cm.w) * 1.2}>
            <span className="rounded bg-brand-navy px-1.5 py-0.5 text-[10px] font-medium text-white shadow">
              {(Cm.w).toFixed(2)} m
            </span>
          </Html>
          <Html position={[-Cm.l / 2 - 0.3, Cm.h / 2, -Cm.w / 2]} center distanceFactor={Math.max(Cm.l, Cm.w) * 1.2}>
            <span className="rounded bg-brand-navy px-1.5 py-0.5 text-[10px] font-medium text-white shadow">
              {(Cm.h).toFixed(2)} m
            </span>
          </Html>
        </>
      )}
    </>
  );
}

function ContainerShell({
  Cm,
  doorOpen = 1,
  hideDoors = false,
}: {
  Cm: { l: number; w: number; h: number };
  doorOpen?: number;
  /** When true, the swing doors are not rendered at all (frame stays). */
  hideDoors?: boolean;
}) {
  // Real container: corrugated steel walls, plywood floor, painted steel frame.
  // Door is at +x. Two hinged doors swing outward — left hinges at -z corner,
  // right hinges at +z corner. doorOpen: 0 = closed, 1 = wide open (~135°).
  const wallColor = "#2c4a6b";
  const doorColor = "#234058";

  const plywoodTex = useMemo(() => {
    const t = makePlywoodTexture();
    t.repeat.set(Math.max(2, Cm.l / 1.2), Math.max(2, Cm.w / 1.2));
    return t;
  }, [Cm.l, Cm.w]);

  const wallTexX = useMemo(() => {
    const t = makeCorrugatedTexture(wallColor);
    t.repeat.set(Math.max(4, Cm.l / 0.3), Math.max(2, Cm.h / 1.5));
    return t;
  }, [Cm.l, Cm.h]);
  const wallTexZ = useMemo(() => {
    const t = makeCorrugatedTexture(wallColor);
    t.repeat.set(Math.max(2, Cm.w / 0.3), Math.max(2, Cm.h / 1.5));
    return t;
  }, [Cm.w, Cm.h]);
  const doorTex = useMemo(() => {
    const t = makeCorrugatedTexture(doorColor);
    t.repeat.set(Math.max(2, Cm.w / 0.6), Math.max(2, Cm.h / 1.5));
    return t;
  }, [Cm.w, Cm.h]);

  const FRAME = "#1a2433";
  const frameThk = 0.06;

  const corners: Array<[number, number]> = [
    [-Cm.l / 2, -Cm.w / 2],
    [-Cm.l / 2, Cm.w / 2],
    [Cm.l / 2, -Cm.w / 2],
    [Cm.l / 2, Cm.w / 2],
  ];

  const doorW = Cm.w / 2;
  const doorH = Cm.h - 0.08;
  const swing = doorOpen * (Math.PI * 0.75);

  return (
    <group>
      {/* Plywood floor */}
      <mesh receiveShadow position={[0, 0.01, 0]}>
        <boxGeometry args={[Cm.l, 0.02, Cm.w]} />
        <meshStandardMaterial map={plywoodTex} roughness={0.85} />
      </mesh>

      {/* Back wall (-x) — translucent so loaders can see boxes behind it from any angle */}
      <mesh receiveShadow castShadow position={[-Cm.l / 2, Cm.h / 2, 0]}>
        <boxGeometry args={[0.05, Cm.h, Cm.w]} />
        <meshStandardMaterial
          map={wallTexZ}
          roughness={0.7}
          metalness={0.2}
          transparent
          opacity={0.25}
        />
      </mesh>

      {/* Left side wall (-z) — translucent */}
      <mesh receiveShadow position={[0, Cm.h / 2, -Cm.w / 2]}>
        <boxGeometry args={[Cm.l, Cm.h, 0.05]} />
        <meshStandardMaterial
          map={wallTexX}
          roughness={0.7}
          metalness={0.2}
          transparent
          opacity={0.25}
        />
      </mesh>

      {/* Right side wall (+z) — most transparent (typical viewing side) */}
      <mesh position={[0, Cm.h / 2, Cm.w / 2]}>
        <boxGeometry args={[Cm.l, Cm.h, 0.04]} />
        <meshStandardMaterial
          map={wallTexX}
          roughness={0.7}
          metalness={0.2}
          transparent
          opacity={0.1}
        />
      </mesh>

      {/* Roof — translucent */}
      <mesh position={[0, Cm.h, 0]}>
        <boxGeometry args={[Cm.l, 0.04, Cm.w]} />
        <meshStandardMaterial color={wallColor} transparent opacity={0.08} />
      </mesh>

      {/* Steel corner posts */}
      {corners.map(([x, z], i) => (
        <mesh key={`post-${i}`} castShadow position={[x, Cm.h / 2, z]}>
          <boxGeometry args={[frameThk, Cm.h + 0.06, frameThk]} />
          <meshStandardMaterial color={FRAME} roughness={0.5} metalness={0.6} />
        </mesh>
      ))}
      {[-Cm.w / 2, Cm.w / 2].map((z, i) => (
        <mesh key={`top-l-${i}`} position={[0, Cm.h, z]}>
          <boxGeometry args={[Cm.l + 0.06, frameThk, frameThk]} />
          <meshStandardMaterial color={FRAME} roughness={0.5} metalness={0.6} />
        </mesh>
      ))}
      {[-Cm.l / 2, Cm.l / 2].map((x, i) => (
        <mesh key={`top-w-${i}`} position={[x, Cm.h, 0]}>
          <boxGeometry args={[frameThk, frameThk, Cm.w + 0.06]} />
          <meshStandardMaterial color={FRAME} roughness={0.5} metalness={0.6} />
        </mesh>
      ))}
      {[-Cm.w / 2, Cm.w / 2].map((z, i) => (
        <mesh key={`bot-l-${i}`} position={[0, 0, z]}>
          <boxGeometry args={[Cm.l + 0.06, frameThk, frameThk]} />
          <meshStandardMaterial color={FRAME} roughness={0.5} metalness={0.6} />
        </mesh>
      ))}
      {/* Door header */}
      <mesh position={[Cm.l / 2, Cm.h - 0.08, 0]}>
        <boxGeometry args={[0.08, 0.16, Cm.w]} />
        <meshStandardMaterial color={FRAME} roughness={0.5} metalness={0.6} />
      </mesh>

      {/* Hinged DOORS — left panel hinges at -z corner, right at +z corner.
          Hidden entirely when `hideDoors` is set so the camera is never
          occluded while stepping rows or recording video. */}
      {!hideDoors && (
        <>
          <group
            position={[Cm.l / 2, doorH / 2 + 0.04, -Cm.w / 2]}
            rotation={[0, -swing, 0]}
          >
            <mesh castShadow position={[0.025, 0, doorW / 2]}>
              <boxGeometry args={[0.05, doorH, doorW]} />
              <meshStandardMaterial map={doorTex} roughness={0.7} metalness={0.25} />
            </mesh>
            {[doorW * 0.25, doorW * 0.75].map((zz, i) => (
              <mesh key={`bar-l-${i}`} position={[0.06, 0, zz]}>
                <cylinderGeometry args={[0.018, 0.018, doorH * 0.95, 12]} />
                <meshStandardMaterial color="#9aa0a6" metalness={0.8} roughness={0.3} />
              </mesh>
            ))}
            {[-doorH / 3, doorH / 3].map((yy, i) => (
              <mesh key={`hng-l-${i}`} position={[0.04, yy, 0.04]}>
                <boxGeometry args={[0.05, 0.12, 0.06]} />
                <meshStandardMaterial color="#3a3a3a" metalness={0.7} roughness={0.4} />
              </mesh>
            ))}
          </group>

          <group
            position={[Cm.l / 2, doorH / 2 + 0.04, Cm.w / 2]}
            rotation={[0, swing, 0]}
          >
            <mesh castShadow position={[0.025, 0, -doorW / 2]}>
              <boxGeometry args={[0.05, doorH, doorW]} />
              <meshStandardMaterial map={doorTex} roughness={0.7} metalness={0.25} />
            </mesh>
            {[-doorW * 0.25, -doorW * 0.75].map((zz, i) => (
              <mesh key={`bar-r-${i}`} position={[0.06, 0, zz]}>
                <cylinderGeometry args={[0.018, 0.018, doorH * 0.95, 12]} />
                <meshStandardMaterial color="#9aa0a6" metalness={0.8} roughness={0.3} />
              </mesh>
            ))}
            {[-doorH / 3, doorH / 3].map((yy, i) => (
              <mesh key={`hng-r-${i}`} position={[0.04, yy, -0.04]}>
                <boxGeometry args={[0.05, 0.12, 0.06]} />
                <meshStandardMaterial color="#3a3a3a" metalness={0.7} roughness={0.4} />
              </mesh>
            ))}
          </group>
        </>
      )}
    </group>
  );
}

/* --------------- Wooden pallet (under every floor-level box) --------------- */

function WoodenPallet({ lm, wm }: { lm: number; wm: number }) {
  // Pallet look: top deck planks with gaps, 3×3 feet blocks, 3 bottom runners.
  // Height = 12 cm total. Sits centred under the box.
  const TOP = "#b8895a";
  const BOT = "#8a6038";
  const planks = Math.max(5, Math.round(wm / 0.18));
  const plankW = wm / planks;
  return (
    <group position={[0, -0.06, 0]}>
      {Array.from({ length: planks }).map((_, i) => {
        if (i % 2 === 1 && i !== planks - 1) return null;
        const z = -wm / 2 + plankW * (i + 0.5);
        return (
          <mesh key={`p-${i}`} position={[0, 0.05, z]} castShadow receiveShadow>
            <boxGeometry args={[lm * 0.98, 0.022, plankW * 0.85]} />
            <meshStandardMaterial color={TOP} roughness={0.85} />
          </mesh>
        );
      })}
      {[-lm * 0.4, 0, lm * 0.4].map((px, ix) =>
        [-wm * 0.4, 0, wm * 0.4].map((pz, iz) => (
          <mesh key={`b-${ix}-${iz}`} position={[px, 0, pz]} castShadow>
            <boxGeometry args={[lm * 0.12, 0.06, wm * 0.12]} />
            <meshStandardMaterial color={BOT} roughness={0.9} />
          </mesh>
        )),
      )}
      {[-lm * 0.4, 0, lm * 0.4].map((px, i) => (
        <mesh key={`r-${i}`} position={[px, -0.045, 0]} castShadow receiveShadow>
          <boxGeometry args={[lm * 0.1, 0.022, wm * 0.98]} />
          <meshStandardMaterial color={BOT} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/* --------------- Warehouse ambience (yard dressing) --------------- */

function WarehouseAmbience({ Cm }: { Cm: { l: number; w: number; h: number } }) {
  // Subtle yard dressing OUTSIDE the container footprint:
  //  - Two stacks of empty pallets on the back-left side
  //  - A few traffic cones flanking the door
  //  - Painted yellow yard guide lines on the tarmac
  const PALLET_H = 0.12;
  const palletL = 1.2;
  const palletW = 1.0;

  // Stacks of empty pallets: ambient stacks behind, plus loading-side feeder
  // stacks near the door (the forklift drives out to these to grab a fresh
  // pallet+box during each loading step).
  const stacks: Array<{ pos: [number, number, number]; count: number }> = [
    { pos: [-Cm.l / 2 - 1.6, 0, -Cm.w / 2 - 1.4], count: 5 },
    { pos: [-Cm.l / 2 - 1.6, 0, Cm.w / 2 + 1.4], count: 4 },
    { pos: [-Cm.l / 2 - 3.0, 0, -Cm.w / 2 - 1.6], count: 6 },
    // Loading-side feeder stacks (near door, +x). Forklift picks from here.
    { pos: [Cm.l / 2 + 4.5, 0, -Cm.w / 2 - 1.4], count: 4 },
    { pos: [Cm.l / 2 + 4.5, 0, Cm.w / 2 + 1.4], count: 4 },
  ];

  // Traffic cones flanking the door (door is at +Cl/2). Two pairs forming a lane.
  const cones: Array<[number, number, number]> = [
    [Cm.l / 2 + 1.2, 0, -Cm.w / 2 - 0.4],
    [Cm.l / 2 + 1.2, 0, Cm.w / 2 + 0.4],
    [Cm.l / 2 + 3.5, 0, -Cm.w / 2 - 0.4],
    [Cm.l / 2 + 3.5, 0, Cm.w / 2 + 0.4],
  ];

  // Yard guide lines (painted yellow stripes on tarmac) — flank the loading lane.
  const laneZ = Cm.w / 2 + 1.0;
  const laneLen = Cm.l + 6;

  return (
    <group>
      {/* Stacked empty pallets */}
      {stacks.map((s, i) => (
        <group key={`stk-${i}`} position={s.pos}>
          {Array.from({ length: s.count }).map((_, k) => (
            <group key={k} position={[0, k * (PALLET_H + 0.005) + PALLET_H / 2, 0]}>
              <WoodenPallet lm={palletL} wm={palletW} />
            </group>
          ))}
        </group>
      ))}

      {/* Traffic cones */}
      {cones.map((p, i) => (
        <TrafficCone key={`cone-${i}`} position={p} />
      ))}

      {/* Painted yellow yard lines along the loading lane */}
      <mesh position={[Cm.l / 2 + 1.5, 0.005, -laneZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[laneLen, 0.12]} />
        <meshStandardMaterial color="#f5c518" roughness={0.85} />
      </mesh>
      <mesh position={[Cm.l / 2 + 1.5, 0.005, laneZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[laneLen, 0.12]} />
        <meshStandardMaterial color="#f5c518" roughness={0.85} />
      </mesh>
      {/* Dashed center stripe in the loading lane */}
      {Array.from({ length: 8 }).map((_, i) => (
        <mesh
          key={`dash-${i}`}
          position={[Cm.l / 2 + 1.5 + i * 0.7 - 2.4, 0.005, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[0.4, 0.08]} />
          <meshStandardMaterial color="#f5c518" roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

function TrafficCone({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Black square base */}
      <mesh castShadow receiveShadow position={[0, 0.015, 0]}>
        <boxGeometry args={[0.3, 0.03, 0.3]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
      </mesh>
      {/* Orange cone body */}
      <mesh castShadow position={[0, 0.28, 0]}>
        <coneGeometry args={[0.13, 0.5, 16]} />
        <meshStandardMaterial color="#f97316" roughness={0.7} />
      </mesh>
      {/* White reflective stripes */}
      <mesh position={[0, 0.32, 0]}>
        <coneGeometry args={[0.092, 0.05, 16]} />
        <meshStandardMaterial color="#f5f5f5" roughness={0.4} emissive="#f5f5f5" emissiveIntensity={0.15} />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <coneGeometry args={[0.122, 0.05, 16]} />
        <meshStandardMaterial color="#f5f5f5" roughness={0.4} emissive="#f5f5f5" emissiveIntensity={0.15} />
      </mesh>
    </group>
  );
}

/* --------------- Forklift --------------- */

function Forklift({ x, z, forkY, headYaw = 0 }: { x: number; z: number; forkY: number; headYaw?: number }) {
  // Recognizable forklift: yellow chassis, mast in front (-x), two forks.
  // Origin = base center on ground. Forks point in -x (toward container door).
  const BODY = "#fbbf24";
  const DARK = "#1f2937";
  return (
    <group position={[x + 0.6, 0, z]}>
      {/* Chassis */}
      <mesh castShadow position={[0.1, 0.3, 0]}>
        <boxGeometry args={[1.0, 0.5, 0.9]} />
        <meshStandardMaterial color={BODY} roughness={0.5} metalness={0.2} />
      </mesh>
      <mesh castShadow position={[0.55, 0.25, 0]}>
        <boxGeometry args={[0.25, 0.4, 0.85]} />
        <meshStandardMaterial color={DARK} roughness={0.6} />
      </mesh>
      {/* Overhead guard */}
      {([
        [-0.2, 0.6, -0.4],
        [-0.2, 0.6, 0.4],
        [0.5, 0.6, -0.4],
        [0.5, 0.6, 0.4],
      ] as Array<[number, number, number]>).map(([px, py, pz], i) => (
        <mesh key={`cage-${i}`} position={[px, py + 0.45, pz]}>
          <boxGeometry args={[0.05, 0.9, 0.05]} />
          <meshStandardMaterial color={DARK} />
        </mesh>
      ))}
      <mesh position={[0.15, 1.55, 0]}>
        <boxGeometry args={[0.85, 0.04, 0.9]} />
        <meshStandardMaterial color={DARK} />
      </mesh>
      {/* Seat */}
      <mesh position={[0.25, 0.6, 0]}>
        <boxGeometry args={[0.35, 0.05, 0.4]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      <mesh position={[0.45, 0.78, 0]}>
        <boxGeometry args={[0.05, 0.35, 0.4]} />
        <meshStandardMaterial color="#111827" />
      </mesh>

      {/* Driver figure — sits in the seat, faces forward (-x toward forks) */}
      <ForkliftDriver headYaw={headYaw} />

      {/* Wheels */}
      {([
        [-0.35, 0.18, -0.5],
        [-0.35, 0.18, 0.5],
        [0.35, 0.18, -0.5],
        [0.35, 0.18, 0.5],
      ] as Array<[number, number, number]>).map(([px, py, pz], i) => (
        <mesh key={`wheel-${i}`} position={[px, py, pz]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.18, 0.18, 0.18, 16]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
      ))}

      {/* Mast — vertical rails ahead of cabin */}
      <mesh position={[-0.4, 0.9, -0.25]}>
        <boxGeometry args={[0.06, 1.8, 0.06]} />
        <meshStandardMaterial color={DARK} metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[-0.4, 0.9, 0.25]}>
        <boxGeometry args={[0.06, 1.8, 0.06]} />
        <meshStandardMaterial color={DARK} metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[-0.4, 1.8, 0]}>
        <boxGeometry args={[0.08, 0.06, 0.6]} />
        <meshStandardMaterial color={DARK} />
      </mesh>

      {/* Carriage + forks — lift to forkY */}
      <group position={[-0.42, forkY, 0]}>
        <mesh>
          <boxGeometry args={[0.08, 0.25, 0.55]} />
          <meshStandardMaterial color={DARK} metalness={0.7} roughness={0.3} />
        </mesh>
        {[-0.18, 0.18].map((zz, i) => (
          <group key={`fork-${i}`}>
            <mesh position={[-0.55, -0.05, zz]}>
              <boxGeometry args={[1.0, 0.04, 0.08]} />
              <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.25} />
            </mesh>
            <mesh position={[-0.06, 0.05, zz]}>
              <boxGeometry args={[0.04, 0.18, 0.08]} />
              <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.25} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/* --------------- Forklift driver figure --------------- */

function ForkliftDriver({ headYaw = 0 }: { headYaw?: number }) {
  // Tiny stylised driver: hi-vis vest, hard hat, head, arms on the wheel.
  // Origin = forklift local space; seat sits at x=0.25, y=0.6, facing -x.
  const VEST = "#facc15"; // hi-vis yellow
  const SKIN = "#e6b89a";
  const HAT = "#fb923c";  // orange hard hat
  const PANTS = "#1f2937";
  return (
    <group position={[0.25, 0.6, 0]}>
      {/* Hips / lap (sitting) */}
      <mesh castShadow position={[0, 0.08, 0]}>
        <boxGeometry args={[0.22, 0.12, 0.28]} />
        <meshStandardMaterial color={PANTS} roughness={0.85} />
      </mesh>
      {/* Thighs extend forward toward the steering wheel (-x) */}
      <mesh castShadow position={[-0.14, 0.06, -0.08]}>
        <boxGeometry args={[0.22, 0.1, 0.1]} />
        <meshStandardMaterial color={PANTS} roughness={0.85} />
      </mesh>
      <mesh castShadow position={[-0.14, 0.06, 0.08]}>
        <boxGeometry args={[0.22, 0.1, 0.1]} />
        <meshStandardMaterial color={PANTS} roughness={0.85} />
      </mesh>
      {/* Torso (hi-vis vest) — sits up against backrest */}
      <mesh castShadow position={[0.06, 0.28, 0]}>
        <boxGeometry args={[0.18, 0.34, 0.3]} />
        <meshStandardMaterial color={VEST} roughness={0.7} emissive={VEST} emissiveIntensity={0.18} />
      </mesh>
      {/* Reflective stripe on vest */}
      <mesh position={[0.06, 0.22, 0]}>
        <boxGeometry args={[0.181, 0.04, 0.301]} />
        <meshStandardMaterial color="#f5f5f5" roughness={0.4} emissive="#f5f5f5" emissiveIntensity={0.15} />
      </mesh>
      {/* Arms reaching forward to wheel */}
      <mesh castShadow position={[-0.08, 0.32, -0.18]} rotation={[0, 0, 0.3]}>
        <boxGeometry args={[0.22, 0.07, 0.07]} />
        <meshStandardMaterial color={VEST} roughness={0.7} />
      </mesh>
      <mesh castShadow position={[-0.08, 0.32, 0.18]} rotation={[0, 0, 0.3]}>
        <boxGeometry args={[0.22, 0.07, 0.07]} />
        <meshStandardMaterial color={VEST} roughness={0.7} />
      </mesh>
      {/* Head + hat — rotates as a unit when driver looks back over shoulder */}
      <group position={[0.08, 0.55, 0]} rotation={[0, headYaw, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.1, 16, 12]} />
          <meshStandardMaterial color={SKIN} roughness={0.85} />
        </mesh>
        <mesh castShadow position={[0, 0.07, 0]}>
          <sphereGeometry args={[0.11, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={HAT} roughness={0.6} />
        </mesh>
        <mesh position={[-0.04, 0.07, 0]}>
          <cylinderGeometry args={[0.13, 0.13, 0.012, 16]} />
          <meshStandardMaterial color={HAT} roughness={0.6} />
        </mesh>
      </group>
    </group>
  );
}
function CargoBox({
  box,
  stat,
  offset,
  scale = 1,
  previewHighlight = false,
}: {
  box: PlacedBox;
  stat?: { stackable: boolean; fragile: boolean; packageType: string };
  offset?: [number, number, number];
  scale?: number;
  previewHighlight?: boolean;
}) {
  const lm = box.l / MM_PER_M;
  const wm = box.w / MM_PER_M;
  const hm = box.h / MM_PER_M;
  const cx = box.x / MM_PER_M + lm / 2 + (offset?.[0] ?? 0);
  const cy = box.z / MM_PER_M + hm / 2 + (offset?.[1] ?? 0);
  const cz = box.y / MM_PER_M + wm / 2 + (offset?.[2] ?? 0);
  const nonStack = stat && !stat.stackable;
  const fragile = stat?.fragile;
  const tilted = box.rotated === "sideways" || box.rotated === "axis";
  // Stripe color encodes rotation type: yellow=sideways turn, magenta=tipped on side.
  const tiltColor = box.rotated === "axis" ? "#d946ef" : "#facc15";

  // Wooden pallet under every box (only when sitting on the floor — z≈0).
  // Pallet is ~12 cm tall; we shift the box up by pallet height so visuals
  // stay correct without changing the underlying packing math.
  const onFloor = box.z < 10; // mm
  const PALLET_H = 0.12;
  const palletLift = onFloor ? PALLET_H : 0;

  // Hover state — drives the rich tilt popover. Pointer events fire from the
  // mesh itself; we stop propagation so only the topmost box hovers (otherwise
  // the cursor would light up every box behind the camera ray).
  const [hovered, setHovered] = useState(false);

  return (
    <group position={[cx, cy + palletLift, cz]} scale={scale}>
      {onFloor && <WoodenPallet lm={lm} wm={wm} />}
      {previewHighlight && (
        <mesh position={[0, -hm / 2 + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.max(lm, wm) * 0.55, Math.max(lm, wm) * 0.7, 32]} />
          <meshBasicMaterial color="#10b981" transparent opacity={0.85} />
        </mesh>
      )}
      <mesh
        castShadow
        receiveShadow
        onPointerOver={(e) => {
          if (!tilted) return;
          e.stopPropagation();
          setHovered(true);
          if (typeof document !== "undefined") document.body.style.cursor = "help";
        }}
        onPointerOut={(e) => {
          if (!tilted) return;
          e.stopPropagation();
          setHovered(false);
          if (typeof document !== "undefined") document.body.style.cursor = "";
        }}
      >
        <boxGeometry args={[lm, hm, wm]} />
        <meshStandardMaterial
          color={box.color}
          roughness={0.6}
          metalness={0.05}
          transparent={fragile}
          opacity={fragile ? 0.85 : 1}
          emissive={hovered ? tiltColor : "#000000"}
          emissiveIntensity={hovered ? 0.25 : 0}
        />
        <Edges color={hovered ? tiltColor : "rgba(0,0,0,0.35)"} />
      </mesh>
      {/* Non-stackable warning stripe on top */}
      {nonStack && (
        <mesh position={[0, hm / 2 + 0.005, 0]}>
          <boxGeometry args={[lm * 0.95, 0.01, wm * 0.15]} />
          <meshStandardMaterial color="#dc2626" />
        </mesh>
      )}
      {/* Tilt indicator: discreet hazard band on the four vertical faces — no
          always-on text. Hover the box to see the full instructions popover. */}
      {tilted && (
        <>
          <mesh position={[0, hm / 2 - hm * 0.12, wm / 2 + 0.002]}>
            <planeGeometry args={[lm * 0.96, hm * 0.14]} />
            <meshStandardMaterial color={tiltColor} emissive={tiltColor} emissiveIntensity={0.35} />
          </mesh>
          <mesh position={[0, hm / 2 - hm * 0.12, -wm / 2 - 0.002]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[lm * 0.96, hm * 0.14]} />
            <meshStandardMaterial color={tiltColor} emissive={tiltColor} emissiveIntensity={0.35} />
          </mesh>
          <mesh position={[lm / 2 + 0.002, hm / 2 - hm * 0.12, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[wm * 0.96, hm * 0.14]} />
            <meshStandardMaterial color={tiltColor} emissive={tiltColor} emissiveIntensity={0.35} />
          </mesh>
          <mesh position={[-lm / 2 - 0.002, hm / 2 - hm * 0.12, 0]} rotation={[0, -Math.PI / 2, 0]}>
            <planeGeometry args={[wm * 0.96, hm * 0.14]} />
            <meshStandardMaterial color={tiltColor} emissive={tiltColor} emissiveIntensity={0.35} />
          </mesh>
          <mesh
            position={[0, hm / 2 + 0.006, 0]}
            rotation={[0, box.rotated === "axis" ? Math.PI / 4 : Math.PI / 2, 0]}
          >
            <boxGeometry args={[Math.min(lm, wm) * 0.95, 0.012, 0.06]} />
            <meshStandardMaterial color={tiltColor} />
          </mesh>
          {/* Hover-only rich popover with full instructions + axis diagram. */}
          {hovered && (
            <Html position={[0, hm / 2 + 0.06, 0]} center zIndexRange={[100, 0]}>
              <TiltInfoCard mode={box.rotated === "axis" ? "tipped" : "turned"} color={tiltColor} />
            </Html>
          )}
        </>
      )}
    </group>
  );
}

/* --------------- Tilt info card (shown on hover) --------------- */

function TiltInfoCard({ mode, color }: { mode: "tipped" | "turned"; color: string }) {
  const isTipped = mode === "tipped";
  return (
    <div
      className="pointer-events-none w-56 rounded-lg border-2 bg-background/95 p-2.5 shadow-xl backdrop-blur"
      style={{ borderColor: color }}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <span
          className="flex size-5 items-center justify-center rounded-full text-[11px] font-black leading-none"
          style={{ background: color, color: "#1a1a1a" }}
        >
          {isTipped ? "⤾" : "↻"}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-wide text-brand-navy">
          {isTipped ? "Tipped on side" : "Rotated sideways"}
        </span>
      </div>
      {/* Mini ASCII-style axis diagram. SVG so it renders identically across browsers. */}
      <svg viewBox="0 0 220 70" className="mb-1.5 w-full">
        {/* Original outline (dashed) */}
        <rect x="14" y="14" width="60" height="42" fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 2" />
        <text x="44" y="68" textAnchor="middle" fontSize="7" fill="#64748b">original</text>
        {/* Arrow */}
        <path d="M 90 35 L 122 35 M 116 30 L 122 35 L 116 40" stroke={color} strokeWidth="2" fill="none" />
        {isTipped ? (
          <>
            <rect x="138" y="22" width="42" height="34" fill="none" stroke={color} strokeWidth="2" />
            <text x="159" y="68" textAnchor="middle" fontSize="7" fill="#1a1a1a" fontWeight="700">tipped (H ↔ L)</text>
          </>
        ) : (
          <>
            <rect x="138" y="6" width="42" height="50" fill="none" stroke={color} strokeWidth="2" />
            <text x="159" y="68" textAnchor="middle" fontSize="7" fill="#1a1a1a" fontWeight="700">turned 90° (L ↔ W)</text>
          </>
        )}
      </svg>
      <p className="text-[10px] leading-snug text-muted-foreground">
        {isTipped
          ? "Lay this carton on its side so the height becomes the length. Mark the new top before banding."
          : "Rotate this carton 90° around the vertical axis so the long edge runs along the container width."}
      </p>
    </div>
  );
}

/* --------------- Gap heatmap (floor + back wall void overlay) --------------- */

/**
 * Paints translucent red rectangles where the active row has voids:
 *   - Floor voids: along the container width (y-axis) within the row's x-slice.
 *   - Back wall void above the bottom-layer footprint, capped at row height.
 *
 * All scene coords are in metres; row coords are in mm. The parent group
 * translates so the back-bottom-left corner sits at the local origin.
 */
function GapHeatmap({
  row,
  containerW,
  containerH,
}: {
  row: RowGroup;
  containerW: number; // mm
  containerH: number; // mm
}) {
  const RED = "#ef4444";
  const HEATMAP_Y = 0.005; // lift just above the floor to avoid z-fighting

  // Bottom-layer y-intervals → merged → voids along container width.
  const bottoms = row.boxes.filter((b) => b.z < 10);

  // 1. Compute floor voids along y (container width) within the row x-slice.
  const intervals = bottoms
    .map((b) => [b.y, b.y + b.w] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const iv of intervals) {
    const last = merged[merged.length - 1];
    if (last && iv[0] <= last[1]) {
      last[1] = Math.max(last[1], iv[1]);
    } else {
      merged.push([...iv] as [number, number]);
    }
  }
  const floorVoids: { y0: number; y1: number }[] = [];
  let cursor = 0;
  for (const [s, e] of merged) {
    if (s > cursor) floorVoids.push({ y0: cursor, y1: s });
    cursor = Math.max(cursor, e);
  }
  if (cursor < containerW) floorVoids.push({ y0: cursor, y1: containerW });

  // 2. Compute the bottom-layer max height — anything above that against the
  //    back wall is a "wall void" worth flagging.
  const rowDepthM = (row.xEnd - row.xStart) / 1000;
  const xStartM = row.xStart / 1000;
  const containerHm = containerH / 1000;
  // Top of the highest box in this row's footprint (only count back-wall column,
  // i.e. boxes whose x-start is at the row start).
  const backWallBoxes = row.boxes.filter((b) => Math.abs(b.x - row.xStart) < 50);
  const backWallTopMm =
    backWallBoxes.length === 0
      ? 0
      : Math.max(...backWallBoxes.map((b) => b.z + b.h));
  const backWallTopM = backWallTopMm / 1000;
  const wallVoidH = Math.max(0, containerHm - backWallTopM);

  return (
    <group>
      {/* Floor voids — laid flat in the x/y plane, lifted slightly to avoid z-fighting */}
      {floorVoids.map((v, i) => {
        const widthM = (v.y1 - v.y0) / 1000;
        const cxM = xStartM + rowDepthM / 2;
        const czM = (v.y0 + v.y1) / 2 / 1000;
        return (
          <mesh
            key={`fv-${i}`}
            position={[cxM, HEATMAP_Y, czM]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[rowDepthM, widthM]} />
            <meshBasicMaterial color={RED} transparent opacity={0.35} depthWrite={false} />
          </mesh>
        );
      })}
      {/* Back-wall void — vertical plane sitting at the row's xStart, between
          backWallTop and ceiling. Only drawn when there's meaningful headroom. */}
      {wallVoidH > 0.1 && (
        <mesh
          position={[xStartM + 0.005, backWallTopM + wallVoidH / 2, containerW / 1000 / 2]}
          rotation={[0, Math.PI / 2, 0]}
        >
          <planeGeometry args={[containerW / 1000, wallVoidH]} />
          <meshBasicMaterial color={RED} transparent opacity={0.22} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* Hover-free label — tells the user what they're looking at. */}
      <Html
        position={[xStartM + rowDepthM / 2, containerHm + 0.15, containerW / 1000 / 2]}
        center
        zIndexRange={[50, 0]}
      >
        <div className="pointer-events-none rounded-md border border-red-400 bg-red-50/95 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-red-700 shadow">
          ⚠ Gaps in row {row.rowIdx + 1} — {Math.round(100 - row.wallUtilizationPct)}% void
        </div>
      </Html>
    </group>
  );
}

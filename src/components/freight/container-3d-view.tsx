/**
 * True 3D interactive container loader using react-three-fiber.
 * - Drag to orbit, scroll/pinch to zoom, double-click to reset.
 * - Camera presets (Iso, Front, Side, Top, Inside).
 * - Translucent container walls so cargo is always visible.
 * - Soft shadows + ambient lighting.
 * - Exposes a snapshot API (via ref) returning PNG dataURLs for the PDF.
 *
 * Lazy-loaded by container-load-view.tsx (client-only).
 */
import { Suspense, createContext, forwardRef, useContext, useImperativeHandle, useMemo, useRef, useState, useEffect } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Edges, Grid, Html, RoundedBox } from "@react-three/drei";
import { Maximize2, Minimize2 } from "lucide-react";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFullscreen } from "@/hooks/use-fullscreen";
import type { AdvancedPackResult } from "@/lib/freight/packing-advanced";
import type { PlacedBox } from "@/lib/freight/packing";
import { pickEdgeColor } from "@/lib/freight/packing";
import { assignDisplayColors, displayColorKey } from "@/lib/freight/display-colors";

type Preset = "iso" | "front" | "side" | "top" | "inside";

export interface Container3DHandle {
  /** Capture a PNG dataURL from each preset angle. Used by PDF export. */
  captureAngles: () => Promise<{ iso: string; front: string; side: string }>;
  render: () => void;
  getCanvas: () => HTMLCanvasElement | null;
}

interface Props {
  pack: AdvancedPackResult;
  height?: number;
  /**
   * Hide the swing doors entirely. Useful while recording PDF snapshots —
   * an open door at 135° still occludes the camera from many iso angles.
   */
  hideDoors?: boolean;
  /**
   * Optional overlay rendered inside the viewer wrapper (so it persists in
   * fullscreen). Use to mount HUDs / control panels that should sit on top of
   * the canvas without being clipped when the user enters fullscreen.
   */
  overlay?: React.ReactNode;
  nearCeilingPlacedIdxs?: number[] | null;
  /**
   * When provided, only boxes whose `pack.placed` index is in this set are
   * rendered. Drives the row-by-row reveal: boxes not yet loaded by the
   * walkthrough stay hidden so the container fills up progressively.
   * `null` / `undefined` → render every placed box (static full view).
   */
  visiblePlacedIdxs?: ReadonlySet<number> | null;
  /**
   * Indices of boxes that should play the fly-in ease-out animation right
   * now (the box(es) being loaded by the current pallet step).
   */
  flyInIdxs?: ReadonlySet<number> | null;
  /**
   * Bumped every time the current step changes. Forces `CargoBox` to reset
   * its animation start clock even if React re-uses the same group.
   */
  flyInKey?: number;
  /**
   * Optional sessionStorage key that scopes camera persistence. When set,
   * the user's last orbit position / target / zoom is restored on mount and
   * saved on every interaction so changing inputs (which re-runs the
   * packer) doesn't snap the camera back to its default iso framing.
   * Different keys → independent remembered framings (e.g. one per
   * container tab).
   */
  persistKey?: string;
}

/**
 * We work in metres in the scene (mm / 1000) so the camera distances are sane.
 */
const MM_PER_M = 1000;

const JUTE_PREF_KEY = "cargo3d:jute";

export const Container3DView = forwardRef<Container3DHandle, Props>(function Container3DView(
  { pack, height = 420, hideDoors = false, overlay = null, nearCeilingPlacedIdxs = null, visiblePlacedIdxs = null, flyInIdxs = null, flyInKey = 0, persistKey },
  ref,
) {
  const [preset, setPresetState] = useState<Preset>("iso");
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // Jute / fabric texture toggle for bag surfaces. Persisted across the
  // session so the user keeps the look they picked while iterating.
  const [jute, setJute] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return window.sessionStorage.getItem(JUTE_PREF_KEY) === "1"; }
    catch { return false; }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { window.sessionStorage.setItem(JUTE_PREF_KEY, jute ? "1" : "0"); }
    catch { /* storage blocked — non-fatal */ }
  }, [jute]);
  const bagTextureCtx = useMemo(() => ({ jute }), [jute]);

  // Clicking a preset clears the saved camera so the preset always wins;
  // subsequent orbit will re-save under the same key.
  const setPreset = (p: Preset) => {
    if (persistKey && typeof window !== "undefined") {
      try { window.sessionStorage.removeItem(persistKey); }
      catch { /* non-fatal */ }
    }
    setPresetState(p);
  };

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
    render() {
      const gl = glRef.current;
      const scene = sceneRef.current;
      const cam = cameraRef.current;
      if (gl && scene && cam) gl.render(scene, cam);
    },
    getCanvas() {
      return glRef.current?.domElement ?? null;
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
        dpr={[1, 1.5]}
        frameloop="demand"
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        camera={{ position: [Cm.l * 0.9, Cm.h * 1.4, Cm.w * 1.6], fov: 35 }}
        onCreated={({ gl, scene, camera }) => {
          glRef.current = gl;
          sceneRef.current = scene;
          cameraRef.current = camera as THREE.PerspectiveCamera;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.NoToneMapping;
          scene.background = makeSkyTexture();
          scene.fog = new THREE.Fog(0xb8c2cc, Cm.l * 4, Cm.l * 14);
        }}
      >
        <Suspense fallback={<Html center>Loading 3D…</Html>}>
          <BagTextureContext.Provider value={bagTextureCtx}>
            <SceneContents
              pack={pack}
              Cm={Cm}
              preset={preset}
              hideDoors={hideDoors}
              nearCeilingPlacedIdxs={nearCeilingPlacedIdxs ?? pack.nearCeilingPlacedIdxs ?? null}
              visiblePlacedIdxs={visiblePlacedIdxs}
              flyInIdxs={flyInIdxs}
              flyInKey={flyInKey}
              persistKey={persistKey}
            />
          </BagTextureContext.Provider>
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

      {/* Jute / fabric texture toggle for bag surfaces. Off by default. */}
      <button
        type="button"
        onClick={() => setJute((v) => !v)}
        aria-pressed={jute}
        title={jute ? "Switch bags to soft material (default)" : "Apply jute / hessian weave to bags"}
        className={cn(
          "absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold backdrop-blur transition-colors",
          jute
            ? "border-amber-500/70 bg-amber-100/90 text-amber-900 hover:bg-amber-100"
            : "border-brand-navy/30 bg-background/85 text-brand-navy hover:bg-background",
        )}
      >
        <span aria-hidden>{jute ? "▦" : "▢"}</span>
        Jute
      </button>

      {overlay}
    </div>
  );
});

/* --------------- Procedural textures (real container look) ---------------
 * Module-level caches: each texture is created at most once per process and
 * reused across container switches. The texture data itself is tileable —
 * only `repeat` depends on container dimensions, and that's a cheap update
 * applied at consumption sites. This eliminates GPU memory growth that
 * previously occurred each time the user switched buckets.
 */

let _skyTex: THREE.CanvasTexture | null = null;
function makeSkyTexture(): THREE.CanvasTexture {
  if (_skyTex) return _skyTex;
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
  _skyTex = new THREE.CanvasTexture(c);
  return _skyTex;
}

const _corrugatedCache = new Map<string, THREE.CanvasTexture>();
function makeCorrugatedTexture(color: string): THREE.CanvasTexture {
  const cached = _corrugatedCache.get(color);
  if (cached) return cached;
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
  _corrugatedCache.set(color, tex);
  return tex;
}

let _plywoodTex: THREE.CanvasTexture | null = null;
function makePlywoodTexture(): THREE.CanvasTexture {
  if (_plywoodTex) return _plywoodTex;
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
  _plywoodTex = new THREE.CanvasTexture(c);
  _plywoodTex.wrapS = THREE.RepeatWrapping;
  _plywoodTex.wrapT = THREE.RepeatWrapping;
  return _plywoodTex;
}

/* Procedural jute / hessian weave texture for bags. Cached per bag colour
 * because every bag of the same colour reuses the same fabric pattern. */
const _juteCache = new Map<string, THREE.CanvasTexture>();
function makeJuteTexture(color: string): THREE.CanvasTexture {
  const cached = _juteCache.get(color);
  if (cached) return cached;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  // Base wash from the bag's tone — slightly desaturated so the weave reads.
  ctx.fillStyle = color || "#c4a574";
  ctx.fillRect(0, 0, 256, 256);
  // Warp threads (vertical) and weft threads (horizontal). Both slightly
  // darker than the base; alternating offsets create the woven feel.
  const warp = "rgba(60, 42, 22, 0.22)";
  const weft = "rgba(255, 244, 220, 0.16)";
  const step = 6;
  for (let x = 0; x < 256; x += step) {
    ctx.fillStyle = warp;
    ctx.fillRect(x, 0, 2, 256);
  }
  for (let y = 0; y < 256; y += step) {
    ctx.fillStyle = weft;
    ctx.fillRect(0, y, 256, 2);
  }
  // Faint slubs / fibre noise — gives the surface organic micro-variation.
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 280; i++) {
    ctx.fillStyle = i % 3 === 0 ? "#3a2410" : "#fff3d8";
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1, 1 + Math.random() * 1.5);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  _juteCache.set(color, tex);
  return tex;
}

/* When `enabled` is true, BagShape applies a jute weave texture instead of
 * the flat soft-fabric material. Default false → identical to today. */
const BagTextureContext = createContext<{ jute: boolean }>({ jute: false });

/* --------------- Demand-mode invalidator ---------------
 * With `frameloop="demand"` the canvas only renders when something invalidates
 * it. OrbitControls already calls invalidate() on every drag/zoom, but we also
 * need to invalidate on prop changes (preset switch, fly-in, recording frame,
 * heatmap toggle, etc) and to keep ticking while an animation is in flight.
 * When idle, this component does nothing — CPU usage drops to ~0.
 */
function InvalidateOnChange({
  deps,
  animate,
}: {
  deps: Array<number | string | boolean | null | undefined>;
  animate: boolean;
}) {
  const { invalidate } = useThree();
  useEffect(() => {
    invalidate();
  }, [invalidate, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame(() => {
    if (animate) invalidate();
  });
  return null;
}

/* --------------- Scene contents --------------- */

function SceneContents({
  pack,
  Cm,
  preset,
  hideDoors,
  nearCeilingPlacedIdxs,
  visiblePlacedIdxs = null,
  flyInIdxs = null,
  flyInKey = 0,
  persistKey,
}: {
  pack: AdvancedPackResult;
  Cm: { l: number; w: number; h: number };
  preset: Preset;
  hideDoors: boolean;
  nearCeilingPlacedIdxs: number[] | null;
  visiblePlacedIdxs?: ReadonlySet<number> | null;
  flyInIdxs?: ReadonlySet<number> | null;
  flyInKey?: number;
  persistKey?: string;
}) {
  const { camera, invalidate } = useThree();
  const controlsRef = useRef<React.ComponentRef<typeof OrbitControls> | null>(null);
  const target = useMemo(() => new THREE.Vector3(0, Cm.h / 2, 0), [Cm.h]);
  // True after we've restored a saved camera frame so the preset effect
  // doesn't snap us back to iso on first mount.
  const restoredRef = useRef(false);
  // Internal preset version: bumped when the user clicks a preset so we
  // know to apply it even if persistKey would otherwise suppress the move.
  const presetAppliedRef = useRef<Preset | null>(null);

  // Restore saved camera frame on mount (once per persistKey).
  useEffect(() => {
    if (!persistKey || typeof window === "undefined") return;
    let raw: string | null = null;
    try { raw = window.sessionStorage.getItem(persistKey); }
    catch { return; }
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as {
        position?: [number, number, number];
        target?: [number, number, number];
        zoom?: number;
      };
      const cam = camera as THREE.PerspectiveCamera;
      if (saved.position) cam.position.set(...saved.position);
      if (saved.zoom && Number.isFinite(saved.zoom)) {
        cam.zoom = saved.zoom;
        cam.updateProjectionMatrix();
      }
      if (saved.target) target.set(...saved.target);
      controlsRef.current?.update?.();
      restoredRef.current = true;
      invalidate();
    } catch {
      /* corrupt entry — ignore */
    }
    // Only run on persistKey change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistKey]);

  // Apply preset whenever it changes — but skip the very first run if we
  // restored a saved frame (otherwise the user's remembered view is wiped).
  useEffect(() => {
    if (!camera) return;
    // Skip first run when we have a restored frame and the preset hasn't
    // changed since mount (still the initial "iso" default).
    if (restoredRef.current && presetAppliedRef.current === null) {
      presetAppliedRef.current = preset;
      return;
    }
    presetAppliedRef.current = preset;
    const cam = camera as THREE.PerspectiveCamera;
    const positions: Record<Preset, THREE.Vector3> = {
      iso: new THREE.Vector3(Cm.l * 0.9, Cm.h * 1.4, Cm.w * 1.6),
      front: new THREE.Vector3(0, Cm.h / 2, Cm.w * 2.4),
      side: new THREE.Vector3(Cm.l * 1.7, Cm.h / 2, 0.001),
      top: new THREE.Vector3(0.001, Cm.h * 3, 0.001),
      inside: new THREE.Vector3(-Cm.l / 2 + 0.5, Cm.h * 0.6, 0),
    };
    cam.position.copy(positions[preset]);
    cam.zoom = 1;
    cam.updateProjectionMatrix();
    cam.lookAt(preset === "inside" ? new THREE.Vector3(Cm.l / 2, Cm.h / 2, 0) : target);
    controlsRef.current?.update?.();
  }, [preset, Cm.l, Cm.w, Cm.h, camera, target]);

  // Persist camera frame on every OrbitControls change (debounced).
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleControlsChange = () => {
    if (!persistKey || typeof window === "undefined") return;
    const cam = camera as THREE.PerspectiveCamera;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        window.sessionStorage.setItem(
          persistKey,
          JSON.stringify({
            position: [cam.position.x, cam.position.y, cam.position.z],
            target: [target.x, target.y, target.z],
            zoom: cam.zoom,
          }),
        );
      } catch { /* storage blocked — non-fatal */ }
    }, 150);
  };
  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  // Doors stay open in the static scene ("ready to load").
  const doorOpen = 1;

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[Cm.l, Cm.h * 3, Cm.w * 2]}
        intensity={1.1}
        castShadow
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
        shadow-bias={-0.0005}
        shadow-camera-near={0.1}
        shadow-camera-far={Math.max(Cm.l, Cm.w) * 8}
        shadow-camera-left={-Cm.l}
        shadow-camera-right={Cm.l}
        shadow-camera-top={Cm.h * 2}
        shadow-camera-bottom={-0.5}
      />
      <hemisphereLight intensity={0.35} groundColor={"#ddd"} />

      <InvalidateOnChange
        deps={[preset, hideDoors ? 1 : 0, flyInKey, visiblePlacedIdxs?.size ?? -1]}
        animate={(flyInIdxs?.size ?? 0) > 0}
      />

      <OrbitControls
        ref={controlsRef}
        target={target}
        enablePan
        minDistance={Math.max(Cm.l, Cm.w) * 0.3}
        maxDistance={Math.max(Cm.l, Cm.w) * 4}
        maxPolarAngle={Math.PI / 2 - 0.05}
        onChange={handleControlsChange}
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

      <ContainerShell Cm={Cm} doorOpen={doorOpen} hideDoors={hideDoors} />

      {/* Cargo — rendered at exact packed coordinates. The walkthrough may
          hide boxes whose index is not in `visiblePlacedIdxs` and animate the
          fly-in of boxes whose index is in `flyInIdxs`. The resting position
          for every visible box is the validated packer slot, so once the
          ease-out finishes there is zero overlap and zero floating cargo. */}
      <group position={[-Cm.l / 2, 0, -Cm.w / 2]}>
        {pack.placed.map((b, i) => {
          if (visiblePlacedIdxs && !visiblePlacedIdxs.has(i)) return null;
          const isNearCeiling = nearCeilingPlacedIdxs?.includes(i) ?? false;
          const isFlying = flyInIdxs?.has(i) ?? false;
          return (
            <CargoBox
              key={i}
              box={b}
              stat={pack.perItem[b.itemIdx]}
              showEdges
              nearCeiling={isNearCeiling}
              flyIn={isFlying}
              flyInKey={flyInKey}
              containerL={Cm.l}
              containerH={Cm.h}
            />
          );
        })}
      </group>

      {/* Dimension labels */}
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
      {/* Door-end length budget: shows the 100 mm door reserve plus any extra
          slack between the deepest packed carton and the reserve line. The
          reserve is mandatory — boxes never enter it. */}
      {(() => {
        const innerLmm = pack.container.inner.l;
        const doorReserveMm = 100;
        const usableMm = innerLmm - doorReserveMm;
        const deepestMm = pack.placed.reduce((m, b) => Math.max(m, b.x + b.l), 0);
        const slackMm = Math.max(0, usableMm - deepestMm);
        return (
          <Html
            position={[Cm.l / 2 + 0.05, Cm.h * 0.55, 0]}
            center
            distanceFactor={Math.max(Cm.l, Cm.w) * 1.2}
          >
            <span className="whitespace-nowrap rounded bg-amber-600 px-1.5 py-0.5 text-[10px] font-medium text-white shadow">
              Door reserve {doorReserveMm} mm · slack {slackMm.toLocaleString()} mm
            </span>
          </Html>
        );
      })()}
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

  // Cached, color-keyed textures. The texture data itself is reused across
  // every container; only `repeat` depends on dimensions, so we mutate it in
  // an effect (no GPU upload, no GC churn on container switch).
  const plywoodTex = useMemo(() => makePlywoodTexture(), []);
  const wallTexX = useMemo(() => makeCorrugatedTexture(wallColor), [wallColor]);
  const wallTexZ = useMemo(() => makeCorrugatedTexture(wallColor), [wallColor]);
  const doorTex = useMemo(() => makeCorrugatedTexture(doorColor), [doorColor]);

  useEffect(() => {
    plywoodTex.repeat.set(Math.max(2, Cm.l / 1.2), Math.max(2, Cm.w / 1.2));
    plywoodTex.needsUpdate = true;
  }, [plywoodTex, Cm.l, Cm.w]);
  useEffect(() => {
    wallTexX.repeat.set(Math.max(4, Cm.l / 0.3), Math.max(2, Cm.h / 1.5));
    wallTexX.needsUpdate = true;
  }, [wallTexX, Cm.l, Cm.h]);
  useEffect(() => {
    wallTexZ.repeat.set(Math.max(2, Cm.w / 0.3), Math.max(2, Cm.h / 1.5));
    wallTexZ.needsUpdate = true;
  }, [wallTexZ, Cm.w, Cm.h]);
  useEffect(() => {
    doorTex.repeat.set(Math.max(2, Cm.w / 0.6), Math.max(2, Cm.h / 1.5));
    doorTex.needsUpdate = true;
  }, [doorTex, Cm.w, Cm.h]);

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
      {/* Plywood floor — recessed slightly so box bottoms always overlap and
          never show daylight from any camera angle (kills Z-fighting). */}
      <mesh receiveShadow position={[0, 0.008, 0]}>
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

function WoodenPallet({ lm, wm, bottomY = 0 }: { lm: number; wm: number; bottomY?: number }) {
  // Pallet look: top deck planks with gaps, 3×3 feet blocks, 3 bottom runners.
  // Height = 12 cm total. The pallet's TOP face sits at local y = bottomY
  // (the cargo box's bottom), and the rest of its body extends DOWN into the
  // floor. This keeps the cargo at its true z coordinate so stacked boxes
  // align perfectly with the boxes they rest on (no visual interpenetration).
  const TOP = "#b8895a";
  const BOT = "#8a6038";
  const planks = Math.max(5, Math.round(wm / 0.18));
  const plankW = wm / planks;
  // Top deck centre = bottomY - 0.011 (deck thickness = 0.022, half = 0.011).
  // Block centre   = bottomY - 0.06  (block height = 0.06, top of block = bottomY - 0.03)
  const deckY = bottomY - 0.011;
  const blockY = bottomY - 0.06;
  const runnerY = bottomY - 0.105;
  return (
    <group>
      {Array.from({ length: planks }).map((_, i) => {
        if (i % 2 === 1 && i !== planks - 1) return null;
        const z = -wm / 2 + plankW * (i + 0.5);
        return (
          <mesh key={`p-${i}`} position={[0, deckY, z]} castShadow receiveShadow>
            <boxGeometry args={[lm * 0.98, 0.022, plankW * 0.85]} />
            <meshStandardMaterial color={TOP} roughness={0.85} />
          </mesh>
        );
      })}
      {[-lm * 0.4, 0, lm * 0.4].map((px, ix) =>
        [-wm * 0.4, 0, wm * 0.4].map((pz, iz) => (
          <mesh key={`b-${ix}-${iz}`} position={[px, blockY, pz]} castShadow>
            <boxGeometry args={[lm * 0.12, 0.06, wm * 0.12]} />
            <meshStandardMaterial color={BOT} roughness={0.9} />
          </mesh>
        )),
      )}
      {[-lm * 0.4, 0, lm * 0.4].map((px, i) => (
        <mesh key={`r-${i}`} position={[px, runnerY, 0]} castShadow receiveShadow>
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
    { pos: [-Cm.l / 2 - 3.0, 0, -Cm.w / 2 - 1.6], count: 3 },
    // Loading-side feeder stacks (near door, +x). Forklift picks from here.
    { pos: [Cm.l / 2 + 4.5, 0, -Cm.w / 2 - 1.4], count: 3 },
    { pos: [Cm.l / 2 + 4.5, 0, Cm.w / 2 + 1.4], count: 3 },
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
  flyIn = false,
  flyInKey = 0,
  containerL = 12,
  containerH = 2.6,
  showCheckmark = false,
  showEdges = true,
  nearCeiling = false,
  displayColor,
}: {
  box: PlacedBox;
  stat?: { stackable: boolean; fragile: boolean; packageType: string };
  offset?: [number, number, number];
  scale?: number;
  previewHighlight?: boolean;
  flyIn?: boolean;
  flyInKey?: number;
  containerL?: number;
  containerH?: number;
  showCheckmark?: boolean;
  showEdges?: boolean;
  nearCeiling?: boolean;
  /** Adjacency-aware shade override; falls back to box.color. */
  displayColor?: string;
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
  // CRITICAL: do NOT lift the cargo by the pallet height. The packer treats
  // the pallet as part of the cargo unit (its height is included in the
  // carton dimensions for palletised goods). Lifting floor cargo by 12 cm
  // while keeping stacked cargo at its raw z made stacked boxes appear to
  // float / overlap in the 3D view even when the pack math was correct.
  // The decorative pallet now embeds *into* the floor below the box bottom
  // so visual contact planes match the physical model exactly.
  const onFloor = box.z < 50; // mm — covers post-snap floor cartons resting on dunnage runners
  const palletLift = 0;

  // Hover state — drives the rich tilt popover.
  const [hovered, setHovered] = useState(false);

  // ── Fly-in animation ──────────────────────────────────────────────
  // When `flyIn` is true (this box was just revealed by the row stepper),
  // animate the group from a staging position (high above + toward the door,
  // i.e. positive container-x in scene-x space) to its slot over ~600ms.
  // Door = +x side of the container in this scene (group is centred on origin
  // with translation `[-Cm.l/2, 0, -Cm.w/2]`, so the +x face is the door).
  const groupRef = useRef<THREE.Group | null>(null);
  const animStartRef = useRef<number | null>(null);
  // Reset animation start whenever flyInKey changes AND this box is part of
  // the new reveal — guarantees a re-trigger even if React reuses the group.
  useEffect(() => {
    if (flyIn) animStartRef.current = null;
    // Boxes that aren't part of this reveal stay at rest (no anim).
  }, [flyIn, flyInKey]);

  const FLY_DURATION = 0.6; // seconds
  // Staging offset (relative to slot): up by container height, +x toward door.
  const stageOffsetX = Math.max(2, containerL * 0.55);
  const stageOffsetY = Math.max(1.2, containerH * 0.7);

  // Only subscribe to the per-frame loop while this box is actively flying in.
  // Idle boxes (the common case after load) register zero useFrame callbacks.
  useFrame((_state, delta) => {
    if (!flyIn) return;
    const g = groupRef.current;
    if (!g) return;
    if (animStartRef.current === null) animStartRef.current = 0;
    animStartRef.current += delta;
    const t = Math.min(1, animStartRef.current / FLY_DURATION);
    // Ease-out cubic
    const e = 1 - Math.pow(1 - t, 3);
    const dx = stageOffsetX * (1 - e);
    const dy = stageOffsetY * (1 - e);
    g.position.set(cx + dx, cy + palletLift + dy, cz);
  });

  return (
    <group ref={groupRef} position={[cx, cy + palletLift, cz]} scale={scale}>
      {onFloor && stat?.packageType !== "pallet" && <WoodenPallet lm={lm} wm={wm} bottomY={-hm / 2} />}
      {previewHighlight && (
        <mesh position={[0, -hm / 2 + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.max(lm, wm) * 0.55, Math.max(lm, wm) * 0.7, 32]} />
          <meshBasicMaterial color="#10b981" transparent opacity={0.85} />
        </mesh>
      )}
      <PackageShape
        lm={lm}
        hm={hm}
        wm={wm}
        color={displayColor ?? box.color}
        packageType={stat?.packageType}
        fragile={!!fragile}
        hovered={hovered}
        tiltColor={tiltColor}
        tilted={tilted}
        showEdges={showEdges}
        onFloor={onFloor}
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
      />

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
          <mesh position={[0, hm / 2 - hm * 0.12, wm / 2 + 0.0005]}>
            <planeGeometry args={[lm * 0.96, hm * 0.14]} />
            <meshStandardMaterial color={tiltColor} emissive={tiltColor} emissiveIntensity={0.35} />
          </mesh>
          <mesh position={[0, hm / 2 - hm * 0.12, -wm / 2 - 0.0005]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[lm * 0.96, hm * 0.14]} />
            <meshStandardMaterial color={tiltColor} emissive={tiltColor} emissiveIntensity={0.35} />
          </mesh>
          <mesh position={[lm / 2 + 0.0005, hm / 2 - hm * 0.12, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[wm * 0.96, hm * 0.14]} />
            <meshStandardMaterial color={tiltColor} emissive={tiltColor} emissiveIntensity={0.35} />
          </mesh>
          <mesh position={[-lm / 2 - 0.0005, hm / 2 - hm * 0.12, 0]} rotation={[0, -Math.PI / 2, 0]}>
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
      {/* Green checkmark stamp — shown briefly when this is the active pallet
          (parent clears showCheckmark after ~400ms). */}
      {showCheckmark && (
        <Html position={[0, hm / 2 + 0.18, 0]} center zIndexRange={[100, 0]}>
          <div className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-lg">
            ✓
          </div>
        </Html>
      )}
      {nearCeiling && (
        <mesh position={[0, hm / 2 + 0.004, 0]}>
          <boxGeometry args={[lm * 0.98, 0.018, wm * 0.98]} />
          <meshBasicMaterial color="#f59e0b" transparent opacity={0.75} />
        </mesh>
      )}
    </group>
  );
}

/* --------------- PackageShape — per-type 3D mesh dispatcher --------------- */

interface PackageShapeProps {
  lm: number;
  hm: number;
  wm: number;
  color: string;
  packageType?: string;
  fragile: boolean;
  hovered: boolean;
  tilted: boolean;
  tiltColor: string;
  showEdges?: boolean;
  onFloor?: boolean;
  onPointerOver: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut: (e: ThreeEvent<PointerEvent>) => void;
}

function PackageShape(props: PackageShapeProps) {
  const t = props.packageType ?? "carton";
  if (t === "drum") return <DrumShape {...props} />;
  if (t === "bale") return <BaleShape {...props} />;
  if (t === "crate") return <CrateShape {...props} />;
  if (t === "pallet") return <PalletShape {...props} />;
  if (t === "bag") return <BagShape {...props} />;
  return <CartonShape {...props} />;
}

function CartonShape({ lm, hm, wm, color, fragile, hovered, tiltColor, showEdges = true, onPointerOver, onPointerOut }: PackageShapeProps) {
  return (
    <mesh castShadow receiveShadow onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
      <boxGeometry args={[lm, hm, wm]} />
      <meshStandardMaterial
        color={color}
        roughness={0.6}
        metalness={0.05}
        transparent={fragile}
        opacity={fragile ? 0.85 : 1}
        emissive={hovered ? tiltColor : "#000000"}
        emissiveIntensity={hovered ? 0.25 : 0}
      />
      {showEdges && (
        <Edges scale={0.999} color={hovered ? tiltColor : "#1f2937"}>
          <lineBasicMaterial
            color={hovered ? tiltColor : "#1f2937"}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </Edges>
      )}
    </mesh>
  );
}

function DrumShape({ lm, hm, wm, color, hovered, tiltColor, onFloor, onPointerOver, onPointerOut }: PackageShapeProps) {
  const radius = Math.min(lm, wm) / 2;
  const drumColor = color || "#2c5282";
  return (
    <group onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius, hm, 20]} />
        <meshStandardMaterial
          color={drumColor}
          roughness={0.45}
          metalness={0.55}
          emissive={hovered ? tiltColor : "#000000"}
          emissiveIntensity={hovered ? 0.25 : 0}
        />
      </mesh>
      <mesh position={[0, hm / 2 - 0.005, 0]}>
        <cylinderGeometry args={[radius * 0.99, radius * 0.99, 0.025, 20]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.4} metalness={0.7} />
      </mesh>
      <mesh position={[0, -hm / 2 + 0.005, 0]}>
        <cylinderGeometry args={[radius * 0.99, radius * 0.99, 0.025, 20]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.4} metalness={0.7} />
      </mesh>
      <mesh position={[0, hm / 6, 0]}>
        <cylinderGeometry args={[radius * 0.985, radius * 0.985, 0.018, 20]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.5} metalness={0.65} />
      </mesh>
      <mesh position={[0, -hm / 6, 0]}>
        <cylinderGeometry args={[radius * 0.985, radius * 0.985, 0.018, 20]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.5} metalness={0.65} />
      </mesh>
      {onFloor && (
        <group>
          {([[-1,0],[1,0],[0,-1],[0,1]] as [number,number][]).map(([dx,dz],i) => (
            <mesh key={i} position={[dx*(radius+0.045), -hm/2+0.03, dz*(radius+0.045)]}>
              <boxGeometry args={[0.065,0.065,0.065]} />
              <meshStandardMaterial color="#7c3d12" roughness={0.9} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

function BaleShape({ lm, hm, wm, color, hovered, tiltColor, onPointerOver, onPointerOut }: PackageShapeProps) {
  const baleColor = color || "#d4c5a3";
  const bandColor = "#3a2818";
  return (
    <group onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[lm * 0.96, hm * 0.96, wm * 0.96]} />
        <meshStandardMaterial
          color={baleColor}
          roughness={0.95}
          metalness={0}
          emissive={hovered ? tiltColor : "#000000"}
          emissiveIntensity={hovered ? 0.25 : 0}
        />
      </mesh>
      {[-hm * 0.18, hm * 0.18].map((y, i) => (
        <mesh key={`bh-${i}`} position={[0, y, 0]}>
          <boxGeometry args={[lm * 0.99, hm * 0.04, wm * 0.99]} />
          <meshStandardMaterial color={bandColor} roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[lm * 0.04, hm * 0.99, wm * 0.99]} />
        <meshStandardMaterial color={bandColor} roughness={0.7} />
      </mesh>
    </group>
  );
}

function CrateShape({ lm, hm, wm, color, hovered, tiltColor, showEdges = true, onPointerOver, onPointerOut }: PackageShapeProps) {
  const crateColor = color || "#a07a4e";
  const slatColor = "#5a3d20";
  const slatThk = Math.min(lm, wm) * 0.06;
  return (
    <group onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[lm, hm, wm]} />
        <meshStandardMaterial
          color={crateColor}
          roughness={0.85}
          metalness={0}
          emissive={hovered ? tiltColor : "#000000"}
          emissiveIntensity={hovered ? 0.25 : 0}
        />
        {showEdges && (
          <Edges scale={0.999} color="#3a2818">
            <lineBasicMaterial color="#3a2818" />
          </Edges>
        )}
      </mesh>
      {[
        [-lm / 2 + slatThk / 2, -wm / 2 + slatThk / 2],
        [lm / 2 - slatThk / 2, -wm / 2 + slatThk / 2],
        [-lm / 2 + slatThk / 2, wm / 2 - slatThk / 2],
        [lm / 2 - slatThk / 2, wm / 2 - slatThk / 2],
      ].map(([x, z], i) => (
        <mesh key={`s-${i}`} position={[x, 0, z]}>
          <boxGeometry args={[slatThk, hm * 0.998, slatThk]} />
          <meshStandardMaterial color={slatColor} roughness={0.85} />
        </mesh>
      ))}
      {[wm / 2 - 0.003, -wm / 2 + 0.003].map((z, i) => (
        <mesh key={`hb-${i}`} position={[0, 0, z]}>
          <boxGeometry args={[lm * 0.95, hm * 0.08, 0.005]} />
          <meshStandardMaterial color={slatColor} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

function PalletShape({ lm, hm, wm, color, hovered, tiltColor, showEdges = true, onPointerOver, onPointerOut }: PackageShapeProps) {
  const PALLET_H = 0.12;
  const loadH = Math.max(0.05, hm - PALLET_H);
  const wrapColor = "#a8c5d8";
  return (
    <group onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
      <group position={[0, -hm / 2 + PALLET_H / 2, 0]}>
        <WoodenPallet lm={lm} wm={wm} />
      </group>
      <mesh castShadow receiveShadow position={[0, -hm / 2 + PALLET_H + loadH / 2, 0]}>
        <boxGeometry args={[lm * 0.96, loadH, wm * 0.96]} />
        <meshStandardMaterial
          color={color || "#bcd"}
          roughness={0.4}
          metalness={0.1}
          transparent
          opacity={0.55}
          emissive={hovered ? tiltColor : wrapColor}
          emissiveIntensity={hovered ? 0.25 : 0.05}
        />
        {showEdges && (
          <Edges scale={0.999} color="#5a7a90">
            <lineBasicMaterial color="#5a7a90" />
          </Edges>
        )}
      </mesh>
    </group>
  );
}

/** Build a rounded-cone profile for a tied bag ear. Returns the lathe
 *  points: a soft taper from base → middle → upper → tip with the tip
 *  rounded over so the silhouette reads as fabric pinched together with
 *  a string tie. Memoised by base radius / height in the caller. */
function buildEarProfile(baseR: number, height: number): THREE.Vector2[] {
  const tipY = height;
  return [
    new THREE.Vector2(0.001, 0),                       // start at axis (closed base)
    new THREE.Vector2(baseR * 1.0,  height * 0.05),    // flare out at base
    new THREE.Vector2(baseR * 0.85, height * 0.30),    // mid taper
    new THREE.Vector2(baseR * 0.55, height * 0.55),    // pinch (tie point)
    new THREE.Vector2(baseR * 0.65, height * 0.72),    // small bulge above tie
    new THREE.Vector2(baseR * 0.30, height * 0.92),    // upper taper
    new THREE.Vector2(0.001, tipY),                    // close at tip
  ];
}

function BagShape({ lm, hm, wm, color, hovered, tiltColor, onPointerOver, onPointerOut }: PackageShapeProps) {
  // Sack-style bag: a soft rounded box at the real L × H × W footprint, plus
  // two tapered "ear" cones at the top length-ends suggesting the tied /
  // pinch-point corners of an industrial bag. Ears scale with the bag so
  // they stay proportionate from a 25 kg cement sack to a 1-tonne FIBC.
  const { jute } = useContext(BagTextureContext);
  const minDim = Math.min(lm, hm, wm);
  const corner = Math.max(0.02, Math.min(minDim * 0.18, minDim * 0.45));
  const earBaseR = Math.max(0.015, Math.min(hm, wm) * 0.12);
  const earHeight = Math.max(0.03, Math.min(hm, wm) * 0.22);
  const earOffsetX = lm / 2 - earBaseR * 0.6; // tucked just inside the top edge
  const earOffsetY = hm / 2;                  // base sits flush on top face
  const tieY = earHeight * 0.55;              // tie band at the pinch
  const sackColor = color || "#c4a574";
  const tieColor = "#5b4226";                 // tonally darker cord

  // Procedural jute texture is built lazily and cached per colour.
  const juteMap = useMemo(
    () => (jute ? makeJuteTexture(sackColor) : null),
    [jute, sackColor],
  );
  // Repeat scaling so the weave size stays plausible regardless of bag size.
  const fabricMap = useMemo(() => {
    if (!juteMap) return null;
    const t = juteMap.clone();
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(Math.max(2, lm * 4), Math.max(2, hm * 4));
    t.needsUpdate = true;
    return t;
  }, [juteMap, lm, hm]);

  const earProfile = useMemo(
    () => buildEarProfile(earBaseR, earHeight),
    [earBaseR, earHeight],
  );

  // When jute is on we drop the colour tint to white so the texture's tones
  // come through cleanly; otherwise keep the existing solid-colour material.
  const bodyColor = jute ? "#ffffff" : sackColor;
  const earColor = jute ? "#ffffff" : sackColor;

  return (
    <group onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
      {/* Main sack body — rounded box at the bag's actual dimensions. */}
      <RoundedBox
        args={[lm, hm, wm]}
        radius={corner}
        smoothness={3}
        creaseAngle={0.6}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={bodyColor}
          map={fabricMap ?? undefined}
          roughness={0.95}
          metalness={0}
          emissive={hovered ? tiltColor : "#000000"}
          emissiveIntensity={hovered ? 0.25 : 0}
        />
      </RoundedBox>
      {/* Two tapered ear-ties at the top length-ends. */}
      {[-1, 1].map((sign) => (
        <group key={sign} position={[sign * earOffsetX, earOffsetY, 0]}>
          {/* Lathed cone — fabric pinched into a tied tip. */}
          <mesh castShadow receiveShadow>
            <latheGeometry args={[earProfile, 18]} />
            <meshStandardMaterial
              color={earColor}
              map={fabricMap ?? undefined}
              roughness={0.95}
              metalness={0}
              emissive={hovered ? tiltColor : "#000000"}
              emissiveIntensity={hovered ? 0.25 : 0}
            />
          </mesh>
          {/* Thin "string" tie at the pinch point. */}
          <mesh position={[0, tieY, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <torusGeometry args={[earBaseR * 0.6, earBaseR * 0.09, 6, 14]} />
            <meshStandardMaterial color={tieColor} roughness={0.7} metalness={0} />
          </mesh>
        </group>
      ))}
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


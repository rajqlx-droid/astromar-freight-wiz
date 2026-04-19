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
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Edges, Grid, Html } from "@react-three/drei";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AdvancedPackResult } from "@/lib/freight/packing-advanced";
import type { PlacedBox } from "@/lib/freight/packing";
import {
  buildTimeline,
  cameraInfoForFrame,
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
}

interface Props {
  pack: AdvancedPackResult;
  height?: number;
}

/**
 * We work in metres in the scene (mm / 1000) so the camera distances are sane.
 */
const MM_PER_M = 1000;

export const Container3DView = forwardRef<Container3DHandle, Props>(function Container3DView(
  { pack, height = 420 },
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
  }));

  return (
    <div
      className="relative overflow-hidden rounded-lg border bg-gradient-to-b from-[oklch(0.97_0.005_240)] to-[oklch(0.92_0.01_240)] dark:from-[oklch(0.18_0.01_240)] dark:to-[oklch(0.12_0.01_240)]"
      style={{ height }}
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
        }}
      >
        <Suspense fallback={<Html center>Loading 3D…</Html>}>
          <SceneContents
            pack={pack}
            Cm={Cm}
            preset={preset}
            recording={recordingTimeline}
            frame={currentFrame}
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

      <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-background/80 px-2 py-1 text-[10px] font-medium text-muted-foreground backdrop-blur">
        Drag to rotate · Scroll to zoom · Double-click to reset
      </div>
    </div>
  );
});

/* --------------- Scene contents --------------- */

function SceneContents({
  pack,
  Cm,
  preset,
  recording,
  frame,
}: {
  pack: AdvancedPackResult;
  Cm: { l: number; w: number; h: number };
  preset: Preset;
  recording: Timeline | null;
  frame: number;
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

      {/* Floor grid in metres */}
      <Grid
        position={[0, 0, 0]}
        args={[Math.max(Cm.l, Cm.w) * 2, Math.max(Cm.l, Cm.w) * 2]}
        cellSize={0.5}
        cellThickness={0.5}
        sectionSize={1}
        sectionThickness={1.2}
        sectionColor="#1B3A6B"
        cellColor="#94a3b8"
        fadeDistance={Math.max(Cm.l, Cm.w) * 3}
        fadeStrength={1}
        infiniteGrid={false}
      />

      <ContainerShell Cm={Cm} />

      {/* Cargo */}
      <group position={[-Cm.l / 2, 0, -Cm.w / 2]}>
        {pack.placed.map((b, i) => {
          const t = transforms?.[i];
          // When recording: skip boxes that aren't visible yet, apply offsets.
          if (recording && t && !t.visible) return null;
          return (
            <CargoBox
              key={i}
              box={b}
              stat={pack.perItem[b.itemIdx]}
              offset={t?.offset}
              scale={t?.scale}
            />
          );
        })}
      </group>

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

function ContainerShell({ Cm }: { Cm: { l: number; w: number; h: number } }) {
  // Centered at origin.
  return (
    <group>
      {/* Floor — solid */}
      <mesh receiveShadow position={[0, -0.005, 0]}>
        <boxGeometry args={[Cm.l, 0.01, Cm.w]} />
        <meshStandardMaterial color="#cbd5e1" />
      </mesh>

      {/* Translucent walls */}
      <mesh position={[0, Cm.h / 2, -Cm.w / 2]}>
        <boxGeometry args={[Cm.l, Cm.h, 0.02]} />
        <meshStandardMaterial color="#60a5fa" transparent opacity={0.18} />
        <Edges color="#1B3A6B" />
      </mesh>
      <mesh position={[-Cm.l / 2, Cm.h / 2, 0]}>
        <boxGeometry args={[0.02, Cm.h, Cm.w]} />
        <meshStandardMaterial color="#60a5fa" transparent opacity={0.18} />
        <Edges color="#1B3A6B" />
      </mesh>
      <mesh position={[Cm.l / 2, Cm.h / 2, 0]}>
        <boxGeometry args={[0.02, Cm.h, Cm.w]} />
        <meshStandardMaterial color="#60a5fa" transparent opacity={0.10} />
        <Edges color="#1B3A6B" />
      </mesh>
      <mesh position={[0, Cm.h / 2, Cm.w / 2]}>
        <boxGeometry args={[Cm.l, Cm.h, 0.02]} />
        <meshStandardMaterial color="#60a5fa" transparent opacity={0.08} />
        <Edges color="#1B3A6B" />
      </mesh>

      {/* Top frame edges */}
      <mesh position={[0, Cm.h, 0]}>
        <boxGeometry args={[Cm.l, 0.02, Cm.w]} />
        <meshStandardMaterial color="#1B3A6B" transparent opacity={0.08} />
        <Edges color="#1B3A6B" />
      </mesh>
    </group>
  );
}

function CargoBox({
  box,
  stat,
  offset,
  scale = 1,
}: {
  box: PlacedBox;
  stat?: { stackable: boolean; fragile: boolean; packageType: string };
  offset?: [number, number, number];
  scale?: number;
}) {
  const lm = box.l / MM_PER_M;
  const wm = box.w / MM_PER_M;
  const hm = box.h / MM_PER_M;
  const cx = box.x / MM_PER_M + lm / 2 + (offset?.[0] ?? 0);
  const cy = box.z / MM_PER_M + hm / 2 + (offset?.[1] ?? 0);
  const cz = box.y / MM_PER_M + wm / 2 + (offset?.[2] ?? 0);
  const nonStack = stat && !stat.stackable;
  const fragile = stat?.fragile;

  return (
    <group position={[cx, cy, cz]} scale={scale}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[lm, hm, wm]} />
        <meshStandardMaterial
          color={box.color}
          roughness={0.6}
          metalness={0.05}
          transparent={fragile}
          opacity={fragile ? 0.85 : 1}
        />
        <Edges color="rgba(0,0,0,0.35)" />
      </mesh>
      {/* Non-stackable warning stripe on top */}
      {nonStack && (
        <mesh position={[0, hm / 2 + 0.005, 0]}>
          <boxGeometry args={[lm * 0.95, 0.01, wm * 0.15]} />
          <meshStandardMaterial color="#dc2626" />
        </mesh>
      )}
    </group>
  );
}

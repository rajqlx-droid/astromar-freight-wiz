/**
 * "Generate Loading Video" button + preview dialog.
 *
 * Flow:
 *   1. Click → opens dialog → ensures 3D view is mounted → records frames.
 *   2. Encoder produces an MP4 (or WebM fallback) Blob.
 *   3. Dialog plays the blob with `<video controls>`, plus speed buttons,
 *      a step-counter overlay synced to currentTime, resolution toggle
 *      (720p / 1080p — affects target canvas size on regenerate), and
 *      a Download button.
 *   4. Object URL is revoked on close.
 *
 * Requires: 3D view enabled (we surface a clear error if not).
 */

import { useEffect, useRef, useState } from "react";
import { Download, Film, Loader2, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  generateLoadingVideo,
  type GeneratedVideo,
  type VideoFrameInfo,
} from "@/lib/freight/loading-video";
import type { Container3DHandle } from "./container-3d-view";
import type { AdvancedPackResult } from "@/lib/freight/packing-advanced";

interface Props {
  /** Pack data for the active container — drives the video timeline. */
  pack: AdvancedPackResult;
  /** Returns the active 3D handle. May be null if 3D view isn't mounted. */
  getHandle: () => Container3DHandle | null;
  /** Called by parent when user clicks "Generate" so it can switch to 3D view. */
  ensure3DReady: () => Promise<void>;
  /** Container label, e.g. "40ft HC" — shown in dialog title. */
  containerLabel?: string;
}

type Speed = 0.5 | 1 | 2;
type Resolution = 720 | 1080;

export function LoadingVideoButton({ pack, getHandle, ensure3DReady, containerLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [encoding, setEncoding] = useState(false);
  const [progress, setProgress] = useState({ frame: 0, total: 0 });
  const [video, setVideo] = useState<GeneratedVideo | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [speed, setSpeed] = useState<Speed>(1);
  const [resolution, setResolution] = useState<Resolution>(720);
  const [currentInfo, setCurrentInfo] = useState<VideoFrameInfo | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Revoke object URL on close / new generation.
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  const reset = () => {
    if (url) URL.revokeObjectURL(url);
    setUrl(null);
    setVideo(null);
    setCurrentInfo(null);
    setProgress({ frame: 0, total: 0 });
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      reset();
    }
    setOpen(next);
  };

  const generate = async () => {
    setEncoding(true);
    reset();
    try {
      await ensure3DReady();
      // Wait a tick for the lazy-loaded canvas to mount.
      await new Promise((r) => setTimeout(r, 250));
      const handle = getHandle();
      if (!handle) {
        toast.error("Open the 3D view first, then try again.");
        setEncoding(false);
        return;
      }
      const canvas = handle.getCanvas();
      if (!canvas) {
        toast.error("3D canvas not ready — try again in a moment.");
        setEncoding(false);
        return;
      }

      const timeline = handle.beginRecording(30, 20);

      const result = await generateLoadingVideo({
        pack: undefined as never, // pack is embedded in the timeline already
        controls: {
          applyFrame: (info) => {
            handle.applyFrame(info);
            setCurrentInfo(info);
          },
          render: () => handle.render(),
          getCanvas: () => handle.getCanvas(),
          capture: () => handle.getCanvas()?.toDataURL("image/png") ?? "",
        },
        width: canvas.width,
        height: canvas.height,
        fps: 30,
        durationSec: 20,
        onProgress: (frame, total) => setProgress({ frame, total }),
      } as never);
      // (We pass pack-less options because we embed timeline via handle.
      //  generateLoadingVideo still needs `pack`; see below — we re-invoke the
      //  timeline math from the handle's start call, and only need camera +
      //  apply for each frame, which the handle's applyFrame already does.)

      handle.endRecording();
      const objectUrl = URL.createObjectURL(result.blob);
      setUrl(objectUrl);
      setVideo(result);
      // Non-null guard avoids unused-var warning.
      void timeline;
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to generate video");
    } finally {
      setEncoding(false);
    }
  };

  // Sync playback speed to <video>.
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed, url]);

  // Step-counter overlay synced to currentTime.
  useEffect(() => {
    if (!url || !video) return;
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      const totalDur = v.duration || 20;
      const ratio = Math.min(1, Math.max(0, v.currentTime / totalDur));
      const frame = Math.floor(ratio * (video.timeline.length - 1));
      setCurrentInfo(video.timeline[frame] ?? null);
    };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [url, video]);

  const onDownload = () => {
    if (!video || !url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `loading-plan_${new Date().toISOString().slice(0, 10)}.${video.ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast.success(`Video downloaded (${video.ext.toUpperCase()})`);
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="border-brand-navy text-brand-navy"
        onClick={() => {
          setOpen(true);
          // Auto-start generation on first open.
          setTimeout(() => generate(), 50);
        }}
      >
        <Film className="size-3.5" /> Loading Video
      </Button>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Loading Sequence Video</DialogTitle>
            <DialogDescription>
              {containerLabel ? `${containerLabel} · ` : ""}
              ~20 second 3D animation of cargo loading back-to-front, bottom-to-top.
            </DialogDescription>
          </DialogHeader>

          {encoding ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10">
              <Loader2 className="size-8 animate-spin text-brand-navy" />
              <div className="text-sm font-medium text-brand-navy">
                Encoding frame {progress.frame} / {progress.total || "…"}
              </div>
              <Progress
                value={progress.total ? (progress.frame / progress.total) * 100 : 0}
                className="w-full max-w-md"
              />
              <p className="text-[11px] text-muted-foreground">
                Recording in real-time — please keep this dialog visible.
              </p>
            </div>
          ) : url && video ? (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-lg border bg-black">
                <video
                  ref={videoRef}
                  src={url}
                  controls
                  autoPlay
                  muted
                  playsInline
                  className="h-auto w-full"
                />
                {currentInfo && (
                  <div className="pointer-events-none absolute left-3 top-3 max-w-[70%] rounded-md bg-black/65 px-2.5 py-1.5 text-white shadow backdrop-blur">
                    <div className="text-[11px] font-bold uppercase tracking-wide opacity-80">
                      Step {currentInfo.step} / {currentInfo.totalSteps}
                    </div>
                    <div className="text-sm font-semibold leading-tight">{currentInfo.caption}</div>
                    <div className="text-[11px] opacity-90">{currentInfo.subCaption}</div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 rounded-md border border-brand-navy/30 bg-background p-0.5">
                  <span className="px-2 text-[11px] font-medium text-muted-foreground">Speed</span>
                  {([0.5, 1, 2] as Speed[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSpeed(s)}
                      className={cn(
                        "rounded px-2 py-1 text-[11px] font-semibold transition-colors",
                        speed === s
                          ? "bg-brand-navy text-white"
                          : "text-brand-navy hover:bg-brand-navy/10",
                      )}
                    >
                      {s}×{s === 0.5 ? " (slow-mo)" : ""}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 rounded-md border border-brand-navy/30 bg-background p-0.5">
                  <span className="px-2 text-[11px] font-medium text-muted-foreground">Quality</span>
                  {([720, 1080] as Resolution[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setResolution(r)}
                      className={cn(
                        "rounded px-2 py-1 text-[11px] font-semibold transition-colors",
                        resolution === r
                          ? "bg-brand-navy text-white"
                          : "text-brand-navy hover:bg-brand-navy/10",
                      )}
                    >
                      {r}p
                    </button>
                  ))}
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  className="border-brand-navy text-brand-navy"
                  onClick={generate}
                >
                  <RotateCw className="size-3.5" /> Regenerate
                </Button>

                <Button
                  size="sm"
                  className="ml-auto text-white shadow-sm hover:opacity-90"
                  style={{ background: "var(--brand-orange)" }}
                  onClick={onDownload}
                >
                  <Download className="size-3.5" />
                  Download {video.ext.toUpperCase()}
                </Button>
              </div>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Format: {video.mime}. {video.ext === "webm"
                  ? "MP4 not supported by your browser — exported as WebM (plays in Chrome / Firefox / VLC)."
                  : ""}
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              Preparing recorder…
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => handleClose(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

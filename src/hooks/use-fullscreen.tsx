/**
 * Tiny hook around the Fullscreen API.
 *
 * Returns:
 *   - `isFullscreen` — true when `targetRef.current` (or any descendant) is
 *     currently the document's fullscreen element.
 *   - `toggle()` — request fullscreen on the target if not active; otherwise
 *     exit fullscreen.
 *   - `request()` / `exit()` — explicit calls.
 *
 * Safe on SSR (no document access at module scope) and tolerates browsers
 * that prefix the API (Safari).
 */
import { useCallback, useEffect, useState, type RefObject } from "react";

type FsDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
};
type FsEl = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void>;
};

function getFsElement(): Element | null {
  if (typeof document === "undefined") return null;
  const d = document as FsDoc;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

export function useFullscreen(targetRef: RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const update = () => {
      const fsEl = getFsElement();
      const target = targetRef.current;
      setIsFullscreen(!!target && !!fsEl && (target === fsEl || target.contains(fsEl)));
    };
    document.addEventListener("fullscreenchange", update);
    document.addEventListener("webkitfullscreenchange", update);
    update();
    return () => {
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("webkitfullscreenchange", update);
    };
  }, [targetRef]);

  const request = useCallback(async () => {
    const el = targetRef.current as FsEl | null;
    if (!el) return;
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    } catch {
      /* user gesture may be missing or feature blocked — silently ignore */
    }
  }, [targetRef]);

  const exit = useCallback(async () => {
    if (typeof document === "undefined") return;
    const d = document as FsDoc;
    try {
      if (d.exitFullscreen) await d.exitFullscreen();
      else if (d.webkitExitFullscreen) await d.webkitExitFullscreen();
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(async () => {
    if (isFullscreen) await exit();
    else await request();
  }, [isFullscreen, request, exit]);

  return { isFullscreen, toggle, request, exit };
}

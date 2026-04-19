/**
 * "Snapshot for Remotion" button — exports the active pack as scenario.json
 * so the offline Remotion render produces a video for the user's exact load.
 *
 * Drop the downloaded file at `remotion/public/scenario.json` and re-run
 * `node scripts/render-remotion.mjs` to get a per-scenario MP4.
 */

import { useState } from "react";
import { Camera, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  buildScenarioJson,
  downloadScenarioJson,
} from "@/lib/freight/scenario-snapshot";
import type { AdvancedPackResult } from "@/lib/freight/packing-advanced";
import type { CbmItem } from "@/lib/freight/calculators";

interface Props {
  pack: AdvancedPackResult;
  /** Source items, used to pull fragile / no-stack flags into the JSON. */
  items: CbmItem[];
}

// Flags on CbmItem are optional and not all forms expose them — read defensively.
type ItemWithFlags = CbmItem & { fragile?: boolean; nonStack?: boolean };

export function ScenarioSnapshotButton({ pack, items }: Props) {
  const [done, setDone] = useState(false);

  const onClick = () => {
    try {
      const payload = buildScenarioJson(pack, (itemIdx) => {
        const it = items[itemIdx] as ItemWithFlags | undefined;
        return {
          fragile: it?.fragile,
          nonStack: it?.nonStack,
        };
      });
      downloadScenarioJson(payload, "scenario.json");
      setDone(true);
      toast.success("scenario.json downloaded — drop it in remotion/public/ and re-render.");
      setTimeout(() => setDone(false), 2500);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Could not export scenario.json");
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={onClick}
      className="border-brand-navy text-brand-navy"
      title="Export this exact pack as scenario.json for the offline Remotion render"
    >
      {done ? <Check className="size-3.5" /> : <Camera className="size-3.5" />}
      {done ? "Saved" : "Snapshot for Remotion"}
    </Button>
  );
}

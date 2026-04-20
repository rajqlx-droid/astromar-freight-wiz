/**
 * Dialog that lets the user pick two calculators to compare side-by-side.
 * On confirm, opens the SplitCompareView which renders both calculators
 * inside the same page.
 *
 * Mobile-friendly: dialog stacks the two pickers vertically; the resulting
 * split view falls back to a tabbed switcher below xl.
 */
import { useEffect, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { CALCULATORS, type CalcKey } from "@/lib/freight/types";

interface Props {
  /** Currently active calculator — used as the default for "Left". */
  active: CalcKey;
  /** Called when the user confirms a pair. Pass the same key twice is rejected. */
  onConfirm: (left: CalcKey, right: CalcKey) => void;
  /** Optional render-prop for a custom trigger; defaults to a header button. */
  trigger?: React.ReactNode;
}

export function CompareDialog({ active, onConfirm, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [left, setLeft] = useState<CalcKey>(active);
  const [right, setRight] = useState<CalcKey>(() => {
    const other = CALCULATORS.find((c) => c.key !== active);
    return other ? other.key : "air";
  });

  // When the dialog opens, sync "left" with the currently active tool.
  useEffect(() => {
    if (open) {
      setLeft(active);
      if (right === active) {
        const other = CALCULATORS.find((c) => c.key !== active);
        if (other) setRight(other.key);
      }
    }
  }, [open, active, right]);

  const same = left === right;

  const handleConfirm = () => {
    if (same) return;
    onConfirm(left, right);
    setOpen(false);
  };

  const swap = () => {
    setLeft(right);
    setRight(left);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            size="sm"
            variant="outline"
            className="border-brand-navy text-brand-navy"
          >
            <ArrowLeftRight className="size-4" />
            <span className="hidden sm:inline">Compare</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8 text-brand-navy">
            <ArrowLeftRight className="size-4 shrink-0 text-brand-orange" />
            <span className="truncate">Compare two calculators</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Pick two tools to view side-by-side.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-end">
          <div className="min-w-0 space-y-1">
            <Label className="text-xs font-semibold text-brand-navy">Left tool</Label>
            <Select value={left} onValueChange={(v) => setLeft(v as CalcKey)}>
              <SelectTrigger className="h-10 w-full border-2 border-brand-navy/30">
                <SelectValue>
                  {(() => {
                    const c = CALCULATORS.find((x) => x.key === left);
                    return c ? (
                      <span className="truncate">
                        {c.emoji} {c.label}
                      </span>
                    ) : null;
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CALCULATORS.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">
                        {c.emoji} {c.label}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {c.sub}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={swap}
            aria-label="Swap left and right"
            className="hidden md:flex"
          >
            <ArrowLeftRight className="size-4 text-muted-foreground" />
          </Button>

          <div className="min-w-0 space-y-1">
            <Label className="text-xs font-semibold text-brand-navy">Right tool</Label>
            <Select value={right} onValueChange={(v) => setRight(v as CalcKey)}>
              <SelectTrigger className="h-10 w-full border-2 border-brand-navy/30">
                <SelectValue>
                  {(() => {
                    const c = CALCULATORS.find((x) => x.key === right);
                    return c ? (
                      <span className="truncate">
                        {c.emoji} {c.label}
                      </span>
                    ) : null;
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CALCULATORS.map((c) => (
                  <SelectItem
                    key={c.key}
                    value={c.key}
                    disabled={c.key === left}
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">
                        {c.emoji} {c.label}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {c.sub}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {same && (
          <p className="text-xs font-medium text-destructive">
            Pick two different calculators to compare.
          </p>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-2">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={same}
            className="w-full text-white sm:w-auto"
            style={{ background: "var(--brand-orange)" }}
          >
            Open split view
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

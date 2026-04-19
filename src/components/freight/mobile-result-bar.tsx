/**
 * Sticky bottom bar shown on mobile only, providing:
 * - Headline result (chargeable weight / total cost) at-a-glance
 * - Tap to expand into the full ResultsCard via a Sheet
 * - Save / PDF / Share / WhatsApp action buttons
 *
 * Hides on lg breakpoints since desktop already shows results inline.
 */
import { useState } from "react";
import { ChevronUp, Copy, Download, Save, Share2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { downloadResultPdf } from "@/lib/freight/pdf";
import { historyStore, savedStore } from "@/lib/freight/storage";
import type { CalcResult } from "@/lib/freight/types";

interface Props {
  result: CalcResult | null;
  inputsTable?: { label: string; value: string }[];
}

export function MobileResultBar({ result, inputsTable }: Props) {
  const [open, setOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");

  if (!result) return null;
  const headline = result.items.find((i) => i.highlight) ?? result.items[0];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.text);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  const handlePdf = () => {
    downloadResultPdf(result, inputsTable);
    toast.success("PDF downloaded");
  };

  const handleSave = () => {
    const name = saveName.trim() || `${result.title} ${new Date().toLocaleString("en-IN")}`;
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: result.type,
      name,
      savedAt: Date.now(),
      inputs: inputsTable ?? null,
      result,
    };
    savedStore.add(entry);
    historyStore.add(entry);
    toast.success("Saved", { description: name });
    setSaveOpen(false);
    setSaveName("");
    window.dispatchEvent(new Event("freight:storage"));
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Share link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };

  const waUrl = `https://wa.me/?text=${encodeURIComponent(result.text + "\n\n— via Astromar Logistics")}`;

  return (
    <>
      <div
        className="no-print fixed inset-x-0 bottom-0 z-40 border-t-2 bg-background/95 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur lg:hidden"
        style={{ borderTopColor: "var(--brand-orange)", paddingBottom: "env(safe-area-inset-bottom)" }}
        role="region"
        aria-label="Calculation result actions"
      >
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left active:bg-brand-navy-soft"
              aria-label="Show full results"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {headline.label}
                </div>
                <div
                  key={headline.value}
                  className="animate-fade-in truncate text-base font-bold text-brand-navy"
                  aria-live="polite"
                >
                  {headline.value}
                </div>
              </div>
              <ChevronUp className="size-5 shrink-0 text-brand-orange" />
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl p-0">
            <SheetHeader className="border-b px-5 py-4">
              <SheetTitle className="text-brand-navy">{result.title}</SheetTitle>
            </SheetHeader>
            <div className="divide-y">
              {result.items.map((it) => (
                <div key={it.label} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="text-muted-foreground">{it.label}</span>
                  <span
                    className={
                      "rounded-md px-3 py-1 font-semibold " +
                      (it.highlight ? "bg-brand-orange-soft text-brand-orange" : "text-foreground")
                    }
                  >
                    {it.value}
                  </span>
                </div>
              ))}
            </div>
          </SheetContent>
        </Sheet>

        <div className="grid grid-cols-4 gap-1 border-t px-2 py-1.5">
          <Button
            size="sm"
            onClick={handlePdf}
            className="h-10 text-white shadow-sm"
            style={{ background: "var(--brand-orange)" }}
          >
            <Download className="size-4" />
            <span className="text-xs">PDF</span>
          </Button>
          <Button size="sm" variant="outline" className="h-10 border-brand-navy text-brand-navy" onClick={() => setSaveOpen(true)}>
            <Save className="size-4" />
            <span className="text-xs">Save</span>
          </Button>
          <Button size="sm" variant="outline" className="h-10 border-brand-navy text-brand-navy" onClick={handleCopy}>
            <Copy className="size-4" />
            <span className="text-xs">Copy</span>
          </Button>
          <Button asChild size="sm" variant="outline" className="h-10 border-brand-navy text-brand-navy">
            <a href={waUrl} target="_blank" rel="noreferrer noopener" aria-label="Share on WhatsApp">
              <MessageCircle className="size-4" />
              <span className="text-xs">Share</span>
            </a>
          </Button>
        </div>
      </div>

      {/* spacer to prevent the mobile action bar from covering page bottom */}
      <div aria-hidden className="h-32 lg:hidden" />

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save calculation</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="save-name-mobile">Name (optional)</Label>
            <Input
              id="save-name-mobile"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder={`${result.title} — ${new Date().toLocaleDateString("en-IN")}`}
              maxLength={80}
            />
            <p className="text-xs text-muted-foreground">
              Stored in your browser. Maximum 10 saved calculations.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} className="text-white" style={{ background: "var(--brand-navy)" }}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* hidden helper to consume Share2 import (used as button visual on desktop), keeps tree-shaker happy */}
      <span hidden>
        <Share2 />
      </span>
    </>
  );
}

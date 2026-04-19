/**
 * Results card with action toolbar (PDF, Copy, Save, Print, Share, Email).
 */
import { useState } from "react";
import {
  Copy,
  Download,
  Printer,
  Save,
  Share2,
  Mail,
  MessageCircle,
  Link as LinkIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { downloadResultPdf, type PdfExtras } from "@/lib/freight/pdf";
import { historyStore, savedStore } from "@/lib/freight/storage";
import type { CalcResult } from "@/lib/freight/types";

interface Props {
  result: CalcResult | null;
  inputsTable?: { label: string; value: string }[];
  onLoadSaved?: () => void;
  /** Optional async resolver for extras (e.g. 3D snapshots). Called at PDF time. */
  resolveExtras?: () => Promise<PdfExtras | undefined> | PdfExtras | undefined;
}

export function ResultsCard({ result, inputsTable, resolveExtras }: Props) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");

  if (!result) {
    return (
      <Card
        className="flex min-h-[260px] items-center justify-center border-2 border-dashed text-sm text-muted-foreground"
        style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 25%, transparent)" }}
      >
        Enter values on the left to see results.
      </Card>
    );
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.text);
      toast.success("Results copied to clipboard");
    } catch {
      toast.error("Could not copy");
    }
  };

  const handlePdf = async () => {
    const extras = resolveExtras ? await resolveExtras() : undefined;
    downloadResultPdf(result, inputsTable, extras);
    toast.success("PDF downloaded");
  };

  const handlePrint = () => window.print();

  const handleSave = () => {
    const id = crypto.randomUUID();
    const name = saveName.trim() || `${result.title} ${new Date().toLocaleString("en-IN")}`;
    const entry = {
      id,
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
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };

  const waUrl = `https://wa.me/?text=${encodeURIComponent(result.text + "\n\n— via Astromar Logistics")}`;
  const mailUrl = `mailto:sales@astromarfreezone.com?subject=${encodeURIComponent(
    `[${result.title}] Calculation`,
  )}&body=${encodeURIComponent(result.text)}`;

  return (
    <>
      <Card
        className="print-area overflow-hidden border-2 shadow-sm"
        style={{
          borderColor: "var(--brand-navy)",
          background:
            "linear-gradient(180deg, var(--brand-navy-soft) 0%, var(--background) 70%)",
        }}
        aria-live="polite"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
          <h3 className="text-base font-bold text-brand-navy">Results</h3>
          {/* Desktop toolbar — mobile uses the sticky MobileResultBar instead */}
          <div className="no-print hidden flex-wrap gap-1.5 lg:flex">
            <Button
              size="sm"
              onClick={handlePdf}
              className="text-white shadow-sm hover:opacity-90"
              style={{ background: "var(--brand-orange)" }}
            >
              <Download className="size-3.5" /> PDF
            </Button>
            <Button size="sm" variant="outline" className="border-brand-navy text-brand-navy" onClick={handleCopy}>
              <Copy className="size-3.5" /> Copy
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-brand-navy text-brand-navy"
              onClick={() => setSaveOpen(true)}
            >
              <Save className="size-3.5" /> Save
            </Button>
            <Button size="sm" variant="outline" className="border-brand-navy text-brand-navy" onClick={handlePrint}>
              <Printer className="size-3.5" /> Print
            </Button>
            <Button size="sm" variant="outline" className="border-brand-navy text-brand-navy" onClick={handleShare}>
              <Share2 className="size-3.5" /> Share
            </Button>
            <Button asChild size="sm" variant="outline" className="border-brand-navy text-brand-navy">
              <a href={mailUrl}>
                <Mail className="size-3.5" /> Email
              </a>
            </Button>
            <Button asChild size="sm" variant="outline" className="border-brand-navy text-brand-navy">
              <a href={waUrl} target="_blank" rel="noreferrer noopener">
                <MessageCircle className="size-3.5" /> WhatsApp
              </a>
            </Button>
          </div>
        </div>

        <div className="divide-y">
          {result.items.map((it) => (
            <div
              key={it.label}
              className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
            >
              <span className="text-muted-foreground">{it.label}</span>
              <span
                key={it.value}
                className={
                  "animate-fade-in rounded-md px-3 py-1 font-semibold " +
                  (it.highlight
                    ? "bg-brand-orange-soft text-brand-orange"
                    : "text-foreground")
                }
              >
                {it.value}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save calculation</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="save-name">Name (optional)</Label>
            <Input
              id="save-name"
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
            <Button
              onClick={handleSave}
              className="text-white"
              style={{ background: "var(--brand-navy)" }}
            >
              <LinkIcon className="size-3.5" /> Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

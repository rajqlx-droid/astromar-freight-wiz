import { useState } from "react";
import { Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { CargoLine } from "@/lib/freight/types";
import { nextId } from "@/lib/freight/ids";

type Mode = "landed" | "export";

interface Props {
  mode: Mode;
  /** Called with parsed lines when the user confirms. Replaces existing lines. */
  onImport: (lines: CargoLine[]) => void;
}

const SAMPLE_LANDED = `Description,HS Code,Qty,Unit Value,Duty %
Cotton T-shirts,6109.10,500,3.5,12
Brass valves,7419.99,120,8.25,7.5
Ceramic mugs,6912.00,200,1.9,15`;

const SAMPLE_EXPORT = `Description,HS Code,Qty,Unit Cost,Margin %
Brass valves,7419.99,120,4.5,25
Wooden crates,4415.10,80,12,18
Cotton bedsheets,6302.21,250,9.75,30`;

/** Parse a single CSV line, supporting quoted fields with commas. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' ) {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseRows(raw: string, mode: Mode): { lines: CargoLine[]; skipped: number } {
  const text = raw.replace(/\r/g, "").trim();
  if (!text) return { lines: [], skipped: 0 };
  const rows = text.split("\n").map((l) => parseCsvLine(l));
  // Detect & skip header row
  let start = 0;
  const first = rows[0]?.join(",").toLowerCase() ?? "";
  if (/desc|hs|qty|unit|duty|margin/.test(first)) start = 1;

  const out: CargoLine[] = [];
  let skipped = 0;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((c) => !c)) {
      continue;
    }
    const description = r[0] ?? "";
    const hsCode = r[1] ?? "";
    const qty = Number(r[2] ?? "0");
    const unitValue = Number(r[3] ?? "0");
    const fifth = Number(r[4] ?? "0");
    if (!Number.isFinite(qty) || !Number.isFinite(unitValue)) {
      skipped++;
      continue;
    }
    const idPrefix = mode === "landed" ? "ll" : "el";
    out.push({
      id: nextId(idPrefix),
      description,
      hsCode,
      qty: Math.max(0, Math.round(qty)),
      unitValue: Math.max(0, unitValue),
      ...(mode === "landed"
        ? { dutyRate: Number.isFinite(fifth) ? fifth : 0, weightKg: 0 }
        : { margin: Number.isFinite(fifth) ? fifth : 0 }),
    });
  }
  return { lines: out, skipped };
}

export function CsvImportDialog({ mode, onImport }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  const sample = mode === "landed" ? SAMPLE_LANDED : SAMPLE_EXPORT;
  const fifthLabel = mode === "landed" ? "Duty %" : "Margin %";

  const handleImport = () => {
    const { lines, skipped } = parseRows(text, mode);
    if (lines.length === 0) {
      toast.error("No valid rows found. Check your format.");
      return;
    }
    onImport(lines);
    toast.success(
      `Imported ${lines.length} line${lines.length === 1 ? "" : "s"}` +
        (skipped > 0 ? ` (${skipped} skipped)` : ""),
    );
    setText("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-brand-navy text-brand-navy">
          <Upload className="size-3.5" /> Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Import line items from CSV</DialogTitle>
          <DialogDescription>
            Paste rows below. Columns: <strong>Description, HS Code, Qty, Unit Value, {fifthLabel}</strong>.
            A header row is optional. Imported lines replace the current list.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={sample}
          className="h-44 font-mono text-xs"
        />

        <div className="rounded-md border bg-muted/30 p-2 text-[11px]">
          <div className="mb-1 font-semibold text-brand-navy">Example</div>
          <pre className="overflow-x-auto whitespace-pre text-muted-foreground">{sample}</pre>
          <button
            type="button"
            onClick={() => setText(sample)}
            className="mt-1 text-[11px] font-semibold text-brand-orange hover:underline"
          >
            Use sample
          </button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            className="text-white"
            style={{ background: "var(--brand-orange)" }}
          >
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

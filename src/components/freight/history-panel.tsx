/**
 * History sidebar — sticky on desktop, drawer trigger on mobile (provided by parent).
 */
import { useEffect, useState } from "react";
import { Trash2, FileDown, History as HistoryIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { historyStore, exportHistoryCsv, downloadFile } from "@/lib/freight/storage";
import type { CalcKey, SavedCalculation } from "@/lib/freight/types";
import { CALCULATORS } from "@/lib/freight/types";

export function HistoryPanel() {
  const [items, setItems] = useState<SavedCalculation[]>([]);
  const [filter, setFilter] = useState<CalcKey | "all">("all");

  useEffect(() => {
    const refresh = () => setItems(historyStore.list());
    refresh();
    window.addEventListener("freight:storage", refresh);
    return () => window.removeEventListener("freight:storage", refresh);
  }, []);

  const filtered = filter === "all" ? items : items.filter((i) => i.type === filter);

  const remove = (id: string) => {
    historyStore.remove(id);
    setItems(historyStore.list());
  };

  const clear = () => {
    historyStore.clear();
    setItems([]);
    toast.success("History cleared");
  };

  const exportCsv = () => {
    if (!items.length) {
      toast.error("Nothing to export");
      return;
    }
    downloadFile(`smart-tools-history-${new Date().toISOString().slice(0, 10)}.csv`, exportHistoryCsv(items));
    toast.success("CSV downloaded");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <HistoryIcon className="size-4 text-brand-orange" />
        <h2 className="flex-1 text-sm font-bold text-brand-navy">History</h2>
        <Button size="sm" variant="ghost" onClick={exportCsv} aria-label="Export CSV">
          <FileDown className="size-4" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" aria-label="Clear history">
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear all history?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes all {items.length} saved calculations from your browser.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={clear}>Clear</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="border-b px-4 py-2">
        <Select value={filter} onValueChange={(v) => setFilter(v as CalcKey | "all")}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All calculators</SelectItem>
            {CALCULATORS.map((c) => (
              <SelectItem key={c.key} value={c.key}>
                {c.emoji} {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-xs text-muted-foreground">
            No saved calculations yet. Use the <strong>Save</strong> button on a result to keep it
            here.
          </p>
        ) : (
          <ul className="divide-y">
            {filtered.map((it) => {
              const headline = it.result.items.find((x) => x.highlight) ?? it.result.items[0];
              return (
                <li key={it.id} className="group px-4 py-3 transition-colors hover:bg-brand-navy-soft/50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-brand-navy">
                        {it.result.title}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">{it.name}</div>
                      {headline && (
                        <div className="mt-1 truncate text-xs">
                          <span className="text-muted-foreground">{headline.label}:</span>{" "}
                          <span className="font-semibold text-brand-orange">{headline.value}</span>
                        </div>
                      )}
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {new Date(it.savedAt).toLocaleString("en-IN")}
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 opacity-60 group-hover:opacity-100"
                      onClick={() => remove(it.id)}
                      aria-label="Delete"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

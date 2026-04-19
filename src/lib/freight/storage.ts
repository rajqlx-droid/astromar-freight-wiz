/**
 * Tiny localStorage wrapper for saved calculations + history.
 * Capped at MAX entries to avoid bloat.
 */

import type { SavedCalculation } from "./types";

const HISTORY_KEY = "astromar.freight.history";
const SAVED_KEY = "astromar.freight.saved";
const MAX = 10;

const isBrowser = () => typeof window !== "undefined";

function read(key: string): SavedCalculation[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedCalculation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(key: string, items: SavedCalculation[]) {
  if (!isBrowser()) return;
  localStorage.setItem(key, JSON.stringify(items.slice(0, MAX)));
}

export const historyStore = {
  list: () => read(HISTORY_KEY),
  add: (item: SavedCalculation) => {
    const list = [item, ...read(HISTORY_KEY)].slice(0, MAX);
    write(HISTORY_KEY, list);
    return list;
  },
  remove: (id: string) => {
    const list = read(HISTORY_KEY).filter((x) => x.id !== id);
    write(HISTORY_KEY, list);
    return list;
  },
  clear: () => {
    write(HISTORY_KEY, []);
  },
};

export const savedStore = {
  list: () => read(SAVED_KEY),
  add: (item: SavedCalculation) => {
    const list = [item, ...read(SAVED_KEY)].slice(0, MAX);
    write(SAVED_KEY, list);
    return list;
  },
  remove: (id: string) => {
    const list = read(SAVED_KEY).filter((x) => x.id !== id);
    write(SAVED_KEY, list);
    return list;
  },
};

export function exportHistoryCsv(rows: SavedCalculation[]): string {
  const header = ["Saved At", "Type", "Title", "Name", "Key Result"];
  const lines = [header.join(",")];
  for (const r of rows) {
    const headline = r.result.items.find((i) => i.highlight) ?? r.result.items[0];
    const date = new Date(r.savedAt).toISOString();
    const cells = [
      date,
      r.type,
      r.result.title,
      r.name.replaceAll(",", " "),
      headline ? `${headline.label}: ${headline.value}`.replaceAll(",", ";") : "",
    ];
    lines.push(cells.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(","));
  }
  return lines.join("\n");
}

export function downloadFile(filename: string, content: string, mime = "text/csv") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Branded PDF export for any CalcResult.
 * Uses jspdf + autotable. Lazy-loaded by the caller.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { CalcResult } from "./types";

const NAVY: [number, number, number] = [27, 58, 107];      // #1B3A6B
const ORANGE: [number, number, number] = [249, 115, 22];   // #F97316

export interface PdfLoadingRow {
  rowIdx: number;
  xStartM: number;
  xEndM: number;
  pkgCount: number;
  layers: number;
  cbm: number;
  weightKg: number;
  hasFragile: boolean;
  hasNonStack: boolean;
  rotatedCount: number;
  items: { itemIdx: number; count: number; color: string; packageType: string }[];
  instruction: string;
  /** Optional pre-rasterised side-view PNG dataURL for this row. */
  sideViewPng?: string;
}

export interface PdfExtras {
  /** Optional 3D snapshots (PNG dataURLs) for container load visualisation. */
  snapshots?: { iso?: string; front?: string; side?: string };
  /** Optional load report rows (per-item fit summary). */
  loadReport?: { label: string; value: string }[];
  /** Optional row-by-row loading guide (back wall to door). */
  loadingRows?: PdfLoadingRow[];
}


export function downloadResultPdf(
  result: CalcResult,
  inputsTable?: { label: string; value: string }[],
  extras?: PdfExtras,
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header band
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 70, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Smart Tool", 40, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Freight Intelligence Suite", 40, 50);

  // Accent bar
  doc.setFillColor(...ORANGE);
  doc.rect(0, 70, pageWidth, 4, "F");

  // Title
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(result.title, 40, 110);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110, 110, 110);
  doc.text(`Generated ${new Date().toLocaleString("en-IN")}`, 40, 126);

  let y = 150;

  if (inputsTable && inputsTable.length) {
    autoTable(doc, {
      startY: y,
      head: [["Input", "Value"]],
      body: inputsTable.map((i) => [i.label, i.value]),
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
      bodyStyles: { textColor: 40 },
      alternateRowStyles: { fillColor: [240, 245, 251] },
      styles: { fontSize: 10, cellPadding: 6 },
      margin: { left: 40, right: 40 },
    });
    // @ts-expect-error autotable injects lastAutoTable
    y = (doc.lastAutoTable?.finalY ?? y) + 20;
  }

  // Per-line breakdown (Landed / Export multi-line)
  if (result.lines && result.lines.rows.length) {
    autoTable(doc, {
      startY: y,
      head: [result.lines.headers],
      body: result.lines.rows,
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
      bodyStyles: { textColor: 40 },
      alternateRowStyles: { fillColor: [240, 245, 251] },
      styles: { fontSize: 9, cellPadding: 5 },
      margin: { left: 40, right: 40 },
    });
    // @ts-expect-error autotable injects lastAutoTable
    y = (doc.lastAutoTable?.finalY ?? y) + 16;
  }

  autoTable(doc, {
    startY: y,
    head: [["Result", "Value"]],
    body: result.items.map((i) => [i.label, i.value]),
    headStyles: { fillColor: ORANGE, textColor: 255, fontStyle: "bold" },
    bodyStyles: { textColor: 40 },
    alternateRowStyles: { fillColor: [255, 247, 237] },
    styles: { fontSize: 11, cellPadding: 7 },
    margin: { left: 40, right: 40 },
  });
  // @ts-expect-error autotable injects lastAutoTable
  y = (doc.lastAutoTable?.finalY ?? y) + 20;

  // Optional: 3D snapshots (multi-angle) and load report.
  if (extras?.snapshots && (extras.snapshots.iso || extras.snapshots.front || extras.snapshots.side)) {
    if (y > 600) {
      doc.addPage();
      y = 60;
    }
    doc.setTextColor(...NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Container Load — Multi-angle View", 40, y);
    y += 12;

    const snaps = extras.snapshots;
    const snapList: { key: string; src: string; label: string }[] = [];
    if (snaps.iso) snapList.push({ key: "iso", src: snaps.iso, label: "Isometric" });
    if (snaps.front) snapList.push({ key: "front", src: snaps.front, label: "Front" });
    if (snaps.side) snapList.push({ key: "side", src: snaps.side, label: "Side" });

    const usable = pageWidth - 80;
    const gap = 10;
    const cellW = (usable - gap * (snapList.length - 1)) / snapList.length;
    const cellH = cellW * 0.7;
    snapList.forEach((s, i) => {
      const x = 40 + i * (cellW + gap);
      try {
        doc.addImage(s.src, "PNG", x, y + 6, cellW, cellH, undefined, "FAST");
      } catch {
        /* ignore broken dataURL */
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...NAVY);
      doc.text(s.label, x, y);
    });
    y += cellH + 24;
  }

  if (extras?.loadReport && extras.loadReport.length) {
    if (y > 700) {
      doc.addPage();
      y = 60;
    }
    autoTable(doc, {
      startY: y,
      head: [["Load Report", "Value"]],
      body: extras.loadReport.map((i) => [i.label, i.value]),
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
      bodyStyles: { textColor: 40 },
      alternateRowStyles: { fillColor: [240, 245, 251] },
      styles: { fontSize: 10, cellPadding: 6 },
      margin: { left: 40, right: 40 },
    });
  }

  // Row-by-row loading guide — own page so the loader can print/scan it.
  if (extras?.loadingRows && extras.loadingRows.length) {
    doc.addPage();
    let ry = 60;
    doc.setTextColor(...NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Row-by-Row Loading Guide", 40, ry);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 110);
    ry += 14;
    doc.text(
      `${extras.loadingRows.length} row${extras.loadingRows.length > 1 ? "s" : ""} - back wall to door - always work from the rear forward, never climb on cargo.`,
      40,
      ry,
    );
    ry += 16;

    autoTable(doc, {
      startY: ry,
      head: [["Done", "Row", "Position", "Pkg", "Layers", "CBM", "Weight", "Flags", "Loader Action"]],
      body: extras.loadingRows.map((r) => {
        const flags: string[] = [];
        if (r.hasFragile) flags.push("FRAGILE");
        if (r.hasNonStack) flags.push("NO-STACK");
        if (r.rotatedCount > 0) flags.push(`TILT x${r.rotatedCount}`);
        const itemsTxt = r.items.map((i) => `Item ${i.itemIdx + 1} x${i.count}`).join(", ");
        return [
          "[ ]",
          `R${r.rowIdx + 1}`,
          `${r.xStartM.toFixed(2)}-${r.xEndM.toFixed(2)} m`,
          String(r.pkgCount),
          String(r.layers),
          r.cbm.toFixed(2),
          r.weightKg > 0
            ? `~${r.weightKg.toLocaleString("en-IN", { maximumFractionDigits: 0 })} kg`
            : "-",
          flags.join(" "),
          `${itemsTxt}\n${r.instruction}`,
        ];
      }),
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", fontSize: 9 },
      bodyStyles: { textColor: 40, valign: "top" },
      alternateRowStyles: { fillColor: [240, 245, 251] },
      styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
      columnStyles: {
        0: { cellWidth: 22, halign: "center", fontStyle: "bold" },
        1: { cellWidth: 26, fontStyle: "bold", textColor: NAVY },
        2: { cellWidth: 58 },
        3: { cellWidth: 26, halign: "right" },
        4: { cellWidth: 36, halign: "right" },
        5: { cellWidth: 36, halign: "right" },
        6: { cellWidth: 50, halign: "right" },
        7: { cellWidth: 54, fontSize: 7, fontStyle: "bold" },
        8: { cellWidth: "auto" },
      },
      margin: { left: 40, right: 40 },
    });
  }

  const ph = doc.internal.pageSize.getHeight();
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(1);
  doc.line(40, ph - 70, pageWidth - 40, ph - 70);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text("Smart Tool — Freight Intelligence", 40, ph - 38);
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(7);
  doc.text(
    "These calculations are estimates and are provided as guidance only. Actual freight, duty and demurrage charges may vary by carrier and port.",
    40,
    ph - 20,
  );

  const filename = `${result.title.replace(/\s+/g, "-")}_${new Date()
    .toISOString()
    .slice(0, 10)}.pdf`;
  doc.save(filename);
}

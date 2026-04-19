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
  needsSeparator: boolean;
  /** Back-wall floor utilization (0-100). */
  wallUtilizationPct: number;
  /** True when wallUtilizationPct < 90% — flagged for re-shuffle. */
  gapWarning: boolean;
  items: { itemIdx: number; count: number; color: string; packageType: string }[];
  instruction: string;
  /** Optional pre-rasterised door-view PNG dataURL (W × H) for this row. */
  sideViewPng?: string;
  /** Optional pre-rasterised side-view PNG dataURL (depth × H) for this row. */
  frontViewPng?: string;
  /** Optional pre-rasterised top-down PNG dataURL (W × depth) for this row. */
  topViewPng?: string;
}

export interface PdfExtras {
  /** Optional 3D snapshots (PNG dataURLs) for container load visualisation. */
  snapshots?: { iso?: string; front?: string; side?: string };
  /** Optional load report rows (per-item fit summary). */
  loadReport?: { label: string; value: string }[];
  /** Optional row-by-row loading guide (back wall to door). */
  loadingRows?: PdfLoadingRow[];
  /** Optional container-level wall efficiency score for the cover + row guide header. */
  wallEfficiency?: {
    scorePct: number;
    status: "green" | "amber" | "red";
    rowCount: number;
    gapRowCount: number;
  };
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

  // Wall efficiency badge on cover — gives the loader the overall target
  // before they start. Coloured pill matches the on-screen traffic light.
  if (extras?.wallEfficiency && extras.wallEfficiency.rowCount > 0) {
    const we = extras.wallEfficiency;
    const pillColor: [number, number, number] =
      we.status === "green" ? [5, 150, 105] : we.status === "amber" ? [217, 119, 6] : [225, 29, 72];
    const pillBg: [number, number, number] =
      we.status === "green" ? [209, 250, 229] : we.status === "amber" ? [254, 243, 199] : [255, 228, 230];
    const pct = Math.round(we.scorePct);
    const statusLabel =
      we.status === "green" ? "Optimal" : we.status === "amber" ? "Close gaps" : "Re-shuffle needed";
    const pillW = 220;
    const pillH = 26;
    doc.setFillColor(...pillBg);
    doc.setDrawColor(...pillColor);
    doc.setLineWidth(0.8);
    doc.roundedRect(40, y, pillW, pillH, 4, 4, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...pillColor);
    doc.text(`${pct}%`, 50, y + 17);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...NAVY);
    doc.text("Container wall efficiency", 80, y + 11);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...pillColor);
    const subTxt =
      we.gapRowCount > 0
        ? `${statusLabel} · ${we.gapRowCount} of ${we.rowCount} row${we.rowCount > 1 ? "s" : ""} need re-shuffle`
        : `${statusLabel} · all ${we.rowCount} row${we.rowCount > 1 ? "s" : ""} tight to back wall`;
    doc.text(subTxt, 80, y + 21);
    y += pillH + 14;
  }


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

    const cardX = 40;
    const cardW = pageWidth - 80;
    const svgW = 130;
    const svgH = 44;
    const svgGap = 4;
    const imageColH = svgH * 3 + svgGap * 2 + 21; // three stacked views + labels
    const cardPad = 8;

    for (const r of extras.loadingRows) {
      // Card height: enough for the SVG + a few text lines.
      const flags: string[] = [];
      if (r.hasFragile) flags.push("FRAGILE");
      if (r.hasNonStack) flags.push("NO-STACK");
      if (r.needsSeparator) flags.push("MIXED PALLET");
      if (r.gapWarning) flags.push(`GAP ${Math.round(r.wallUtilizationPct)}%`);
      if (r.rotatedCount > 0) flags.push(`TILT x${r.rotatedCount}`);
      const itemsTxt = r.items.map((i) => `Item ${i.itemIdx + 1} x${i.count}`).join(", ");
      const wt =
        r.weightKg > 0
          ? `~${r.weightKg.toLocaleString("en-IN", { maximumFractionDigits: 0 })} kg`
          : "-";
      const instructionLines = doc.splitTextToSize(
        `Loader: ${r.instruction}`,
        cardW - svgW - cardPad * 3,
      ) as string[];
      const itemsLines = doc.splitTextToSize(
        itemsTxt,
        cardW - svgW - cardPad * 3,
      ) as string[];
      const warnLines = r.needsSeparator
        ? (doc.splitTextToSize(
            "Mixed pallet — insert a plywood/cardboard separator board between heavy and fragile units.",
            cardW - svgW - cardPad * 3,
          ) as string[])
        : [];
      const gapLines = r.gapWarning
        ? (doc.splitTextToSize(
            `Gap warning — back wall only ${Math.round(r.wallUtilizationPct)}% covered. Re-shuffle pallets side-to-side before sealing.`,
            cardW - svgW - cardPad * 3,
          ) as string[])
        : [];
      const textBlockH =
        14 + 12 + (flags.length ? 9 : 0) + warnLines.length * 10 + gapLines.length * 10 + itemsLines.length * 10 + instructionLines.length * 10 + 4;
      const cardH = Math.max(imageColH + cardPad * 2, textBlockH + cardPad * 2);

      // Page-break check
      if (ry + cardH > doc.internal.pageSize.getHeight() - 90) {
        doc.addPage();
        ry = 60;
      }

      // Card background
      doc.setDrawColor(214, 221, 232);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(cardX, ry, cardW, cardH, 4, 4, "S");

      // Tick box
      doc.setDrawColor(...NAVY);
      doc.setLineWidth(0.8);
      doc.rect(cardX + cardW - 22, ry + 8, 12, 12, "S");

      // Two stacked projection images (left): door view on top, side view below.
      const imgX = cardX + cardPad;
      const imgY0 = ry + cardPad;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      doc.setTextColor(120, 120, 120);
      doc.text("DOOR VIEW (W × H)", imgX, imgY0 + 5);
      if (r.sideViewPng) {
        try {
          doc.addImage(r.sideViewPng, "PNG", imgX, imgY0 + 7, svgW, svgH, undefined, "FAST");
        } catch {
          /* ignore broken dataURL */
        }
      }
      const imgY1 = imgY0 + 7 + svgH + svgGap;
      doc.text("SIDE VIEW (DEPTH × H)", imgX, imgY1 + 5);
      if (r.frontViewPng) {
        try {
          doc.addImage(r.frontViewPng, "PNG", imgX, imgY1 + 7, svgW, svgH, undefined, "FAST");
        } catch {
          /* ignore broken dataURL */
        }
      }
      const imgY2 = imgY1 + 7 + svgH + svgGap;
      doc.text("TOP VIEW (W × DEPTH)", imgX, imgY2 + 5);
      if (r.topViewPng) {
        try {
          doc.addImage(r.topViewPng, "PNG", imgX, imgY2 + 7, svgW, svgH, undefined, "FAST");
        } catch {
          /* ignore broken dataURL */
        }
      }

      // Right text block
      const tx = cardX + svgW + cardPad * 2;
      let ty = ry + cardPad + 4;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...NAVY);
      doc.text(
        `R${r.rowIdx + 1}  ${r.xStartM.toFixed(2)}–${r.xEndM.toFixed(2)} m from rear wall`,
        tx,
        ty,
      );
      ty += 11;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(110, 110, 110);
      const wallTxt = `${Math.round(r.wallUtilizationPct)}% wall`;
      doc.text(
        `${r.pkgCount} pkg · ${r.layers} layer${r.layers > 1 ? "s" : ""} · ${r.cbm.toFixed(2)} m³ · ${wt} · ${wallTxt}`,
        tx,
        ty,
      );
      ty += 10;

      if (flags.length) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(...ORANGE);
        doc.text(flags.join("  ·  "), tx, ty);
        ty += 9;
      }

      if (warnLines.length) {
        // Red warning band before items.
        doc.setFillColor(254, 226, 226);
        doc.setDrawColor(252, 165, 165);
        doc.setLineWidth(0.5);
        const wH = warnLines.length * 9 + 4;
        doc.roundedRect(tx - 2, ty - 7, cardW - svgW - cardPad * 3, wH, 2, 2, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(185, 28, 28);
        doc.text(warnLines, tx + 2, ty);
        ty += wH - 3;
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(40, 40, 40);
      doc.text(itemsLines, tx, ty);
      ty += itemsLines.length * 10;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...NAVY);
      doc.text(instructionLines, tx, ty);

      ry += cardH + 8;
    }
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

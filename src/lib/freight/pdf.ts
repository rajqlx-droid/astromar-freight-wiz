/**
 * Branded PDF export for any CalcResult.
 * Uses jspdf + autotable. Lazy-loaded by the caller.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { CalcResult } from "./types";

const NAVY: [number, number, number] = [27, 58, 107];      // #1B3A6B
const ORANGE: [number, number, number] = [249, 115, 22];   // #F97316

export interface PdfExtras {
  /** Optional 3D snapshots (PNG dataURLs) for container load visualisation. */
  snapshots?: { iso?: string; front?: string; side?: string };
  /** Optional load report rows (per-item fit summary). */
  loadReport?: { label: string; value: string }[];
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
  doc.text("Astromar Logistics", 40, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("India's leading FTWZ provider", 40, 50);

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

  const ph = doc.internal.pageSize.getHeight();
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(1);
  doc.line(40, ph - 70, pageWidth - 40, ph - 70);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text("Astromar Logistics Pvt Ltd", 40, ph - 52);
  doc.text(
    "No. 922, 1st Floor, H-Block, 17th Main Road, Anna Nagar, Chennai - 600 040",
    40,
    ph - 38,
  );
  doc.text("Phone: +91 99402 11014   |   Email: sales@astromarfreezone.com", 40, ph - 24);
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(7);
  doc.text(
    "These calculations are estimates and are provided as guidance only. Actual freight, duty and demurrage charges may vary by carrier and port.",
    40,
    ph - 10,
  );

  const filename = `${result.title.replace(/\s+/g, "-")}_${new Date()
    .toISOString()
    .slice(0, 10)}.pdf`;
  doc.save(filename);
}

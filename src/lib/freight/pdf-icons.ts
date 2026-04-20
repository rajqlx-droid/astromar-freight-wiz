/**
 * Tiny package-type glyphs drawn directly with jsPDF primitives so that the
 * printed loading checklist mirrors the shape cues used in the on-screen
 * loading-rows panel. Each glyph is drawn into a (size × size) box at (x, y),
 * using the current draw colour set on the doc.
 *
 * Kept intentionally simple — these are recognition cues, not photoreal art.
 */
import type jsPDF from "jspdf";
import type { PackageType } from "./calculators";

export function drawPackageGlyph(
  doc: jsPDF,
  type: PackageType,
  x: number,
  y: number,
  size: number,
) {
  doc.setLineWidth(0.5);
  // 24×24 viewBox → scale to `size`.
  const s = size / 24;
  const px = (n: number) => x + n * s;
  const py = (n: number) => y + n * s;

  switch (type) {
    case "carton": {
      // Closed box with top flap seam (matches PackageTypeIcon path).
      doc.lines(
        [
          [8 * s, -4 * s],
          [8 * s, 4 * s],
          [0, 10 * s],
          [-8 * s, 4 * s],
          [-8 * s, -4 * s],
          [0, -10 * s],
        ],
        px(4),
        py(7),
        [1, 1],
        "S",
      );
      // Top fold lines
      doc.line(px(4), py(7), px(12), py(11));
      doc.line(px(12), py(11), px(20), py(7));
      doc.line(px(12), py(11), px(12), py(21));
      break;
    }
    case "pallet": {
      // Top deck, three stringers, bottom deck.
      doc.rect(px(3), py(9), 18 * s, 3 * s, "S");
      doc.line(px(5), py(12), px(5), py(15));
      doc.line(px(12), py(12), px(12), py(15));
      doc.line(px(19), py(12), px(19), py(15));
      doc.rect(px(3), py(15), 18 * s, 2 * s, "S");
      break;
    }
    case "crate": {
      // Box with diagonal cross + horizontal slats.
      doc.rect(px(4), py(5), 16 * s, 14 * s, "S");
      doc.line(px(4), py(5), px(20), py(19));
      doc.line(px(20), py(5), px(4), py(19));
      doc.line(px(4), py(9), px(20), py(9));
      doc.line(px(4), py(15), px(20), py(15));
      break;
    }
    case "drum": {
      // Cylinder: top ellipse + body sides + banding.
      doc.ellipse(px(12), py(5), 6 * s, 2 * s, "S");
      doc.line(px(6), py(5), px(6), py(19));
      doc.line(px(18), py(5), px(18), py(19));
      // Bottom curve approximated as ellipse
      doc.ellipse(px(12), py(19), 6 * s, 2 * s, "S");
      doc.ellipse(px(12), py(10), 6 * s, 1.4 * s, "S");
      doc.ellipse(px(12), py(15), 6 * s, 1.4 * s, "S");
      break;
    }
    case "bag": {
      // Sack — neck + rounded body.
      doc.line(px(9), py(4), px(15), py(4));
      doc.line(px(9), py(4), px(8), py(7));
      doc.line(px(15), py(4), px(16), py(7));
      doc.ellipse(px(12), py(14), 6 * s, 7 * s, "S");
      doc.line(px(10), py(7), px(14), py(7));
      break;
    }
    case "bale": {
      // Compressed bale — rectangle with strapping bands.
      doc.rect(px(3), py(6), 18 * s, 12 * s, "S");
      doc.line(px(3), py(10), px(21), py(10));
      doc.line(px(3), py(14), px(21), py(14));
      doc.line(px(9), py(6), px(9), py(18));
      doc.line(px(15), py(6), px(15), py(18));
      break;
    }
    default:
      break;
  }
}

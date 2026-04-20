/**
 * Tiny inline SVG icon for each cargo package type. Used in the loading-rows
 * panel chips so loaders can identify the shape at a glance without reading.
 *
 * All glyphs render at currentColor so they inherit text colour.
 */
import type { PackageType } from "@/lib/freight/calculators";

interface Props {
  type: PackageType;
  className?: string;
  /** Pixel size (defaults to 14). */
  size?: number;
}

export function PackageTypeIcon({ type, className, size = 14 }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };

  switch (type) {
    case "carton":
      // Closed box with top flap seam.
      return (
        <svg {...common}>
          <path d="M4 7l8-4 8 4v10l-8 4-8-4V7z" />
          <path d="M4 7l8 4 8-4" />
          <path d="M12 11v10" />
          <path d="M9 5.5l8 4" />
        </svg>
      );
    case "pallet":
      // Wooden pallet — three top planks, two stringers.
      return (
        <svg {...common}>
          <rect x="3" y="9" width="18" height="3" rx="0.5" />
          <path d="M5 12v3M12 12v3M19 12v3" />
          <rect x="3" y="15" width="18" height="2" rx="0.5" />
        </svg>
      );
    case "crate":
      // Wooden crate with diagonal cross-brace and side slats.
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="14" rx="0.5" />
          <path d="M4 5l16 14M20 5L4 19" />
          <path d="M4 9h16M4 15h16" />
        </svg>
      );
    case "drum":
      // Cylindrical drum — top ellipse + body + banding.
      return (
        <svg {...common}>
          <ellipse cx="12" cy="5" rx="6" ry="2" />
          <path d="M6 5v14a6 2 0 0 0 12 0V5" />
          <ellipse cx="12" cy="10" rx="6" ry="2" />
          <ellipse cx="12" cy="15" rx="6" ry="2" />
        </svg>
      );
    case "bag":
      // Sack / bag with tied neck.
      return (
        <svg {...common}>
          <path d="M9 4h6l-1 3c2 1 4 4 4 8 0 4-3 6-6 6s-6-2-6-6c0-4 2-7 4-8l-1-3z" />
          <path d="M10 7h4" />
        </svg>
      );
    case "bale":
      // Compressed bale — rounded rectangle with horizontal strapping bands.
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M3 10h18M3 14h18" />
          <path d="M9 6v12M15 6v12" />
        </svg>
      );
    default:
      return null;
  }
}

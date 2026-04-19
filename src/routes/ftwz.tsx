import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/ftwz")({
  head: () => ({
    meta: [
      { title: "FTWZ Solutions — Free Trade Warehousing Zones | Astromar" },
      {
        name: "description",
        content:
          "Bonded FTWZ warehousing with duty deferment, re-export benefits, GST advantages and integrated logistics from Astromar Logistics, Chennai.",
      },
      { property: "og:title", content: "FTWZ Solutions by Astromar Logistics" },
      {
        property: "og:description",
        content: "Duty deferment, GST benefits and re-export through Astromar's FTWZ.",
      },
    ],
  }),
  component: Ftwz,
});

function Ftwz() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 md:py-16">
      <h1 className="text-3xl font-bold text-brand-navy md:text-4xl">
        Free Trade Warehousing Zone (FTWZ)
      </h1>
      <p className="mt-4 text-muted-foreground">
        Astromar's FTWZ lets you store imported goods without paying upfront customs duty, re-export
        without tax leakage and consolidate shipments efficiently — ideal for distributors, traders
        and global e-commerce sellers.
      </p>
      <ul className="mt-6 space-y-3 text-sm">
        {[
          "Duty deferment until goods leave the FTWZ",
          "Zero GST on storage and value-added services within the zone",
          "Re-export without payment of customs duty",
          "Consolidation, kitting, labelling and quality inspection",
          "Integrated transport and customs clearance",
        ].map((b) => (
          <li key={b} className="flex gap-3">
            <span
              className="mt-1.5 inline-block size-2 shrink-0 rounded-full"
              style={{ background: "var(--brand-orange)" }}
            />
            <span className="text-foreground">{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

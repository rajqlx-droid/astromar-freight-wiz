import { createFileRoute } from "@tanstack/react-router";
import { Ship, Plane, FileCheck, Truck, Warehouse, Globe } from "lucide-react";

export const Route = createFileRoute("/services")({
  head: () => ({
    meta: [
      { title: "Services — Freight, Customs & FTWZ | Astromar Logistics" },
      {
        name: "description",
        content:
          "Sea & air freight, customs clearance, FTWZ warehousing, transportation and global forwarding services from Astromar Logistics, Chennai.",
      },
      { property: "og:title", content: "Astromar Logistics — Services" },
      {
        property: "og:description",
        content: "Freight, customs and FTWZ warehousing solutions across India.",
      },
    ],
  }),
  component: Services,
});

const SERVICES = [
  { icon: Ship, title: "Sea Freight (FCL/LCL)", body: "Container shipping across major Indian and global ports." },
  { icon: Plane, title: "Air Freight", body: "Time-critical airfreight with chargeable-weight optimisation." },
  { icon: Warehouse, title: "FTWZ Warehousing", body: "Bonded storage with duty deferment and re-export benefits." },
  { icon: FileCheck, title: "Customs Clearance", body: "Import/export documentation, classification and HSN advisory." },
  { icon: Truck, title: "Inland Transportation", body: "First and last mile trucking across India." },
  { icon: Globe, title: "Global Forwarding", body: "Door-to-door international shipping coordination." },
];

function Services() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:py-16">
      <h1 className="text-3xl font-bold text-brand-navy md:text-4xl">Our Services</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        End-to-end logistics built around your supply chain.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {SERVICES.map((s) => (
          <div
            key={s.title}
            className="rounded-xl border bg-card p-5 shadow-sm"
            style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 15%, transparent)" }}
          >
            <div
              className="mb-3 flex size-10 items-center justify-center rounded-lg"
              style={{ background: "var(--brand-orange-soft)" }}
            >
              <s.icon className="size-5 text-brand-orange" />
            </div>
            <h2 className="text-base font-semibold text-brand-navy">{s.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

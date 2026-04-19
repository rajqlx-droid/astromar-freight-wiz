import { createFileRoute, Link } from "@tanstack/react-router";
import { Calculator, Ship, Plane, Warehouse, ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Astromar Logistics — FTWZ & Freight Solutions, Chennai" },
      {
        name: "description",
        content:
          "India's leading Free Trade Warehousing Zone provider. End-to-end freight, customs and warehousing solutions for exporters and importers.",
      },
      { property: "og:title", content: "Astromar Logistics — FTWZ & Freight, Chennai" },
      {
        property: "og:description",
        content: "FTWZ, freight forwarding and customs clearance from Chennai, India.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div>
      {/* Hero */}
      <section
        className="relative overflow-hidden border-b-2"
        style={{
          borderBottomColor: "var(--brand-navy)",
          background:
            "linear-gradient(135deg, var(--brand-navy-soft) 0%, var(--brand-orange-soft) 100%)",
        }}
      >
        <div
          aria-hidden
          className="absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-20"
          style={{ background: "var(--brand-orange)" }}
        />
        <div
          aria-hidden
          className="absolute -bottom-20 -left-16 h-64 w-64 rounded-full opacity-10"
          style={{ background: "var(--brand-navy)" }}
        />
        <div className="relative mx-auto max-w-7xl px-4 py-16 md:py-24">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-brand-navy ring-1 ring-brand-navy/10">
              <ShieldCheck className="size-3.5 text-brand-orange" />
              India's leading FTWZ provider
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-brand-navy md:text-5xl">
              Smarter freight. Faster clearance. <span className="text-brand-orange">Lower landed cost.</span>
            </h1>
            <p className="mt-4 text-base text-muted-foreground md:text-lg">
              Astromar Logistics moves goods through India's busiest ports with FTWZ benefits, end-to-end
              customs handling and transparent pricing — all backed by Chennai-based operations.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button
                asChild
                size="lg"
                className="text-white shadow hover:opacity-90"
                style={{ background: "var(--brand-orange)" }}
              >
                <Link to="/freight-intelligence">
                  <Calculator className="size-4" /> Open Freight Tools
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-2 text-brand-navy hover:bg-brand-navy-soft"
                style={{ borderColor: "var(--brand-navy)" }}
              >
                <Link to="/contact">
                  Talk to sales <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Highlights */}
      <section className="mx-auto max-w-7xl px-4 py-12 md:py-16">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Warehouse,
              title: "FTWZ Warehousing",
              body: "Bonded warehousing with duty deferment, re-export benefits and consolidated billing.",
            },
            {
              icon: Ship,
              title: "Sea Freight",
              body: "FCL & LCL across major lanes from Chennai, Mumbai, Mundra and Tuticorin.",
            },
            {
              icon: Plane,
              title: "Air Freight",
              body: "Time-critical airfreight with chargeable-weight optimisation and clear ETAs.",
            },
          ].map((c) => (
            <div
              key={c.title}
              className="rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
              style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 15%, transparent)" }}
            >
              <div
                className="mb-3 flex size-10 items-center justify-center rounded-lg"
                style={{ background: "var(--brand-orange-soft)" }}
              >
                <c.icon className="size-5 text-brand-orange" />
              </div>
              <h3 className="text-base font-semibold text-brand-navy">{c.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA strip */}
      <section
        className="mx-4 mb-10 overflow-hidden rounded-2xl border-2 md:mx-auto md:max-w-7xl"
        style={{
          borderColor: "var(--brand-orange)",
          background:
            "linear-gradient(135deg, var(--brand-navy) 0%, var(--brand-navy-strong) 100%)",
        }}
      >
        <div className="grid gap-6 p-6 text-white md:grid-cols-[1fr_auto] md:items-center md:p-10">
          <div>
            <h2 className="text-xl font-bold md:text-2xl">Try our free Freight Intelligence tools</h2>
            <p className="mt-1 text-sm text-white/80 md:text-base">
              CBM, air volume weight, landed cost, export pricing, freight comparison and demurrage —
              all in one place.
            </p>
          </div>
          <Button
            asChild
            size="lg"
            className="text-brand-navy shadow hover:opacity-90"
            style={{ background: "var(--brand-orange)", color: "white" }}
          >
            <Link to="/freight-intelligence">
              Open Tools <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

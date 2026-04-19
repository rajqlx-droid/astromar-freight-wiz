import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Calculator,
  ChevronRight,
  History as HistoryIcon,
  Menu,
  X,
  Lightbulb,
  Phone,
  Mail,
  MapPin,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { HistoryPanel } from "@/components/freight/history-panel";
import { CbmCalculator } from "@/components/freight/cbm-calculator";
import { AirCalculator } from "@/components/freight/air-calculator";
import { LandedCalculator } from "@/components/freight/landed-calculator";
import { ExportCalculator } from "@/components/freight/export-calculator";
import { CompareCalculator } from "@/components/freight/compare-calculator";
import { RiskCalculator } from "@/components/freight/risk-calculator";
import { MobileResultBar } from "@/components/freight/mobile-result-bar";
import { CALCULATORS, type CalcKey } from "@/lib/freight/types";
import {
  calcAir,
  calcCbm,
  calcCompare,
  calcExport,
  calcLanded,
  calcRisk,
  emptyAirItem,
  emptyCbmItem,
  type AirItem,
  type CbmItem,
  type CompareInput,
  type ExportInput,
  type LandedInput,
  type RiskInput,
} from "@/lib/freight/calculators";

export const Route = createFileRoute("/freight-intelligence")({
  head: () => ({
    meta: [
      { title: "Freight Intelligence Tools — Astromar Logistics" },
      {
        name: "description",
        content:
          "Free freight calculators: CBM, air volume weight, landed cost, export pricing, air vs sea comparison and demurrage risk by Astromar Logistics, Chennai.",
      },
      { property: "og:title", content: "Freight Intelligence Tools — Astromar Logistics" },
      {
        property: "og:description",
        content: "Six smart freight calculators for Indian importers and exporters.",
      },
    ],
  }),
  component: FreightIntelligencePage,
});

const BANNER_KEY = "astromar.freight.banner";

function FreightIntelligencePage() {
  const [active, setActive] = useState<CalcKey>("cbm");
  const [bannerOpen, setBannerOpen] = useState(true);
  const tabsRef = useRef<HTMLDivElement>(null);

  // ----- per-calculator state, lifted so values persist across tab switches -----
  const [cbmItems, setCbmItems] = useState<CbmItem[]>([emptyCbmItem()]);
  const [airItems, setAirItems] = useState<AirItem[]>([emptyAirItem()]);
  const [airDivisor, setAirDivisor] = useState(6000);
  const [landed, setLanded] = useState<LandedInput>({
    product: 0,
    freight: 0,
    insurance: 0,
    dutyRate: 10,
    gstRate: 18,
    additional: 0,
    qty: 0,
    currency: "₹",
  });
  const [exp, setExp] = useState<ExportInput>({
    cost: 0,
    freight: 0,
    insurance: 0,
    margin: 20,
    additional: 0,
    qty: 0,
    currency: "₹",
  });
  const [compare, setCompare] = useState<CompareInput>({
    seaFreight: 0,
    seaDays: 30,
    airFreight: 0,
    airDays: 5,
    dailyRate: 0.05,
    productValue: 0,
    handling: 0,
  });
  const [risk, setRisk] = useState<RiskInput>({
    containerType: "40ft",
    daysAtPort: 7,
    dailyRate: 2500,
    goodsValue: 0,
    insurance: 0,
    port: "Chennai",
    cargoType: "General",
    freeDays: 5,
  });

  useEffect(() => {
    const stored = localStorage.getItem(BANNER_KEY);
    setBannerOpen(stored !== "0");
  }, []);

  // Auto-scroll active tab into view (covers click + keyboard nav).
  useEffect(() => {
    const idx = CALCULATORS.findIndex((c) => c.key === active);
    const btn = tabsRef.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[idx];
    btn?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [active]);

  const dismissBanner = () => {
    setBannerOpen(false);
    localStorage.setItem(BANNER_KEY, "0");
  };
  const reopenBanner = () => {
    setBannerOpen(true);
    localStorage.removeItem(BANNER_KEY);
  };

  const meta = CALCULATORS.find((c) => c.key === active)!;
  const activeIdx = CALCULATORS.findIndex((c) => c.key === active);

  // Compute current result + inputs at the route level so the mobile bottom bar
  // can mirror the same data shown by ResultsCard inside each calculator.
  const { mobileResult, mobileInputs } = useMemo(() => {
    switch (active) {
      case "cbm":
        return {
          mobileResult: calcCbm(cbmItems),
          mobileInputs: cbmItems.flatMap((it, idx) => [
            { label: `Item ${idx + 1} L×W×H (cm)`, value: `${it.length} × ${it.width} × ${it.height}` },
            { label: `Item ${idx + 1} Qty / Weight`, value: `${it.qty} pcs / ${it.weight} kg` },
          ]),
        };
      case "air":
        return {
          mobileResult: calcAir(airItems, airDivisor),
          mobileInputs: airItems.flatMap((it, idx) => [
            { label: `Item ${idx + 1} L×W×H (cm)`, value: `${it.length} × ${it.width} × ${it.height}` },
            { label: `Item ${idx + 1} Qty / Actual Weight`, value: `${it.qty} pcs / ${it.weight} kg` },
          ]),
        };
      case "landed":
        return { mobileResult: calcLanded(landed), mobileInputs: undefined };
      case "export":
        return { mobileResult: calcExport(exp), mobileInputs: undefined };
      case "compare":
        return { mobileResult: calcCompare(compare), mobileInputs: undefined };
      case "risk":
        return { mobileResult: calcRisk(risk), mobileInputs: undefined };
    }
  }, [active, cbmItems, airItems, airDivisor, landed, exp, compare, risk]);

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      const next = (idx + dir + CALCULATORS.length) % CALCULATORS.length;
      setActive(CALCULATORS[next].key);
      const btn = tabsRef.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next];
      btn?.focus();
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-background">
        {/* HEADER */}
        <header
          className="no-print sticky top-0 z-50 w-full border-b-2 bg-background/95 shadow-sm backdrop-blur"
          style={{ borderBottomColor: "var(--brand-navy)" }}
        >
          <div className="mx-auto flex h-[60px] max-w-7xl items-center justify-between px-3 md:px-4">
            <div className="flex items-center gap-2">
              <div
                className="flex size-8 items-center justify-center rounded-md text-white"
                style={{ background: "linear-gradient(135deg, var(--brand-navy), var(--brand-navy-strong))" }}
              >
                <span className="text-sm font-bold">A</span>
              </div>
              <div className="leading-tight">
                <div className="text-sm font-bold tracking-tight text-brand-navy md:text-base">Astromar</div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Freight Tools
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 md:gap-2">
              <Button
                size="sm"
                className="hidden text-white shadow-sm hover:opacity-90 md:inline-flex"
                style={{ background: "var(--brand-navy)" }}
                disabled
              >
                <Calculator className="size-4" /> Tools
              </Button>
              <ThemeToggle />
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="border-brand-navy text-brand-navy">
                    <HistoryIcon className="size-4" />
                    <span className="hidden sm:inline">History</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full p-0 sm:max-w-sm">
                  <SheetTitle className="sr-only">Calculation History</SheetTitle>
                  <HistoryPanel />
                </SheetContent>
              </Sheet>
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden text-brand-navy" aria-label="Menu">
                    <Menu className="size-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-72">
                  <SheetTitle>Quick contact</SheetTitle>
                  <div className="mt-6 space-y-3 text-sm">
                    <a href="tel:+919940211014" className="flex items-center gap-2 text-brand-navy">
                      <Phone className="size-4 text-brand-orange" /> +91 99402 11014
                    </a>
                    <a href="mailto:sales@astromarfreezone.com" className="flex items-center gap-2 text-brand-navy">
                      <Mail className="size-4 text-brand-orange" /> sales@astromarfreezone.com
                    </a>
                    <p className="flex items-start gap-2 text-muted-foreground">
                      <MapPin className="mt-0.5 size-4 text-brand-orange" />
                      No. 922, 1st Floor, H-Block, 17th Main Road, Anna Nagar, Chennai - 600 040
                    </p>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </header>

        {/* TAB STRIP */}
        <div
          className="no-print sticky top-[60px] z-40 border-b"
          style={{ background: "linear-gradient(180deg, var(--background), var(--brand-navy-soft))" }}
        >
          <div
            ref={tabsRef}
            role="tablist"
            aria-label="Calculator selector"
            className="no-scrollbar mx-auto flex max-w-7xl gap-2 overflow-x-auto px-3 py-3 md:px-4"
            style={{ scrollSnapType: "x mandatory" }}
          >
            {CALCULATORS.map((c, idx) => {
              const isActive = c.key === active;
              return (
                <button
                  key={c.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActive(c.key)}
                  onKeyDown={(e) => onTabKey(e, idx)}
                  className={
                    "min-w-[120px] shrink-0 rounded-lg border-2 px-3 py-2 text-left transition-all md:min-w-[140px] " +
                    (isActive
                      ? "text-white shadow-md"
                      : "border-brand-navy/40 bg-background text-brand-navy hover:bg-brand-navy-soft hover:border-brand-orange")
                  }
                  style={
                    isActive
                      ? {
                          background:
                            "linear-gradient(135deg, var(--brand-navy), var(--brand-navy-strong))",
                          borderColor: "var(--brand-orange)",
                          scrollSnapAlign: "center",
                        }
                      : { scrollSnapAlign: "center" }
                  }
                >
                  <div className="flex items-center gap-1.5 text-[13px] font-semibold leading-tight">
                    <span aria-hidden>{c.emoji}</span>
                    <span>{c.label}</span>
                  </div>
                  <div className={"mt-0.5 text-[10px] " + (isActive ? "text-white/80" : "text-muted-foreground")}>
                    {c.sub}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* HERO + BREADCRUMB + BANNER */}
        <section className="mx-auto max-w-7xl px-3 pb-4 pt-4 md:px-4">
          <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-xs text-muted-foreground">
            <Link to="/freight-intelligence" className="hover:text-brand-orange">Home</Link>
            <ChevronRight className="size-3" />
            <span>Tools</span>
            <ChevronRight className="size-3" />
            <span className="font-semibold text-brand-navy">{meta.label}</span>
          </nav>

          <div
            className="relative overflow-hidden rounded-xl border-2 p-5 md:p-6"
            style={{
              borderColor: "var(--brand-navy)",
              background:
                "linear-gradient(135deg, var(--brand-navy-soft) 0%, var(--brand-orange-soft) 100%)",
            }}
          >
            <div
              aria-hidden
              className="absolute -right-10 -top-10 size-40 rounded-full opacity-10"
              style={{ background: "var(--brand-orange)" }}
            />
            <div className="relative text-center">
              <h1 className="text-xl font-bold text-brand-navy md:text-2xl">Smart Freight Calculator</h1>
              <p className="mt-1 text-sm text-muted-foreground md:text-base">
                Calculate shipping costs and logistics metrics in real-time.
              </p>
            </div>
          </div>

          {bannerOpen ? (
            <div
              className="mt-3 flex items-start gap-2 rounded-lg border-l-4 p-3 text-xs md:text-sm"
              style={{ borderColor: "var(--brand-orange)", background: "var(--brand-navy-soft)" }}
            >
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-brand-orange" />
              <p className="flex-1 text-foreground/90">{meta.tip}</p>
              <button
                onClick={dismissBanner}
                aria-label="Dismiss tip"
                className="rounded p-1 text-muted-foreground hover:bg-background hover:text-brand-navy"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={reopenBanner}
              className="mt-3 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-brand-orange"
            >
              <Lightbulb className="size-3" /> Show tip
            </button>
          )}
        </section>

        {/* CALCULATOR + (desktop) sticky history */}
        <section className="mx-auto max-w-7xl px-3 pb-10 md:px-4">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div
                  aria-hidden
                  className="h-8 w-1.5 rounded-full"
                  style={{ background: "linear-gradient(180deg, var(--brand-navy), var(--brand-orange))" }}
                />
                <div>
                  <h2 className="text-lg font-bold text-brand-navy md:text-xl">{meta.label} Calculator</h2>
                  <p className="text-xs text-muted-foreground md:text-sm">{meta.sub}</p>
                </div>
              </div>

              {active === "cbm" && <CbmCalculator items={cbmItems} setItems={setCbmItems} />}
              {active === "air" && (
                <AirCalculator items={airItems} setItems={setAirItems} divisor={airDivisor} setDivisor={setAirDivisor} />
              )}
              {active === "landed" && <LandedCalculator state={landed} setState={setLanded} />}
              {active === "export" && <ExportCalculator state={exp} setState={setExp} />}
              {active === "compare" && <CompareCalculator state={compare} setState={setCompare} />}
              {active === "risk" && <RiskCalculator state={risk} setState={setRisk} />}
            </div>

            <aside className="no-print hidden lg:block">
              <div
                className="sticky top-[140px] overflow-hidden rounded-xl border-2 bg-card"
                style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 20%, transparent)", maxHeight: "calc(100vh - 160px)" }}
              >
                <HistoryPanel />
              </div>
            </aside>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-3 mb-10 md:mx-auto md:max-w-7xl md:px-4">
          <div
            className="overflow-hidden rounded-2xl border-2 p-6 text-white md:p-10"
            style={{
              borderColor: "var(--brand-orange)",
              background: "linear-gradient(135deg, var(--brand-navy), var(--brand-navy-strong))",
            }}
          >
            <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <h2 className="text-xl font-bold md:text-2xl">Need expert assistance with your shipment?</h2>
                <p className="mt-1 text-sm text-white/80 md:text-base">
                  Our Chennai-based team handles freight, customs and FTWZ end-to-end.
                </p>
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-white/80">
                  <span className="flex items-center gap-1.5"><Phone className="size-3.5" /> +91 99402 11014</span>
                  <span className="flex items-center gap-1.5"><Mail className="size-3.5" /> sales@astromarfreezone.com</span>
                  <span>Mon–Sat · 9:00–18:30 IST</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="lg" className="text-white shadow hover:opacity-90" style={{ background: "var(--brand-orange)" }}>
                  <a href="mailto:sales@astromarfreezone.com?subject=Shipment%20Enquiry">Contact our Team <ArrowRight className="size-4" /></a>
                </Button>
                <Button asChild size="lg" variant="outline" className="border-2 border-white bg-transparent text-white hover:bg-white/10">
                  <a href="tel:+919940211014">Schedule a Call</a>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-4xl px-3 pb-12 md:px-4">
          <h2 className="text-xl font-bold text-brand-navy md:text-2xl">Frequently asked questions</h2>
          <Accordion type="single" collapsible className="mt-4">
            {[
              { q: "How is CBM calculated?", a: "CBM = Length × Width × Height ÷ 1,000,000 (cm to m³). For multiple cartons, multiply by quantity." },
              { q: "Why is volumetric weight ÷5000 for sea and ÷6000 for air?", a: "Sea LCL freight uses a 1:1000 ratio between m³ and kg (so chargeable kg = CBM × 200). Airlines apply the IATA 6000 divisor for low-density cargo." },
              { q: "What duty rate should I use for landed cost?", a: "Use the BCD (Basic Customs Duty) rate from your product's HSN code. Add IGST on (CIF + Duty). Default 10% / 18% are common, but always verify your HSN." },
              { q: "How is the air vs sea comparison fair?", a: "We add the working-capital cost of having goods in transit (product value × daily rate × days) to each freight cost, so you compare the true cash impact." },
              { q: "What counts as a free day at the port?", a: "Most Indian ports give 4–5 free days from container landing. After that, demurrage stacks daily and may double after a week." },
              { q: "Are my saved calculations stored on a server?", a: "No. Saves and history live entirely in your browser's localStorage. Clearing your browser data deletes them." },
            ].map((f) => (
              <AccordionItem key={f.q} value={f.q}>
                <AccordionTrigger className="text-left text-sm font-semibold text-brand-navy">{f.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* FOOTER */}
        <footer className="no-print border-t-2" style={{ borderTopColor: "var(--brand-navy)" }}>
          <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 md:grid-cols-3">
            <div>
              <div className="flex items-center gap-2">
                <div
                  className="flex size-9 items-center justify-center rounded-md text-white"
                  style={{ background: "linear-gradient(135deg, var(--brand-navy), var(--brand-navy-strong))" }}
                >
                  <span className="text-sm font-bold">A</span>
                </div>
                <div>
                  <div className="font-bold text-brand-navy">Astromar Logistics Pvt Ltd</div>
                  <div className="text-xs text-muted-foreground">India's leading FTWZ provider</div>
                </div>
              </div>
              <p className="mt-3 max-w-md text-sm text-muted-foreground">
                Free, accurate freight calculators for Indian importers and exporters.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-brand-navy">Contact</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Phone className="mt-0.5 size-4 text-brand-orange" />
                  <a href="tel:+919940211014" className="hover:text-brand-orange">+91 99402 11014</a>
                </li>
                <li className="flex items-start gap-2">
                  <Mail className="mt-0.5 size-4 text-brand-orange" />
                  <a href="mailto:sales@astromarfreezone.com" className="break-all hover:text-brand-orange">
                    sales@astromarfreezone.com
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-brand-navy">Office</h3>
              <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 size-4 text-brand-orange" />
                No. 922, 1st Floor, H-Block, 17th Main Road, Anna Nagar, Chennai - 600 040
              </p>
            </div>
          </div>
          <div className="border-t bg-brand-navy-soft py-4 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} Astromar Logistics Pvt Ltd. All rights reserved.
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  
  ChevronRight,
  GitCompareArrows,
  History as HistoryIcon,
  Menu,
  X,
  Lightbulb,
  Phone,
  Mail,
  MapPin,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { nextId } from "@/lib/freight/ids";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { HistoryPanel } from "@/components/freight/history-panel";
import { CbmCalculator } from "@/components/freight/cbm-calculator";
import { AirCalculator } from "@/components/freight/air-calculator";
import { LandedCalculator } from "@/components/freight/landed-calculator";
import { ExportCalculator } from "@/components/freight/export-calculator";
import { CompareCalculator } from "@/components/freight/compare-calculator";
import { RiskCalculator } from "@/components/freight/risk-calculator";
import { MobileResultBar } from "@/components/freight/mobile-result-bar";
import { MiniHistoryStrip } from "@/components/freight/mini-history-strip";
import { CompareDialog } from "@/components/freight/compare-dialog";
import { SplitCompareView } from "@/components/freight/split-compare-view";
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
  emptyExportLine,
  emptyLandedLine,
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
      { title: "Smart Tools Everywhere — Freight Intelligence Suite" },
      {
        name: "description",
        content:
          "Smart Tools Everywhere — six smart freight calculators: CBM, air volume weight, landed cost, export pricing, air vs sea comparison and demurrage risk.",
      },
      { property: "og:title", content: "Smart Tools Everywhere — Freight Intelligence Suite" },
      {
        property: "og:description",
        content: "Six smart freight calculators in one place — analytics-rich PDF exports included.",
      },
    ],
  }),
  component: FreightIntelligencePage,
});

const BANNER_KEY = "astromar.freight.banner";
const CURRENCY_KEY = "astromar.freight.currency";

interface CurrencyPrefs {
  currency: string;
  baseCurrency: string;
  fxRate: number;
}

const DEFAULT_CURRENCY_PREFS: CurrencyPrefs = {
  currency: "INR",
  baseCurrency: "INR",
  fxRate: 0,
};

function readCurrencyPrefs(): CurrencyPrefs {
  if (typeof window === "undefined") return DEFAULT_CURRENCY_PREFS;
  try {
    const raw = localStorage.getItem(CURRENCY_KEY);
    if (!raw) return DEFAULT_CURRENCY_PREFS;
    const parsed = JSON.parse(raw) as Partial<CurrencyPrefs>;
    return {
      currency: parsed.currency ?? DEFAULT_CURRENCY_PREFS.currency,
      baseCurrency: parsed.baseCurrency ?? DEFAULT_CURRENCY_PREFS.baseCurrency,
      fxRate: typeof parsed.fxRate === "number" ? parsed.fxRate : DEFAULT_CURRENCY_PREFS.fxRate,
    };
  } catch {
    return DEFAULT_CURRENCY_PREFS;
  }
}

function FreightIntelligencePage() {
  const [active, setActive] = useState<CalcKey>("cbm");
  const [bannerOpen, setBannerOpen] = useState(true);
  const [historySheetOpen, setHistorySheetOpen] = useState(false);
  const [compareMode, setCompareMode] = useState<{ left: CalcKey; right: CalcKey } | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  // ----- per-calculator state, lifted so values persist across tab switches -----
  const [cbmItems, setCbmItems] = useState<CbmItem[]>(() => [emptyCbmItem(0)]);
  const [airItems, setAirItems] = useState<AirItem[]>(() => [emptyAirItem(0)]);
  const [airDivisor, setAirDivisor] = useState(6000);
  const [landed, setLanded] = useState<LandedInput>(() => {
    const p = readCurrencyPrefs();
    return {
      lines: [emptyLandedLine(0)],
      freight: 0,
      insurance: 0,
      additional: 0,
      gstRate: 18,
      currency: p.currency,
      fxRate: p.fxRate,
      baseCurrency: p.baseCurrency,
    };
  });
  const [exp, setExp] = useState<ExportInput>(() => {
    const p = readCurrencyPrefs();
    return {
      lines: [emptyExportLine(0)],
      freight: 0,
      insurance: 0,
      additional: 0,
      currency: p.currency,
      fxRate: p.fxRate,
      baseCurrency: p.baseCurrency,
    };
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
    port: "",
    cargoType: "General",
    freeDays: 5,
  });

  // Persist currency prefs whenever Landed or Export changes them.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefs: CurrencyPrefs = {
      currency: landed.currency,
      baseCurrency: landed.baseCurrency ?? "INR",
      fxRate: landed.fxRate ?? 0,
    };
    try {
      localStorage.setItem(CURRENCY_KEY, JSON.stringify(prefs));
    } catch {
      /* quota — ignore */
    }
  }, [landed.currency, landed.baseCurrency, landed.fxRate]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefs: CurrencyPrefs = {
      currency: exp.currency,
      baseCurrency: exp.baseCurrency ?? "INR",
      fxRate: exp.fxRate ?? 0,
    };
    try {
      localStorage.setItem(CURRENCY_KEY, JSON.stringify(prefs));
    } catch {
      /* quota — ignore */
    }
  }, [exp.currency, exp.baseCurrency, exp.fxRate]);

  // Cross-calc: copy Landed line items → Export with default margin.
  const duplicateLandedToExport = () => {
    const DEFAULT_MARGIN = 20;
    setExp((prev) => ({
      ...prev,
      currency: landed.currency,
      baseCurrency: landed.baseCurrency,
      fxRate: landed.fxRate,
      freight: landed.freight,
      insurance: landed.insurance,
      additional: landed.additional,
      lines: landed.lines.map((l) => ({
        id: nextId("el"),
        description: l.description,
        hsCode: l.hsCode,
        qty: l.qty,
        unitValue: l.unitValue,
        margin: DEFAULT_MARGIN,
      })),
    }));
    setActive("export");
    toast.success("Copied to Export Price", {
      description: `${landed.lines.length} line item(s) duplicated with ${DEFAULT_MARGIN}% default margin.`,
    });
  };

  useEffect(() => {
    const stored = localStorage.getItem(BANNER_KEY);
    setBannerOpen(stored !== "0");
  }, []);

  // Track page scroll to add a subtle shadow under the sticky tab strip.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
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

  /**
   * Renders the calculator UI for a given key. Reused by the single-tool view
   * and the split-compare view (each pane calls this with its own key).
   */
  const renderCalculator = (key: CalcKey) => {
    switch (key) {
      case "cbm":
        return <CbmCalculator items={cbmItems} setItems={setCbmItems} />;
      case "air":
        return (
          <AirCalculator
            items={airItems}
            setItems={setAirItems}
            divisor={airDivisor}
            setDivisor={setAirDivisor}
          />
        );
      case "landed":
        return (
          <LandedCalculator
            state={landed}
            setState={setLanded}
            onDuplicateToExport={duplicateLandedToExport}
          />
        );
      case "export":
        return <ExportCalculator state={exp} setState={setExp} />;
      case "compare":
        return <CompareCalculator state={compare} setState={setCompare} />;
      case "risk":
        return <RiskCalculator state={risk} setState={setRisk} />;
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
                <span className="text-sm font-bold">S</span>
              </div>
              <div className="leading-tight">
                <div className="text-sm font-bold tracking-tight text-brand-navy md:text-base">Smart Tools</div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Freight Tools
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 md:gap-3">
              <ThemeToggle />
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
                      <Phone className="size-4 text-brand-orange" />
                      <span>+91 99402 11014</span>
                    </a>
                    <a href="mailto:sales@astromarfreezone.com" className="flex items-center gap-2 text-brand-navy">
                      <Mail className="size-4 text-brand-orange" />
                      <span>sales@astromarfreezone.com</span>
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
          {/* Active-tab progress indicator (hidden on lg where layout is calmer) */}
          <div className="relative mx-auto max-w-7xl px-3 md:px-4" aria-hidden>
            <div className="h-0.5 w-full overflow-hidden bg-brand-navy/10">
              <div
                className="h-full transition-all duration-300 ease-out"
                style={{
                  width: `${100 / CALCULATORS.length}%`,
                  marginLeft: `${(100 / CALCULATORS.length) * activeIdx}%`,
                  background: "var(--brand-orange)",
                }}
              />
            </div>
          </div>
        </div>

        {/* BREADCRUMB */}
        <section className="mx-auto max-w-7xl px-3 pb-1 pt-2 md:px-4">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground">
            <Link to="/freight-intelligence" className="hover:text-brand-orange">Home</Link>
            <ChevronRight className="size-3" />
            <span>Tools</span>
            <ChevronRight className="size-3" />
            <span className="font-semibold text-brand-navy">
              {compareMode
                ? `Compare: ${CALCULATORS.find((c) => c.key === compareMode.left)?.label} vs ${CALCULATORS.find((c) => c.key === compareMode.right)?.label}`
                : meta.label}
            </span>
          </nav>
        </section>

        {/* CALCULATOR — single tool OR split compare view */}
        <section className="mx-auto max-w-7xl px-3 pb-10 md:px-4">
          {compareMode ? (
            <SplitCompareView
              left={compareMode.left}
              right={compareMode.right}
              renderCalc={renderCalculator}
              onSwap={() =>
                setCompareMode({ left: compareMode.right, right: compareMode.left })
              }
              onExit={() => setCompareMode(null)}
            />
          ) : (
            <>
              {/* Heading row: title on left, action cluster on right. Always single row — title truncates to make room. */}
              <div className="mb-3 flex flex-row items-center gap-2 sm:gap-3">
                {/* Title block */}
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    aria-hidden
                    className="h-10 w-1.5 shrink-0 rounded-full"
                    style={{
                      background:
                        "linear-gradient(180deg, var(--brand-navy), var(--brand-orange))",
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-bold text-brand-navy md:text-xl">
                      {meta.label} Calculator
                    </h2>
                    <p className="truncate text-xs text-muted-foreground md:text-sm">{meta.sub}</p>
                  </div>
                </div>

                {/* Action cluster: Compare/History segmented control. Always visible, right-aligned on desktop. */}
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <div className="flex items-center gap-0.5 rounded-lg border border-brand-navy/30 bg-background p-0.5 shadow-sm">
                    <Tooltip>
                      <CompareDialog
                        active={active}
                        onConfirm={(left, right) => setCompareMode({ left, right })}
                        trigger={
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label="Compare calculators"
                              className="h-8 gap-1.5 rounded-md px-2.5 text-xs font-medium text-brand-navy hover:bg-brand-navy-soft"
                            >
                              <GitCompareArrows className="size-3.5" />
                              <span className="hidden sm:inline">Compare</span>
                            </Button>
                          </TooltipTrigger>
                        }
                      />
                      <TooltipContent side="bottom" className="sm:hidden">Compare calculators</TooltipContent>
                    </Tooltip>
                    <div aria-hidden className="h-5 w-px bg-brand-navy/15" />
                    <Sheet open={historySheetOpen} onOpenChange={setHistorySheetOpen}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <SheetTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label="View history"
                              className="h-8 gap-1.5 rounded-md px-2.5 text-xs font-medium text-brand-navy hover:bg-brand-navy-soft"
                            >
                              <HistoryIcon className="size-3.5" />
                              <span className="hidden sm:inline">History</span>
                            </Button>
                          </SheetTrigger>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="sm:hidden">View history</TooltipContent>
                      </Tooltip>
                      <SheetContent side="right" className="w-full p-0 sm:max-w-sm">
                        <SheetTitle className="sr-only">Calculation History</SheetTitle>
                        <HistoryPanel />
                      </SheetContent>
                    </Sheet>
                  </div>
                  {!bannerOpen && (
                    <button
                      onClick={reopenBanner}
                      className="no-print inline-flex shrink-0 items-center gap-1 rounded-md border border-brand-navy/20 bg-background px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:border-brand-orange hover:text-brand-orange"
                      aria-label="Show pro tip"
                    >
                      <Lightbulb className="size-3.5" />
                      <span className="hidden sm:inline">Tip</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Pro tip — full-width row below heading, no overlap with controls */}
              {bannerOpen && (
                <div
                  className="no-print mb-3 flex items-start gap-2 rounded-lg border-l-4 bg-brand-navy-soft p-2.5 text-xs sm:text-sm"
                  style={{ borderColor: "var(--brand-orange)" }}
                >
                  <Lightbulb className="mt-0.5 size-4 shrink-0 text-brand-orange" />
                  <p className="min-w-0 flex-1 text-foreground/90">
                    <span className="font-semibold text-brand-navy">Pro tip · </span>
                    {meta.tip}
                  </p>
                  <button
                    onClick={dismissBanner}
                    aria-label="Dismiss tip"
                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-background hover:text-brand-navy"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              )}

              {/* Recent calculations strip — full width, scrolls horizontally on mobile */}
              <div className="mb-4">
                <MiniHistoryStrip
                  type={active}
                  variant="inline"
                  onOpenFullHistory={() => setHistorySheetOpen(true)}
                />
              </div>

              {renderCalculator(active)}
            </>
          )}
        </section>

        {/* Mobile-only sticky bottom result bar (mirrors active calculator's result) */}
        <MobileResultBar result={mobileResult ?? null} inputsTable={mobileInputs} />

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
                  <span className="flex items-center gap-1.5">
                    <Phone className="size-3.5" />
                    <span>+91 99402 11014</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Mail className="size-3.5" />
                    <span>sales@astromarfreezone.com</span>
                  </span>
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

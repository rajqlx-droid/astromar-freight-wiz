import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { ThemeToggle } from "./theme-toggle";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/about", label: "About" },
  { to: "/services", label: "Services" },
  { to: "/ftwz", label: "FTWZ" },
  { to: "/contact", label: "Contact" },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header
      className="no-print sticky top-0 z-50 w-full border-b-2 bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80"
      style={{ borderBottomColor: "var(--brand-navy)" }}
    >
      <div className="mx-auto flex h-[60px] max-w-7xl items-center justify-between px-3 md:px-4">
        <Link to="/" className="flex items-center gap-2">
          <div
            className="flex size-8 items-center justify-center rounded-md text-white"
            style={{ background: "linear-gradient(135deg, var(--brand-navy), var(--brand-navy-strong))" }}
          >
            <span className="text-sm font-bold">A</span>
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-tight text-brand-navy md:text-base">
              Astromar
            </div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Logistics
            </div>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: true }}
              activeProps={{
                className: "text-brand-orange",
              }}
              className="rounded-md px-3 py-2 text-sm font-medium text-brand-navy transition-colors hover:bg-brand-navy-soft"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1 md:gap-2">
          <Button
            asChild
            size="sm"
            className="hidden text-white shadow-sm hover:opacity-90 md:inline-flex"
            style={{ background: "var(--brand-navy)" }}
          >
            <Link to="/freight-intelligence">
              <Calculator className="size-4" /> Tools
            </Link>
          </Button>
          <ThemeToggle />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden text-brand-navy"
                aria-label="Open menu"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetTitle>Menu</SheetTitle>
              <div className="mt-6 flex flex-col gap-1">
                {NAV.map((n) => (
                  <Link
                    key={n.to}
                    to={n.to}
                    onClick={() => setOpen(false)}
                    activeOptions={{ exact: true }}
                    activeProps={{ className: "bg-brand-navy-soft text-brand-orange" }}
                    className="rounded-md px-3 py-2 text-sm font-medium text-brand-navy transition-colors hover:bg-brand-navy-soft"
                  >
                    {n.label}
                  </Link>
                ))}
                <Link
                  to="/freight-intelligence"
                  onClick={() => setOpen(false)}
                  className="mt-3 inline-flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold text-white"
                  style={{ background: "var(--brand-navy)" }}
                >
                  <Calculator className="size-4" /> Open Tools
                </Link>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

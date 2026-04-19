import { Link } from "@tanstack/react-router";
import { Mail, Phone, MapPin } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="no-print mt-16 border-t-2" style={{ borderTopColor: "var(--brand-navy)" }}>
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-4">
        <div className="md:col-span-2">
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
            End-to-end freight, customs and Free Trade Warehousing Zone solutions out of Chennai,
            serving exporters and importers across India.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-brand-navy">Quick links</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {[
              ["/", "Home"],
              ["/services", "Services"],
              ["/ftwz", "FTWZ"],
              ["/freight-intelligence", "Tools"],
              ["/contact", "Contact"],
            ].map(([to, label]) => (
              <li key={to}>
                <Link to={to} className="text-muted-foreground transition-colors hover:text-brand-orange">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
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
              <a href="mailto:sales@astromarfreezone.com" className="hover:text-brand-orange break-all">
                sales@astromarfreezone.com
              </a>
            </li>
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 text-brand-orange" />
              <span>
                No. 922, 1st Floor, H-Block, 17th Main Road, Anna Nagar, Chennai - 600 040
              </span>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t bg-brand-navy-soft py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Astromar Logistics Pvt Ltd. All rights reserved.
      </div>
    </footer>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { Mail, Phone, MapPin } from "lucide-react";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact Astromar Logistics — Chennai FTWZ & Freight" },
      {
        name: "description",
        content:
          "Reach the Astromar Logistics team in Chennai for FTWZ, freight forwarding and customs solutions. Phone, email and office address.",
      },
      { property: "og:title", content: "Contact Astromar Logistics" },
      {
        property: "og:description",
        content: "Get in touch with our Chennai team for FTWZ and freight services.",
      },
    ],
  }),
  component: Contact,
});

function Contact() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:py-16">
      <h1 className="text-3xl font-bold text-brand-navy md:text-4xl">Contact us</h1>
      <p className="mt-3 text-muted-foreground">
        Speak with our Chennai team about FTWZ, freight or customs.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <a
          href="tel:+919940211014"
          className="rounded-xl border-2 p-5 transition-colors hover:bg-brand-navy-soft"
          style={{ borderColor: "var(--brand-navy)" }}
        >
          <Phone className="mb-2 size-5 text-brand-orange" />
          <div className="text-xs font-semibold uppercase text-muted-foreground">Phone</div>
          <div className="mt-1 font-semibold text-brand-navy">+91 99402 11014</div>
        </a>
        <a
          href="mailto:sales@astromarfreezone.com"
          className="rounded-xl border-2 p-5 transition-colors hover:bg-brand-navy-soft"
          style={{ borderColor: "var(--brand-navy)" }}
        >
          <Mail className="mb-2 size-5 text-brand-orange" />
          <div className="text-xs font-semibold uppercase text-muted-foreground">Email</div>
          <div className="mt-1 break-all font-semibold text-brand-navy">
            sales@astromarfreezone.com
          </div>
        </a>
        <div
          className="rounded-xl border-2 p-5"
          style={{ borderColor: "var(--brand-navy)" }}
        >
          <MapPin className="mb-2 size-5 text-brand-orange" />
          <div className="text-xs font-semibold uppercase text-muted-foreground">Office</div>
          <div className="mt-1 text-sm font-medium text-brand-navy">
            No. 922, 1st Floor, H-Block, 17th Main Road, Anna Nagar, Chennai - 600 040
          </div>
        </div>
      </div>
    </div>
  );
}

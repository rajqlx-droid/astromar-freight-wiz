import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Astromar Logistics — FTWZ Specialists, Chennai" },
      {
        name: "description",
        content:
          "Learn about Astromar Logistics Pvt Ltd, a Chennai-based FTWZ and freight forwarding company serving exporters and importers across India.",
      },
      { property: "og:title", content: "About Astromar Logistics" },
      {
        property: "og:description",
        content: "Chennai-based FTWZ and freight forwarding specialists serving India.",
      },
    ],
  }),
  component: About,
});

function About() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 md:py-16">
      <h1 className="text-3xl font-bold text-brand-navy md:text-4xl">About Astromar Logistics</h1>
      <p className="mt-4 text-base text-muted-foreground">
        Astromar Logistics Pvt Ltd is one of India's leading Free Trade Warehousing Zone (FTWZ)
        providers, headquartered in Chennai. We help exporters and importers move freight efficiently
        across air and sea, while reducing landed costs through smart bonded warehousing.
      </p>
      <p className="mt-4 text-base text-muted-foreground">
        Our team blends decades of customs, freight forwarding and warehousing experience with modern
        tools that give clients real-time visibility into shipping costs, duties and risk.
      </p>
    </div>
  );
}

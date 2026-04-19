import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/freight-intelligence"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go to Tools
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Freight Intelligence Tools — Astromar Logistics" },
      {
        name: "description",
        content:
          "Free freight calculators by Astromar Logistics: CBM, air volume weight, landed cost, export pricing, air vs sea comparison and demurrage.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:title", content: "Freight Intelligence Tools — Astromar Logistics" },
      { name: "twitter:title", content: "Freight Intelligence Tools — Astromar Logistics" },
      { name: "description", content: "Freight Navigator is a suite of online tools for calculating shipping costs and logistics metrics." },
      { property: "og:description", content: "Freight Navigator is a suite of online tools for calculating shipping costs and logistics metrics." },
      { name: "twitter:description", content: "Freight Navigator is a suite of online tools for calculating shipping costs and logistics metrics." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/4576d33d-cc0a-4406-ac2c-a0c0adcdf54b/id-preview-65ce43cb--82366d2e-29ff-43bd-b798-213583517d29.lovable.app-1776622730704.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/4576d33d-cc0a-4406-ac2c-a0c0adcdf54b/id-preview-65ce43cb--82366d2e-29ff-43bd-b798-213583517d29.lovable.app-1776622730704.png" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <div className="min-h-screen bg-background">
      <Outlet />
      <Toaster richColors position="top-right" />
    </div>
  );
}

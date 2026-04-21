import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// jsdom doesn't implement matchMedia — several shadcn components read it on
// mount. Stub it so smoke tests don't crash before they reach the assertions.
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// jsdom doesn't implement ResizeObserver either — Radix popovers use it.
if (typeof window !== "undefined" && !("ResizeObserver" in window)) {
  // @ts-expect-error — minimal stub
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

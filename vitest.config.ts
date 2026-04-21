import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest config — kept separate from `vite.config.ts` because that file uses
 * a wrapped `@lovable.dev/vite-tanstack-config` factory that does not expose
 * a `test` field. Vitest auto-loads this file when running `bunx vitest`.
 *
 * jsdom is used so we can mount real React components (e.g. <CbmCalculator>)
 * to smoke-test the items↔draftItems sync end-to-end and catch any
 * regression of the React error #185 infinite-loop bug.
 */
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Exclude the dev-only checklist module itself — it exports the harness
    // that the tests use, but contains no test cases of its own.
    exclude: ["node_modules", "dist", ".lovable"],
    css: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

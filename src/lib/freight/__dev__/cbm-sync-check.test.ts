import { describe, it, expect } from "vitest";
import { runCbmSyncChecks } from "@/lib/freight/__dev__/cbm-sync-check";

/**
 * Guard against React error #185 ("Maximum update depth exceeded") regressions
 * in the CBM calculator's items↔draftItems sync.
 *
 * The shared checklist (`runCbmSyncChecks`) is the single source of truth — it
 * runs in dev mode in the browser via ?debug=1 AND here in CI. Each invariant
 * gets its own `it()` so a regression points at the exact rule that broke.
 */
describe("CBM items↔draftItems sync invariants", () => {
  const report = runCbmSyncChecks();

  it("overall report is OK", () => {
    if (!report.ok) {
      // Print every failed check so the test output is actionable.
      const failed = report.results.filter((r) => !r.passed);
      throw new Error(
        "CBM sync checklist failed:\n" +
          failed.map((r) => `  ✗ ${r.name} (cycles=${r.cycles}) — ${r.detail}`).join("\n"),
      );
    }
    expect(report.ok).toBe(true);
  });

  // Generate one assertion per check so a partial regression shows up as
  // multiple distinct test failures, not one opaque "report failed".
  for (const result of report.results) {
    it(result.name, () => {
      expect(
        result.passed,
        `cycles=${result.cycles} — ${result.detail}`,
      ).toBe(true);
    });
  }
});

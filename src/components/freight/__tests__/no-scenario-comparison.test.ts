import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Visual regression guard — the "Scenario Comparison" panel was removed from
 * the 3D loader screen. This test ensures the panel (and its hooks) never
 * sneak back in via copy-paste or merge mistakes.
 *
 * We assert against the source file because the live component depends on a
 * Web Worker + canvas that jsdom can't run cheaply. Source-level guards are
 * fast, deterministic, and catch the regression at the only place it can
 * realistically reappear.
 */
describe("3D loader — Scenario Comparison removed", () => {
  const file = readFileSync(
    resolve(__dirname, "../container-load-view.tsx"),
    "utf8",
  );

  it("does not render a 'Scenario Comparison' heading", () => {
    expect(file).not.toMatch(/Scenario Comparison/);
  });

  it("does not expose a '+ Compare strategies' button", () => {
    expect(file).not.toMatch(/Compare strategies/i);
  });

  it("does not declare strategy-selection React state", () => {
    expect(file).not.toMatch(/selectedStrategyId/);
    expect(file).not.toMatch(/setSelectedStrategyId/);
    expect(file).not.toMatch(/compareStrategies/);
    expect(file).not.toMatch(/setCompareStrategies/);
  });

  it("does not import the ScenarioResult type", () => {
    expect(file).not.toMatch(/ScenarioResult/);
  });
});

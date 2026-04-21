import { describe, it, expect, vi } from "vitest";
import { createCbmSyncRecorder } from "@/lib/freight/__dev__/cbm-sync-metrics";

describe("createCbmSyncRecorder", () => {
  it("starts with zeroed metrics", () => {
    const r = createCbmSyncRecorder({ now: () => 0 });
    expect(r.metrics.parentPushCount).toBe(0);
    expect(r.metrics.effectCycleCount).toBe(0);
    expect(r.metrics.loopDetected).toBe(false);
  });

  it("counts parent pushes independently of effect cycles", () => {
    const r = createCbmSyncRecorder({ now: () => 0 });
    r.recordParentPush("push-items");
    r.recordParentPush("draft-flush");
    expect(r.metrics.parentPushCount).toBe(2);
    expect(r.metrics.effectCycleCount).toBe(0);
  });

  it("counts effect cycles for both directions", () => {
    const r = createCbmSyncRecorder({ now: () => 0 });
    r.recordEffectCycle("items->draft");
    r.recordEffectCycle("draft->items");
    r.recordEffectCycle("items->draft");
    expect(r.metrics.effectCycleCount).toBe(3);
  });

  it("trips loop detection when cycles exceed the threshold within the window", () => {
    const onLoop = vi.fn();
    let t = 0;
    const r = createCbmSyncRecorder({
      windowMs: 1000,
      loopThreshold: 5,
      now: () => t,
      onLoop,
    });
    // Fire 5 cycles within the window — should trip on the 5th.
    for (let i = 0; i < 5; i++) {
      t += 10;
      r.recordEffectCycle("draft->items");
    }
    expect(r.metrics.loopDetected).toBe(true);
    expect(onLoop).toHaveBeenCalledTimes(1);
    expect(onLoop.mock.calls[0][0]).toMatch(/loop detected/);
  });

  it("does NOT trip when cycles are spread across multiple windows", () => {
    const onLoop = vi.fn();
    let t = 0;
    const r = createCbmSyncRecorder({
      windowMs: 100,
      loopThreshold: 3,
      now: () => t,
      onLoop,
    });
    // 2 cycles, then advance past the window, then 2 more — never crosses
    // the threshold within a single window.
    r.recordEffectCycle("items->draft");
    r.recordEffectCycle("draft->items");
    t += 200; // window resets
    r.recordEffectCycle("items->draft");
    r.recordEffectCycle("draft->items");
    expect(r.metrics.loopDetected).toBe(false);
    expect(onLoop).not.toHaveBeenCalled();
  });

  it("only fires onLoop once per detected loop (no spam)", () => {
    const onLoop = vi.fn();
    let t = 0;
    const r = createCbmSyncRecorder({
      windowMs: 1000,
      loopThreshold: 3,
      now: () => t,
      onLoop,
    });
    for (let i = 0; i < 20; i++) {
      t += 5;
      r.recordEffectCycle("draft->items");
    }
    expect(onLoop).toHaveBeenCalledTimes(1);
  });

  it("reset() clears all metrics", () => {
    const r = createCbmSyncRecorder({ now: () => 0 });
    r.recordParentPush("push-items");
    r.recordEffectCycle("draft->items");
    r.reset();
    expect(r.metrics.parentPushCount).toBe(0);
    expect(r.metrics.effectCycleCount).toBe(0);
    expect(r.metrics.loopDetected).toBe(false);
  });
});

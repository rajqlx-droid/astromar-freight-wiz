

## Risk assessment for the manual "sideways OK" toggle

Short answer: **Very low risk. No architectural errors. Two minor edge cases worth knowing.**

### Why it's safe

The `allowSidewaysRotation` flag already exists end-to-end:
- It's already on the `CbmItem` type.
- The packer (`packing-advanced.ts`) already reads it.
- Downstream consumers (loading rows, 3D view, report, video) already react to it via the packer's output.
- Saved scenarios and history already serialize it.

We're only changing **one thing**: making an existing static label clickable, wired through the same item-update path that qty / dimension / weight already use. No new state, no new effects, no new data flow.

### The 2 edge cases (and how we handle them)

**1. Pallets and crates are force-rotated by the packer**
- `packing-advanced.ts` overrides `allowSidewaysRotation = true` for pallets and crates regardless of the flag.
- **Risk if ignored:** user clicks "off" on a pallet, expects fixed orientation, but the 3D plan still rotates it → looks like a bug.
- **Mitigation:** chip is rendered as locked-on and disabled for pallets/crates with a tooltip explaining why. Zero mismatch between UI and packer behavior.

**2. Existing items / saved scenarios may have `allowSidewaysRotation` undefined**
- Old history entries created before this field was always set.
- **Risk if ignored:** chip could render in a confusing in-between state, or `!undefined` toggling could feel unpredictable.
- **Mitigation:** read with a safe default at the chip site — `undefined → true` for kg-based packages (matches today's display). First click writes an explicit boolean. No migration needed, no crash, no schema change.

### What is NOT at risk

- Packer logic, recommender, loading rows, 3D view, report, video — **no code change**, so no behavior change beyond what the flag already controls.
- Worker re-run pipeline — reuses the existing debounced item-update path, so no new race conditions.
- Saved scenarios / history schema — backward compatible via the safe default.
- Pallet/crate special-case — preserved exactly.
- Performance — one extra boolean per item, one extra click handler. Negligible.

### Could anything break the build or throw at runtime?

- **TypeScript:** no, the field already exists on `CbmItem`.
- **Runtime:** no, the updater path is the same one already used by every other field on the row.
- **SSR / hydration:** no, it's a client-only interactive chip with no server dependency.

### Verdict

Safe to proceed. The only "risk" is the pallet/crate UX mismatch, which we explicitly handle by disabling the chip for those package types.

### Files touched (unchanged from prior plan)

- `src/components/freight/cbm-calculator.tsx` *(make the chip a real toggle, default-safe read, lock for pallets/crates)*


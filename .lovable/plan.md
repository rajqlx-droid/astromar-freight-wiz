

User wants the `[Compare | History]` segmented group (currently in the top header right cluster) moved down next to the Pro tip pill in the heading row.

Quick code check needed: confirm current location of Compare/History buttons and the Pro tip pill in `src/routes/freight-intelligence.tsx`.

Based on prior edits:
- Header right cluster: `[🌙 Theme] | [⇄ Compare | 🕒 History]`
- Heading row: `[▌ Load Optimizer Calculator / subtitle]  [💡 Pro tip pill]  [MiniHistoryStrip]`

## Plan

One edit to `src/routes/freight-intelligence.tsx`.

### Move Compare + History segmented group from the header into the heading row, beside the Pro tip pill

**Remove from header right cluster:**
- The segmented `[Compare | History]` button group and the `|` divider that separates it from the theme toggle.
- Header right cluster collapses to just `[🌙 Theme]`.

**Add into the heading row (right side, next to Pro tip):**
- Render the same two-button segmented control (`Compare` button + divider + `History` button, same styling as before) inside the heading row's right cluster.
- New heading-row right slot order (left → right): `[💡 Pro tip pill]  [⇄ Compare | 🕒 History]  [MiniHistoryStrip]`
- Wraps gracefully on narrow viewports thanks to existing `flex-wrap` on the heading row.

All click handlers (`setCompareOpen(true)`, `setHistoryOpen(true)`) and state stay identical — pure DOM relocation.

### Resulting layout at 920×502

```text
[S Smart Tools / FREIGHT TOOLS]                                          [🌙]
─────────────────────────────────────────────────────────────────────────────
[Load Optimizer | Air Volume | Landed Cost | Export Price | Air vs Sea | Demurrage]
Home > Tools > Load Optimizer
▌ Load Optimizer Calculator   💡 Pro tip: For sea freight... [×]  [⇄ Compare | 🕒 History]  [Recent chips]
  CBM / Load Simulator
[--- calculator inputs ---]
```

### Files touched
- `src/routes/freight-intelligence.tsx` — relocate one JSX block, no logic changes.

### Out of scope
- Theme toggle stays in header.
- Pro tip behavior, MiniHistoryStrip, tab strip, calculator internals unchanged.


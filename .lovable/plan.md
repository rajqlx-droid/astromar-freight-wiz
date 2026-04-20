
## Plan: cleanup header cluster, relocate Pro tip, remove duplicate brand chip

Three small edits to `src/routes/freight-intelligence.tsx`. No new components, no logic changes.

### 1. Remove the "Tools" button from the segmented header group

**What it does today:** It's a `disabled` button with a calculator icon, styled as the active state. It doesn't do anything when clicked — it's purely a visual "you are here" marker. Compare opens a dialog, History opens a sheet, but when neither is open you're already in calculator view, so the indicator is redundant and confusing.

**Change:** Delete the Tools `<Button>` (lines 358–368) and the divider after it (line 369). The header right cluster becomes:

```
[ 🌙 Theme ] | [ ⇄ Compare  |  🕒 History ]
```

Cleaner two-action group. Compare and History keep their existing behavior.

### 2. Move the Pro tip inline with the heading row (right side)

**Today:** Pro tip is a full-width banner above the tab strip (lines 430–458).

**New position:** Convert it to a compact pill that sits on the right side of the "Load Optimizer Calculator" heading row, replacing/sharing space with the `MiniHistoryStrip` area. The `mb-3 flex flex-wrap items-center gap-3` row at line 568 already has `ml-auto` for the right slot — Pro tip becomes a small dismissible chip:

```
[▌ Load Optimizer Calculator       💡 Pro tip: For sea freight... [×]    History · chips]
   CBM / Load Simulator
```

When dismissed, collapses to a tiny "💡 tip" link. Same `bannerOpen` / `dismissBanner` / `reopenBanner` state, just rendered in a different DOM location with tighter styling (max-width ~360px, single-line truncate with title attribute for full text on hover). The full-width banner block above the tab strip is removed.

### 3. Remove the duplicate "Smart Freight Tools" chip from the breadcrumb row

The header already shows `[S] Smart Tools / FREIGHT TOOLS` — the breadcrumb-row chip (lines 539–550) repeats the same brand and is the "one more" the user spotted. Delete that chip. The breadcrumb row collapses to just:

```
Home > Tools > Load Optimizer
```

Left-aligned, no right-side element. The `justify-between` wrapper becomes unnecessary; simplify to `flex items-center`.

### Resulting layout at 920×502

```text
[S Smart Tools / FREIGHT TOOLS]                    [🌙] | [⇄ Compare | 🕒 History]
─────────────────────────────────────────────────────────────────────────────────
[Tabs: Load Optimizer | Air Volume | Landed Cost | Export Price | Air vs Sea | Demurrage]
Home > Tools > Load Optimizer
▌ Load Optimizer Calculator         💡 Pro tip: For sea freight, CBM × 1000 ÷ 5...  [×]
  CBM / Load Simulator              [Recent: chip · chip · chip]
[--- calculator inputs ---]
```

Pro tip and MiniHistoryStrip now share the heading row's right side. The heading row may wrap on narrower viewports thanks to `flex-wrap` already in place — Pro tip wraps under the title, MiniHistoryStrip wraps under that.

### Files touched
- `src/routes/freight-intelligence.tsx` — three deletions/relocations only.

### Out of scope
- Compare dialog internals, tab strip styling, theme toggle, mobile bottom result bar.

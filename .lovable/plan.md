

## Plan: header cleanup + relocate hero/tip + remove Smart Freight Calculator card

Four targeted edits, all in `src/routes/freight-intelligence.tsx`. No new components.

### 1. Header right cluster — group Tools / Compare / History as one segmented control

Currently the right side is: `[Tools] [Theme] [Compare] [History]` — four loose buttons with mismatched styling (Tools is filled navy, Compare/History are outline, theme toggle in the middle splits the group).

Change to: `[Theme] · [Tools | Compare | History]`
- Move `ThemeToggle` to the left of the cluster (separated by a thin divider), so the three navigation actions sit together on the far right as a unified segmented group.
- Wrap Tools / Compare / History in a single rounded container (`rounded-lg border border-brand-navy/30 p-0.5 bg-background`) with each button as `variant="ghost" size="sm"` and tight internal dividers — gives them visual cohesion.
- Refine icons for clarity: keep `Calculator` for Tools, swap `ArrowLeftRight` → `GitCompareArrows` (more recognizable as "compare"), keep `History` clock icon. Icons sized `size-3.5` with text labels at `text-xs font-medium`.
- Tools button stays "active/current" styled (filled navy bg) since user is on the tools page; Compare and History are ghost until hovered.

For Compare: pass a custom `trigger` prop into `<CompareDialog>` (already supported per line 37 of compare-dialog.tsx) so it slots into the segmented group with matching styling.

### 2. Move "Smart Tools" brand block — use it AS the hero, drop the separate hero card

The hero card currently shows "Smart Freight Calculator" + "Calculate shipping costs..." (lines 499-532). The user wants this gone entirely, with the brand identity living near the breadcrumb instead.

- **Remove** the entire hero card div (lines 499-532) and its sentinel-driven collapse logic for the title (the sentinel + IntersectionObserver still exists for the tip banner).
- The breadcrumb row (`Home > Tools > Load Optimizer`) stays where it is, but on the **same row, right side**, render a compact brand chip: the "S" gradient square + "Smart Freight Tools" label (mirrors the header logo style at smaller scale). This puts the product identity adjacent to the breadcrumb as requested.
- Net effect: ~80-100px of vertical space reclaimed, "Smart Freight Calculator" duplicate heading gone (we already have "Load Optimizer Calculator" right below).

### 3. Move the Pro tip up — directly above the active tool tile (tab strip)

Currently the yellow "Pro tip" banner sits between the hero and the calculator section. The user wants it "near above tile" — meaning above the calculator tabs.

- Lift the banner JSX (lines 535-558) out of the hero section and render it **just above the tab strip** (before line 421), inside its own thin container `mx-auto max-w-7xl px-3 md:px-4 pt-2`.
- Keep the dismiss/reopen state machine identical. When dismissed, the small "Show tip" link appears in the same spot.
- The tip now contextually precedes the tool selector, which makes more sense (read tip → pick tool → use it) than its current position (read tip → scroll past hero → use tool).

### 4. Calculator section heading — keep, but lighter

With the hero gone, "Load Optimizer Calculator" + sub becomes the de facto page title. No structural change needed; just verify the inline `MiniHistoryStrip` on the right still fits cleanly at 920px width (it does — wraps to its own row below 640px already).

### Resulting top-of-page stack (920×502 viewport)

```text
[Header: S logo · Smart Tools | FREIGHT TOOLS]    [Theme · Tools|Compare|History]
[Tab strip: Load Optimizer | Air Volume | Landed Cost | Export Price | Air vs Sea | Demurrage]
[Pro tip: For sea freight, chargeable weight uses CBM × 1000 ÷ 5...]   [×]
[Home > Tools > Load Optimizer                              S Smart Freight Tools]
[▌ Load Optimizer Calculator                              History · Recent: chips]
[CBM / Load Simulator subtitle]
[--- calculator inputs visible without scrolling ---]
```

### Files touched
- `src/routes/freight-intelligence.tsx` — header right cluster restructure (366-415), lift Pro tip above tab strip, remove hero card, add brand chip into breadcrumb row, drop sentinel use for title collapse (keep for tip auto-collapse if useful, else remove).
- `src/components/freight/compare-dialog.tsx` — no code change; we'll just pass the `trigger` prop from the route.

### Out of scope
- The `MiniHistoryStrip` inline behavior beside the calculator heading (kept as-is from the previous round).
- Icon library swap (staying on lucide-react; `GitCompareArrows` is already available there).
- Mobile bottom result bar.


# Declutter the 3D Viewer + Optimisation Plan Text

Scope: text-only / overlay-only cleanup inside the **Optimise loading** result. No layout, no calculator, no math, no PDF changes. No edits outside the listed files.

## What's noisy today

**Inside the 3D viewer (`LoaderHUD` overlay, pinned to the bottom of the scene):**
1. A "live geometry audit" pill ("STEP k/N · ✓ Clean · 1 mm gap kept").
2. A second compliance pill ("READY TO LOAD" + score + Audit dropdown).
3. The instruction bar with two text lines: action + `itemLabel · dimsLabel · 📍 positionText` + warning suffix.
4. An expandable Foundation Audit panel that can stack a third overlay over the cargo.

That's up to **3 stacked chips + a 2-line instruction** floating on top of the cargo at once.

**Above and below the 3D viewer (`container-load-view.tsx`):**
5. `LengthBudgetChip` — a full prose paragraph with mm math ("12 row · 11,800 mm of 12,000 mm usable…").
6. `LimitExplanationPanel` — extra explanatory block.
7. `PalletStatusBar` redundantly restating "Pallet k of N · row r/R" when the HUD already shows `k/N`.
8. Trailing "Indicative loading pattern…" disclaimer paragraph.

**In the optimisation plan banner (`ContainerSuggestion`):**
9. A 2-line "Smart recommendation" header + a separate lightbulb sentence ("Optimal fit for X m³ / Y kg.") + a verbose reason paragraph for shut-out cases — three text bands stacked above a single progress bar.

## What changes

### `src/components/freight/loader-hud.tsx` — collapse the overlay to one bar

- **Remove** the live-audit pill (lines 128–155). The "1 mm gap kept" chip is dev/QA grade signal — its absence does not change correctness, and the compliance pill already conveys legality.
- **Merge** the compliance pill into the main playback bar instead of stacking it above. New layout: a single rounded bar with `[state dot] [k/N] [short instruction] | [◀ ▶ ▶▶] [speed]`.
- **Simplify the instruction line** from two lines to one:
  - Drop the secondary line (`itemLabel · dimsLabel · 📍 positionText`) from the always-on overlay.
  - Keep only `step.action` (e.g. "Load Item 2 — back-left, layer 2"), truncated.
  - Show the warning indicator as a single `⚠` icon (no inline text), with the warning text moved into the element's `title` tooltip.
- **Move the Foundation Audit** out of an in-scene dropdown:
  - Remove the inline `auditOpen` panel (lines 183–258) from the overlay.
  - Replace the "Audit" button with a small `i` info button that opens the same audit content in a Radix `Popover` anchored above the bar (so it doesn't permanently float over cargo, and only renders when the user clicks).
  - When `state === "RED"` and `planMeta.hardViolations` exist, keep a single-line summary visible (e.g. "✗ 2 hard violations · view") that opens the popover.
- **Empty state** ("Press ▶ to load the first pallet") shortens to "Press ▶ to start".

Net: from 3 overlays + 2-line text to **1 overlay + 1-line text**, with the deep audit on demand.

### `src/components/freight/container-load-view.tsx` — trim chrome around the viewer

- **Delete** the `LengthBudgetChip` block above the viewer (line 452 + helper at lines 601–640). The mm-level explanation belongs in the report PDF, not on screen.
- **Delete** the `PalletStatusBar` under the viewer (lines 515–522 + helper at 549–569). The HUD `k/N` chip already states this.
- **Replace** the trailing 2-line indicative paragraph (lines 538–540) with a single muted sentence: "Indicative pattern — actual stow varies." Or move it into the `Indicative` chip's `title` tooltip and remove the standalone line entirely.
- Keep `StatsBar`, `LimitExplanationPanel`, `Legend`, `LoadingSequence`, `LoadingRowsPanel`, `LoadReportPanel` untouched (those are separate, sectioned content — not viewer overlay noise).
- Shorten the calculating fallback: "Computing optimal fit…" + 2-line subhint becomes "Computing optimal fit…" only.
- Shorten the suspense fallback "Loading 3D viewer…" to "Loading viewer…".
- Empty state: drop the second helper line; keep the icon + "Add cartons to generate loading plan."

### `src/components/freight/container-suggestion.tsx` — tighten the recommendation banner

- Collapse the **header + lightbulb sentence + reason paragraph** into a single one-line strapline:
  - Non-shut-out happy path: hide the lightbulb sentence entirely (the banner is already hidden when current choice matches; when shown after a manual override, "Smart recommendation: 1 × 40ft HC · Apply" is enough).
  - Shut-out path: keep one sentence ("`<X>` m³ / `<Y>` kg exceed 40ft HC capacity.") and drop the duplicated reason variants. The detail moves into the existing shut-out stat grid which already shows packages/volume/weight.
- Drop the italic 2-line follow-ups under the shut-out grid ("Reduce quantities…" / "Switch manually to a larger container…"); the action buttons (`Switch to 40ft GP` / `40ft HC` / `Download summary`) already say what to do.

### Text style rules applied across the three files

- Max 1 sentence per informational element shown on the 3D viewer surface.
- No emoji or unit-math inside overlay chips (📍, mm totals → moved into tooltips/PDF).
- Detail-level content (foundation audit, length budget, mm slack) is opt-in via popover/tooltip, not always-rendered.

## Files touched (only these)

- `src/components/freight/loader-hud.tsx`
- `src/components/freight/container-load-view.tsx`
- `src/components/freight/container-suggestion.tsx`

Nothing else changes — calculators, packing math, 3D scene, PDF export, audit logic, and routing all stay as-is. Compliance + audit data remain available; only their on-screen surface area shrinks.

## Acceptance criteria

- Only **one** floating bar is visible inside the 3D viewer at any time (no second pill above it, no expanded panel by default).
- HUD instruction line is **single-line**, with warning details moved to a tooltip.
- Foundation audit and hard-violation detail open via a click into a Popover, not as a permanent overlay.
- The viewer card no longer shows the `Length budget` paragraph or the duplicate `Pallet k of N · row r/R` strip.
- The `ContainerSuggestion` banner shows at most one descriptive sentence above its stat row.
- All existing tests still pass; no behaviour change for compliance/audit/recommendation logic.

Approve to apply these trims.


## Enhancement opportunities — Web & Mobile

Quick audit of `/freight-intelligence`. Here's what would meaningfully improve the experience, grouped by impact. Pick what you want and I'll ship it.

### Critical fix (do first, free)
- **Hydration mismatch** — `crypto.randomUUID()` runs in `useState` initializer, so SSR generates one ID and client generates another (visible in your runtime errors). Fix: generate IDs inside `useEffect` after mount, or seed deterministically. Zero new features, just stops React from throwing.

### Mobile UX (highest ROI)
1. **Sticky bottom "Results" sheet on mobile** — right now results sit below the form; on a phone you scroll past 5 inputs to see the number change. Add a collapsible bottom drawer that always shows chargeable weight / total cost, expands to full results on tap.
2. **Larger touch targets + numeric keyboard polish** — inputs are `h-10` (40px), Apple HIG wants 44px. Add `+`/`−` steppers next to each number field for thumb editing without keyboard.
3. **Swipeable tab strip with active indicator** — current strip scrolls but the active tab can be off-screen. Auto-scroll active into view + add a thin orange progress bar under the active tab.
4. **Bottom action bar** for Save / PDF / Share on mobile (replaces the 7-button toolbar that wraps to 3 rows on a 360px screen).
5. **Pull-to-refresh "Clear form"** gesture — fast reset without hunting for the button.

### Web UX
6. **Keyboard shortcuts** — `1`–`6` to jump tabs, `⌘/Ctrl+S` to save, `⌘/Ctrl+P` PDF, `⌘/Ctrl+K` opens history search. Show a `?` cheatsheet modal.
7. **Live diff badges** — when a value changes, animate the result with a green/red delta pill ("+12% chargeable") so users see impact instantly.
8. **Side-by-side scenarios** (Phase 2 item from the original plan) — duplicate current inputs into "Scenario A / B" columns and compare totals. Huge for landed-cost and air-vs-sea.
9. **Container fill visualizer** — for CBM, render a tiny SVG of a 20ft/40ft container with cargo % filled. Visual proof beats a number.
10. **Empty-state placeholder values** — pre-fill sample numbers (greyed) so first-time users see a working result immediately, cleared on focus.

### Functional / data
11. **URL-encoded shareable state** — the "Share" button copies `window.location.href` but state isn't in the URL, so the recipient sees an empty form. Encode inputs into the query string.
12. **CSV/JSON export of a single result** (currently only history exports CSV).
13. **Presets library** — "20ft GP", "40ft HC", "LD3 air pallet", "Mumbai port rates" — one click loads container dims + grace days + typical demurrage.
14. **Currency live conversion** — landed cost / export price already have ₹/$/€ selector but no conversion. Add a free FX rate (e.g. exchangerate.host) with a "rate as of" timestamp.
15. **Per-field validation messages** — Zod is installed but not wired; add inline errors ("Length must be > 0", "Margin can't exceed 1000%").

### Performance & polish
16. **Debounce + memoize** — calculations re-run on every keystroke. Add 200ms debounce + `useDeferredValue` so typing on slow phones stays smooth.
17. **Code-split per calculator** — lazy-load the 5 inactive calculators; first paint drops noticeably.
18. **Animations** — `animate-fade-in` on result changes, `slide-in-right` on history panel open.
19. **Dark mode QA** — brand tokens exist but several inline `style={{ background: "var(--brand-navy-soft)" }}` blocks don't adapt; audit and fix contrast.
20. **Skeleton loaders** for history/saved on first mount instead of a flash of "No saved calculations".

### Accessibility
21. **Tab strip ARIA** — `role="tab"` is set but missing `aria-controls` linking to the panel + `tabindex="-1"` on inactive tabs (correct roving-tabindex pattern).
22. **Live region for results** — wrap the results card in `aria-live="polite"` so screen-reader users hear updates.
23. **Reduce-motion** respect on the orange decorative circle and any future animations.

### Recommended bundle (if you want one pick)
**Mobile-focused pack**: items 1, 2, 3, 4, 16, 18 — fix hydration, add bottom result sheet, ±steppers, auto-scroll active tab, bottom action bar, debounce, fade-in. That's the biggest perceived quality jump for phone users without scope creep.

Tell me which numbers to ship (or "mobile pack" / "web pack" / "all") and I'll switch to build mode.


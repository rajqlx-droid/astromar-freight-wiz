

## Plan: tighten the layout, remove duplicate "History" surface

The screenshot shows two history entry points stacked above the calculator: the **History button** in the top-right header *and* the **"Recent saves" strip** just above the calculator inputs. Combined with the big hero block and the section heading, the actual calculator is pushed roughly 600px down the page on a 502px-tall viewport — users have to scroll before they can do anything.

### What I'll change

**1. Kill the duplication — fold "Recent saves" into the section heading row.**
The `MiniHistoryStrip` (lines 593-596 in `src/routes/freight-intelligence.tsx`) currently renders as a full-width dashed banner of its own. I'll move it *inline* into the calculator section header (the row with the gradient bar + "Load Optimizer Calculator" title), right-aligned. Same chips, same popover, same "See all" button — just no longer a separate stacked block. Saves ~56px of vertical space and visually groups the two history surfaces (header button = full archive, inline chips = quick recall for *this* tool) instead of competing.

**2. Slim the hero.**
The hero card (lines 496-529) eats ~150px when expanded. Two small fixes:
- Drop default padding from `p-5 md:p-6` to `p-3 md:p-4`, and title from `text-xl md:text-2xl` to `text-base md:text-lg`.
- Make the hero start *already collapsed* on viewports shorter than 700px (the IntersectionObserver still expands/collapses on scroll, just with a smaller starting footprint).

**3. Tighten section spacing.**
- Hero section padding `pt-4 pb-4` → `pt-3 pb-2`.
- Calculator section `pb-10` stays, but the top `mb-4` on the heading row → `mb-3`.
- Breadcrumb `mb-3` → `mb-2`.

**4. Mini-strip visual polish (since it's now inline).**
- Drop the dashed border and background — it becomes a borderless inline group: `History icon · "Recent:"` label + chips + "See all" link, sized to match the heading row's right side.
- On screens <640px it wraps below the heading instead of squeezing.

### Files touched
- `src/routes/freight-intelligence.tsx` — restructure the heading row (lines 576-599), trim hero padding/typography (lines 483-530), tighten breadcrumb spacing.
- `src/components/freight/mini-history-strip.tsx` — add a `variant?: "block" | "inline"` prop; inline variant drops the dashed wrapper, uses smaller chips, no "RECENT SAVES" uppercase label (just a history icon + chips).

### Result
At 920×502 (current viewport), the calculator inputs move up roughly 110-130px — the "Load Optimizer Calculator" heading and inputs become visible without scrolling, and "History" appears in exactly one obvious place per context (global = header button, current-tool quick recall = inline chips next to the title).

### Out of scope
- The header History button itself (that's the global archive, kept as-is).
- The hero's collapse-on-scroll behavior (kept, just with smaller starting size).
- Mobile bottom result bar.


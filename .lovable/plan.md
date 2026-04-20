
The user uploaded a screenshot but sent no message. The screenshot shows the current state of `/freight-intelligence` after the recent layout changes. Looking at it carefully, I can see what's likely the user's concern:

**Observations from the screenshot:**
1. ✅ Header: "Smart Tools / FREIGHT TOOLS" on left, theme toggle on right — clean
2. ✅ Tab strip: Load Optimizer (active, with orange underline), Air Volume, Landed Cost, Export Price, Air vs Sea, Demurrage — looks good
3. ⚠️ Breadcrumb row: `Home > Tools > Load Optimizer` on left, but the **Tools | Compare | History** segmented control is on the **right side of this row** — NOT in the header as planned
4. ⚠️ The "Smart Freight Tools" brand chip that was supposed to sit on the right of the breadcrumb is **missing**
5. ⚠️ Pro tip is at the bottom — it should be **above** the tab strip per the previous plan, but it's currently below the breadcrumb/heading area
6. ✅ "Load Optimizer Calculator / CBM / Load Simulator" heading is present

**What appears to have happened:** The previous implementation moved the Tools|Compare|History segmented control into the breadcrumb row instead of the header, and the Pro tip ended up below the heading instead of above the tab strip. The brand chip was also dropped.

Since the user sent an empty message with just this screenshot, they're likely pointing out that the layout still doesn't match what was planned. I should present a corrective plan.

## Plan: finish the layout cleanup that didn't fully land

Three small corrections in `src/routes/freight-intelligence.tsx` to match the previously approved layout.

### 1. Move Tools | Compare | History back into the header (top right)

Currently the segmented group sits inside the breadcrumb row on the right. Per the approved plan, it belongs in the **top header bar** alongside the theme toggle: `[Theme] · [Tools | Compare | History]`. Move the segmented `<div>` out of the breadcrumb row and into the header's right cluster, next to `<ThemeToggle />`.

### 2. Add the "Smart Freight Tools" brand chip on the right of the breadcrumb row

The breadcrumb row's right side is now empty. Add a compact chip there:
```
[ S ]  Smart Freight Tools
```
Small "S" gradient square (mirroring the header logo at ~20px) + text label, right-aligned in the breadcrumb row.

### 3. Lift the Pro tip above the tab strip

Currently the Pro tip renders below the breadcrumb/heading. Move its JSX block up so it renders **directly above the tab strip** (the row with Load Optimizer / Air Volume / Landed Cost / etc.). Container: `mx-auto max-w-7xl px-3 md:px-4 pt-2`. Dismiss/reopen state stays identical.

### Resulting top-of-page stack at 920×502

```text
[Header: S · Smart Tools | FREIGHT TOOLS]   [🌙  | Tools | Compare | History]
─────────────────────────────────────────────────────────────────────────────
[Pro tip: For sea freight, chargeable weight uses CBM × 1000 ÷ 5...]    [×]
[Tabs: Load Optimizer | Air Volume | Landed Cost | Export Price | Air vs Sea | Demurrage]
[Home > Tools > Load Optimizer                            [S] Smart Freight Tools]
[▌ Load Optimizer Calculator                          History · Recent: chips]
[CBM / Load Simulator]
[--- calculator inputs ---]
```

### Files touched
- `src/routes/freight-intelligence.tsx` — three reorderings, no logic changes.

### Out of scope
- Compare dialog internals, tab strip styling, mini-history popover.

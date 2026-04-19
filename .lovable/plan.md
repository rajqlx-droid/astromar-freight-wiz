

## Root cause

In `src/components/freight/loading-rows-panel.tsx` (lines 141–153), every time the 3D stepper advances (Load Row / Play All), this effect fires:

```
const el = rowRefs.current.get(activeRowIdx);
el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
```

The row `<li>` lives inside the right-hand panel, which is **not** itself a scroll container — it's part of the normal page flow under the 3D viewer. So `scrollIntoView` walks up the ancestor chain and ends up scrolling the **window** instead of a local pane. Result: every time you click "Load Row 2" or Play All ticks to the next row, the page yanks down to the panel and away from the 3D scene the user is actually watching.

`block: "nearest"` doesn't help here because once the row is below the fold relative to the window, "nearest" is "scroll the window down".

## The fix

Two-part, both in `loading-rows-panel.tsx`:

1. **Suppress window scroll.** Replace the `scrollIntoView` call with a manual scroll that only adjusts the *nearest scrollable ancestor* if there is one, and otherwise does nothing. Walk parents looking for an element with `overflow: auto/scroll` and a real scrollHeight > clientHeight; if found, do `parent.scrollTop = el.offsetTop - parent.offsetTop` (clamped). If not found, **skip scrolling entirely** — the user is already looking at the 3D scene; auto-opening the row card is enough feedback.

2. **Only scroll on user-initiated row jumps, not on every stepper tick.** Add a `prevActiveRowIdx` ref. When `activeRowIdx` changes, only attempt the local-container scroll if the *row index* actually changed (not just the pallet within the same row). During Play All, this means we scroll at most once per row transition, never per pallet.

Side benefit: removes the window jump entirely, so the user can keep their eyes on the 3D viewer while the panel auto-opens the matching row card in the background. If they want to see the instructions, they scroll down once — manually — and stay there.

## Files to change

- `src/components/freight/loading-rows-panel.tsx` — replace the effect at lines 141–153. ~15 lines changed. No API change, no other components touched.

## Out of scope

- Restructuring the panel to be its own scroll container (bigger layout change; ask if you want this).
- Changing the auto-open-row behaviour (kept — it's useful feedback).


## What changes

In `src/components/freight/cbm-calculator.tsx` (the row UI for each cargo line):

1. **Remove the standalone orientation badge** (the pill that toggles between "fixed orientation" and "sideways OK"). It's the entire `(() => { ... })()` block at lines ~1330–1374. Sideways rotation is still controlled inside the **Packing options** popover, so no functionality is lost — only the redundant inline pill goes away.

2. **Keep the package-type badge** (the green "carton" pill) exactly as it is.

3. **Packing options pill stays as "Packing options"** until the user actually opens the popover and confirms choices. Selecting a package type alone will NOT switch it to a summary. Concretely, the label condition becomes:
   - Show the confirmed summary only when the user has opened and confirmed the popover (the existing `confirmed` flag already gates this — verify it isn't being flipped by package-type selection alone, and if it is, decouple it so package type changes don't auto-confirm).
   - Otherwise always render `"Packing options"`.

4. **No structural change.** No files added or removed. Packing math, sideways logic in the popover, totals, 3D view, and Loading Rows are untouched.

## After the change, the row will show

```text
[ carton ]   [ Packing options ]   [ ... ]
```

instead of

```text
[ fixed orientation ]   [ carton ]   [ Packing options ]   [ ... ]
```

Sideways rotation toggle remains fully functional inside the Packing options popover.

## Files touched

- `src/components/freight/cbm-calculator.tsx` — remove the orientation badge block; verify `confirmed` is not set by package-type selection alone.

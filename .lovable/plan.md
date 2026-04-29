## Bug

In `src/components/freight/container-load-view.tsx`, the `StatsBar` shows totals from the **whole manifest** instead of the **loaded** cartons, while the percentage and "Packages loaded" counter reflect only what fit. This makes the numbers internally inconsistent.

Example from the user's screen:
- Used volume: **27.41 / 33.23 m³ · 42%** ← the 27.41 is *all 121 cartons*, but 42% is computed off only the 62 placed.
- Weight: **2,541 kg** ← total manifest weight, not just the 62 loaded.
- Packages loaded: **62 / 121** ← correct.

The pack object already exposes the right fields (`packing-advanced.ts` lines 52–57):
- `cargoCbm` — total CBM of placed + unplaced (currently shown — wrong).
- `placedCargoCbm` — CBM of placed cartons only (should be shown).
- `weightKg` — total manifest weight.
- `placedWeightKg` — placed cartons only.

## Fix

Edit `src/components/freight/container-load-view.tsx`:

1. **Line ~590** — change the "Used volume" numerator from `pack.cargoCbm` to `pack.placedCargoCbm`. Also show the *total manifest CBM* as a small secondary label so users still see how much they tried to load vs. how much fit:

   ```
   Used volume                     14.05 / 33.23 m³ · 42%
                                   of 27.41 m³ requested · 13.36 m³ unloaded
   ```

2. **Line ~599** — change the Weight stat to `pack.placedWeightKg` (loaded weight) and append a small "of X kg requested" hint when `placedWeightKg < weightKg`.

3. **Caller of `StatsBar`** (line 463): the `weight={weight}` prop currently passes total manifest weight. Either drop the prop and read both `placedWeightKg`/`weightKg` directly from `pack` inside `StatsBar`, or rename it to `totalWeight` and add a new `placedWeight` prop. Reading from `pack` is cleaner since both fields already live there.

4. **Optional polish**: when `pack.placedCartons < pack.totalCartons`, color the secondary "X unloaded" hint amber so the partial-fit case is visually obvious.

No changes needed to the packer or worker — the data is already correct, only the display is wrong. No new dependencies.

## Result

Stats will be self-consistent: the m³, kg, % and package count will all describe the **same 62 cartons** that actually fit, with the requested totals shown as context so the user immediately sees how much was left out.

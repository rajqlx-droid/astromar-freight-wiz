## Reset & refresh defaults: cm + carton

When the user clicks Reset (or refreshes the page), the calculator should default to:
- Length unit: **cm**
- Weight unit: **kg** (already default)
- Package type: **carton**
- Quantity: 0 (already handled)

Currently the unit picker is persisted in `localStorage` (`usePersistentLengthUnit` / `usePersistentWeightUnit`), so a previous user choice (e.g. `in`, `ft`, `lb`) sticks across refreshes and survives Reset. Reset also doesn't touch `lenUnit` or per-row `lenUnit`/`packageType`.

### Changes

**1. `src/components/freight/cbm-calculator.tsx` — `resetAll`**
- Reset global `lenUnit` to `"cm"` and global `weightUnit` to `"kg"` via the persistent setters (which also clears localStorage to `cm`/`kg`).
- Replace items with a fresh `emptyCbmItem` whose `lenUnit` is unset (so it inherits cm), `packageType: "carton"`, `qty: 0`.

**2. `src/components/freight/unit-selector.tsx` — persistence**
- Change `usePersistentLengthUnit` / `usePersistentWeightUnit` so the default on refresh is always `cm` / `kg`, and only switches when the user explicitly changes the picker in the current session.
- Approach: stop hydrating from localStorage on mount (or clear the stored value on load). Keep the setter writing to localStorage only if we want intra-session persistence; simplest is to drop persistence entirely and always boot at `cm`/`kg`.

**3. Per-row defaults**
- `emptyCbmItem` already has `packageType: "carton"` and no `lenUnit` (falls back to global `cm`), so no change needed in `calculators.ts`. The `add` row helper continues to inherit cm + carton.

### Result
- Page load → cm + carton + kg, regardless of previous session.
- Reset button → wipes manifest, restores cm + carton + kg, clears forced container, clears 3D pack.
- Manual change to inches/lb/crate during a session still works as today, but doesn't survive a refresh or a Reset.

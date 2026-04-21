

## Plan: Refactor `nearCeilingPlacedIdxs` from `Set` to `number[]` + fix CBM calculator state mutation

Three small, surgical edits across three files. No behavior changes intended beyond the type swap and the state-setter fix.

### 1. `src/components/freight/cbm-calculator.tsx`

Replace the stale `setItems(items.map(...))` call with the draft-state equivalent so row patches go through the same draft pipeline as the rest of the form:

- `setItems(items.map(...))` → `setDraftItems(draftItems.map(...))`

### 2. `src/lib/freight/packing-advanced.ts`

Convert `nearCeilingPlacedIdxs` from a `Set<number>` to a `number[]`:

- Type field: `Set<number>` → `number[]`
- Initializer: `new Set<number>()` → `[]`
- Insertion: `.add(i)` → `.push(i)`

### 3. `src/components/freight/container-3d-view.tsx`

Mirror the type change at the consumer:

- Prop type: `Set<number> | null` → `number[] | null`
- All membership checks: `nearCeilingPlacedIdxs?.has(i)` → `nearCeilingPlacedIdxs?.includes(i)`

### Technical notes

- I will first read each file to confirm the target lines exist verbatim and to count the `.has(i)` occurrences in `container-3d-view.tsx` so every call site is updated.
- No other files reference `nearCeilingPlacedIdxs` based on the symbol name, but I will grep to confirm before editing to avoid leaving a stray `Set` consumer that would break the build.
- After edits, run `bunx tsc --noEmit` to confirm the type swap is consistent across the three files and nothing else broke.
- Performance note (FYI, not changing): `Array.includes` is O(n) vs `Set.has` O(1). For the ceiling-reserve check this list is small (only boxes touching the ceiling band), so the difference is negligible — flagging only so you're aware this is a deliberate simplification, not a regression.

### Out of scope

No other logic, styling, or unrelated cleanup will be touched.


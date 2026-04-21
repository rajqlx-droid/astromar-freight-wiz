

## Create `src/lib/freight/gap-rules.ts`

Add a single new file containing gap/clearance rules for freight package types (carton, pallet, drum, crate, bale, bag). The module exports clearance constants, a `GapRule` interface, a `GAP_RULES_MM` lookup, a `getGapRule()` helper, and a `classifyGap()` function returning `"ALLOWED" | "WARN" | "BLOCK"`.

### Files touched

- **`src/lib/freight/gap-rules.ts`** (new) — exact contents you provided, verbatim. No formatting changes, no reordering, no added comments.

### Out of scope

- No edits to any existing file.
- No imports of this module from anywhere else (you can wire it in later).
- No tests, no type re-exports, no changes to `src/lib/freight/types.ts`.

### Notes

- File is pure TypeScript with no runtime side effects, so adding it cannot break the build or existing routes.
- Once approved, the file is created exactly as specified in a single write.


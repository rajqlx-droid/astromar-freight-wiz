# Explain why the 12th row cannot fit (1000mm cubes in 40HC)

## Audit findings (no bug in the packer)

Container 40HC inner length = **12,032 mm**. Door reserve = **100 mm** (mandatory so the doors close — `src/lib/freight/gap-rules.ts`). Usable length = **11,932 mm**.

With 1000 mm cubes, `floor(11,932 / 1,000) = 11` rows. A 12th row would need 1000 mm but only **932 mm** remains — that is the empty wedge visible at the door end of your screenshot. The packer is correct; no hidden rule is reducing capacity.

The 10 unloaded pieces (10.00 m³) shown in the HUD are exactly the cartons that would have formed (part of) row 12.

## What I will add so this is obvious in the UI

### 1. Length-budget chip in the AUDIT panel
In `src/components/freight/container-load-view.tsx` (AUDIT popover), add a new line:

```
Length budget — 11 rows × 1000 mm = 11,000 mm of 11,932 mm usable
                (12,032 inner − 100 door reserve). 932 mm slack.
                12th row needs 1,000 mm — 68 mm short.
```

Computed live from the active pack:
- `inner = container.inner.l`
- `reserve = DOOR_RESERVE_MM`
- `usable = inner - reserve`
- `rowDepth = max(placed.l for placed in current pack)` (or the dominant row depth)
- `rows = floor(usable / rowDepth)`
- `slack = usable - rows*rowDepth`
- `shortBy = rowDepth - slack` (only shown when `shortBy > 0`)

### 2. Dev-only console line
In `src/lib/freight/packing-advanced.ts`, behind `import.meta.env.DEV`, log once per pack:

```
[pack] inner=12032 door=100 usable=11932 rowDepth=1000 rows=11 slack=932 shortBy=68
```

So the next time you ask "why N rows?" the answer is one console line away.

### 3. Tiny tooltip on the door-end slack
In `src/components/freight/container-3d-view.tsx`, when slack > 0, render a faint label at the door end ("932 mm — door reserve + 832 mm free; one more row needs 1000 mm"). Same colour as existing dimension chips, only when `showDimensions` is on.

## Files
- `src/components/freight/container-load-view.tsx` — AUDIT chip
- `src/components/freight/container-3d-view.tsx` — slack label at door end
- `src/lib/freight/packing-advanced.ts` — dev-only log

## Out of scope
- Changing `DOOR_RESERVE_MM` (would be unsafe).
- Changing the packer logic — it is already optimal for 1000 mm cubes in this container.

Approve to implement.

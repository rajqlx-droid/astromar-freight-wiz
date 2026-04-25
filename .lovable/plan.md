
# Why 27 CBM lands in a 40ft and why upper rows aren't tilted

## What you are seeing

- **27 CBM but autofit says 40ft.** A 20GP has only 33.23 m³ raw capacity. 27 m³ is 81 % of that. With the 100 mm door reserve, the 80 mm ceiling reserve, and the 50 mm placement stride, the packer can rarely cram 81 % volume into a 20GP without leaving a few cartons unplaced — and the recommender escalates the moment even one carton is unplaced (`fitSingle` requires `placedCartons === totalQty`). The 40ft preview then *looks* half-empty because it is — the cargo only needed ~27/76 = 35 % of an HC.
- **Pallets pack tight, cartons don't.** Pallets are flagged `isRigidUnit` so the packer disables tilt (`allowAxisRotation = false`) and only tries L↔W. Fewer orientations + identical heights → clean rows.
- **Upper rows never tilt, even when the carton has tilt enabled.** The packer DOES build tilted orientations, but the scoring formula `score = x * 10_000 + z * 100 + …` makes back-wall floor placements always win. A carton that *could* tilt onto the top of the previous column gets a higher x (frontier moved forward) and loses to a fresh floor placement further forward in the original orientation. By the time the floor is full, the cartons left over are scored against the next-best floor slot rather than the residual headroom on top of column 1, so column tops stay empty.

## Plan

Four changes — recommender policy, packer scoring, a clarifying UI hint, and a manual-switch CTA.

### 1. New recommender policy: "20GP first when CBM allows"

`src/lib/freight/container-recommender.ts`

Today: a 20GP is rejected if even 1 of N cartons is unplaced → escalates to 40GP/40HC.
New rule the user asked for:

- **If `totalCbm ≤ USABLE_CBM["20gp"]` AND `totalWeightKg ≤ 20gp.maxPayloadKg`:**
  - **Always recommend 20GP**, even when geometry leaves some cartons unplaced.
  - Pack into the 20GP and report the unplaced cartons via the existing `shutOut` field (`reason: "exceeds-geometry"`).
  - Add a new `reasonDetail` string the UI can render verbatim, e.g.:
    *"27.0 m³ fits a 20ft GP by volume. Geometry could only place 58 of 60 cartons — 2 cartons (0.9 m³) shut out. Switch manually to 40ft GP if you want to ship the full load."*
- **If CBM or weight exceeds the 20GP cap:** existing escalation logic stays — pick the smallest container that fits.
- **If even a 40HC can't take the full load:** existing shut-out report stays.

This replaces the current `fitSingle()` "all-or-nothing" gate for the 20GP tier. The user explicitly wants 20GP shown even when a few cartons are shut out, with a clear reason and a manual-switch suggestion.

### 2. Manual-switch CTA in the recommendation banner

`src/components/freight/container-suggestion.tsx` (and wherever the recommendation summary is rendered).

When `recommendation.shutOut` is non-null AND the recommended container is the 20GP, render a secondary action:

> **"Switch to 40ft GP"** — clicking it overrides the autofit and re-runs the pack against a 40GP so the full load fits.

The button is a manual override; the recommender itself does not auto-escalate.

### 3. Try tilted orientations on top of existing stacks

`src/lib/freight/packing-advanced.ts`

Two scoring fixes inside the per-carton loop (lines ~544–633):

**(a) Reward filling residual headroom.** When a candidate sits on top of an existing column (`ev.z > 0`) AND its tilted orientation makes it fit under the ceiling where the original wouldn't, lower its score so it can beat a fresh-floor placement of the same carton:

```
const fillsResidualHead =
  ev.z > 0 && (ev.z + o.h) <= (C.h - CEILING_RESERVE_MM)
            && (ev.z + c.origH) >  (C.h - CEILING_RESERVE_MM);
if (fillsResidualHead) score -= 50_000;   // wins over a forward floor slot
```

**(b) Stack-completion bonus.** If the candidate's footprint fully covers an existing column's top face (supportRatio ≥ 0.98), shave 5 000 from the score so completing a column beats starting a new one a row forward. This is what loaders do in practice — fill the column before opening a new one.

Both bonuses only apply to cartons whose `allowAxisRotation === true`, so pallets and crates are unaffected.

### 4. Surface rotation usage in the limit panel

`src/components/freight/limit-explanation-panel.tsx`

Add one line: **"Tilt enabled: Yes/No — N of M cartons placed sideways/tilted"** using `placed[i].rotated`. Lets the user see whether the packer actually used the rotation flag they ticked.

## Files to edit

- `src/lib/freight/container-recommender.ts` — new "20GP first when CBM allows" policy + shut-out detail string.
- `src/components/freight/container-suggestion.tsx` — "Switch to 40ft GP" manual CTA.
- `src/lib/freight/packing-advanced.ts` — residual-head + stack-completion score adjustments.
- `src/components/freight/limit-explanation-panel.tsx` — rotation summary line.

## Verification

- Existing accuracy suite (`packing-advanced.accuracy.test.ts`) stays green — no overlap / floating / door-gap / ceiling-gap regressions.
- New regression: 30 × 90 cm cartons (~22 m³) → recommender returns **20GP** (not 40GP), with `shutOut = null` if all fit, or with a populated `shutOut` + reasonDetail if any don't.
- New regression: a manifest at 32 m³ (under 33.23 cap) where geometry can only place 90 % → recommender still returns 20GP, `shutOut.cartons > 0`, `reasonDetail` mentions "Switch manually to 40ft".
- New regression: 12 × tilt-enabled cartons that only fit 8-on-floor + 4-tilted-on-top → ≥ 11 placed in a 20GP (was 8).
- Manual override path: clicking "Switch to 40ft GP" re-runs against 40GP and the placed count matches a direct 40GP pack.

## Out of scope

- Auto-escalation when 20GP shuts cargo out (user explicitly asked for manual switch).
- Door-gap reclaim (still rejected).
- Multi-container loads (still single-container only).
- Pallet tilt (pallets remain rigid by design).

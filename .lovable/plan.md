# Rotation rules per package type

## The new matrix

| Package type | 90° floor swap (L↔W "sideways") | Tip onto side (H↔L/W "axis tilt") |
|---|---|---|
| Carton | Allowed (toggle, default ON) | Allowed (toggle, default OFF) |
| Bale | Allowed (toggle, default ON) | Allowed (toggle, default OFF) |
| Bag | Allowed (toggle, default ON) | Allowed (toggle, default OFF) |
| Drum | Allowed (toggle, default ON) | **Forbidden** (toggle disabled, tooltip: "Drums must stay upright") |
| Pallet | Allowed but **never auto-assumed** — toggle visible, default OFF, user must opt in | **Forbidden** (toggle disabled, tooltip: "Pallets ship in fixed upright orientation") |
| Crate | Allowed but **never auto-assumed** — toggle visible, default OFF, user must opt in | **Forbidden** (toggle disabled, tooltip: "Crates ship in fixed upright orientation") |

Key change vs today: pallets and crates currently force `allowSideways = true` and hide the toggle entirely. Per spec they must instead show the toggle (default OFF) so the user has to consciously confirm a 90° swap is acceptable.

## UI behavior (cbm-calculator.tsx)

Both rotation toggles ("Can lay sideways" and "Can stand on side") always render for every package type — no more "rigid unit" hidden block. Each toggle independently consults a small policy table:

- If forbidden → render the toggle in a disabled state, value forced to `false`, with a one-line tooltip / helper text explaining why ("Drums must stay upright", "Pallets ship in fixed upright orientation", etc.).
- If allowed → render normally.

When the user changes package type on an existing row, immediately clear any flags the new type forbids (set to `false`) and reset to the new type's default (sideways default is ON for carton/bale/bag/drum, OFF for pallet/crate; tilt default is OFF for everyone).

The amber "rigid unit" info box (lines 952–958) is removed — replaced by inline disabled toggles with tooltips.

## Packer behavior (packing-advanced.ts)

Replace the current ad-hoc check at lines 183–185 with a single helper `getRotationPolicy(packageType)` returning `{ canSideways, canAxis }`. Then:

```
const policy = getRotationPolicy(it.packageType);
const allowSideways = policy.canSideways && (it.allowSidewaysRotation === true);
const allowAxis     = policy.canAxis     && (it.allowAxisRotation === true);
```

Note the explicit `=== true`: pallets/crates no longer get a free pass to rotate sideways; the user's stored flag is the source of truth, gated by policy.

The new policy table:

```
carton: { canSideways: true,  canAxis: true  }
bale:   { canSideways: true,  canAxis: true  }
bag:    { canSideways: true,  canAxis: true  }
drum:   { canSideways: true,  canAxis: false }
pallet: { canSideways: true,  canAxis: false }
crate:  { canSideways: true,  canAxis: false }
```

The same helper is exported and reused by the UI so the rules live in one place.

## Defaults & migration (calculators.ts / emptyCbmItem)

`emptyCbmItem` already defaults `allowSidewaysRotation = true` and `allowAxisRotation = false` for cartons. No change needed for new items. For existing saved items where `packageType` is pallet/crate and `allowSidewaysRotation` is still `undefined`, the packer's `=== true` check will treat them as OFF — which matches the new "always ask" rule. Users will see the toggle off and can opt in.

## Files to edit

- `src/lib/freight/packing-advanced.ts` — add `getRotationPolicy`, replace lines 183–185, export the helper.
- `src/components/freight/cbm-calculator.tsx` — replace the rigid-unit branch (lines 952–976) with always-visible toggles that consult the policy; add disabled/tooltip styling; handle flag reset inside the `packageType` change handler at lines 1081 and 1241.
- `src/lib/freight/calculators.ts` — small helper if needed for the type-change reset (e.g. `defaultsForPackageType`).

## Verification

- Pick "drum" → tilt toggle is disabled with tooltip; sideways toggle works.
- Pick "pallet" → both toggles visible, sideways default OFF, tilt disabled. Packer leaves pallets unrotated unless user opts in.
- Pick "bag" → both toggles enabled, tilt allowed.
- Switch a row from carton (tilt ON) to drum → tilt flag cleared; switch back to carton → tilt stays cleared (user re-enables).
- Existing accuracy suite stays green; add one regression: a pallet with `allowSidewaysRotation` unset packs in original orientation only.

## Out of scope

- Changing the recommender or 20GP-first policy.
- Changing the tilt scoring bonuses.
- Per-orientation max-stack rules.

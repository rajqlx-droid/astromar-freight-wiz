

## Updated plan — gate packing options on CBM calculator only (not required elsewhere)

Same as before, but the **mandatory packing-options gate applies ONLY to the CBM calculator** (the one with 3D loading + container optimization). Other calculators (Air, Landed, Export, Compare, Risk) are unaffected — they don't use packing options anyway.

### 1. Add `packingConfirmed` flag
Add to `CbmItem` in `src/lib/freight/calculators.ts`:
- `packingConfirmed: boolean` (default `false`)

Only used by the CBM tab. Other calculators ignore it.

### 2. CBM calculator UI (`cbm-calculator.tsx`)
Group the existing flags (stackable, fragile, sideways, axis rotation, max stack weight) into a compact **"Packing options"** popover per cargo row:
- Trigger button shows status: *"⚠ Packing options required"* (amber) when not confirmed, or summary chip *"Stackable · Sideways OK · Max 200kg"* (green) when confirmed.
- Popover contains all toggles + max-stack-weight number field with tooltips.
- "Apply to all items" button for bulk setup.
- Auto-confirms the row the moment the user toggles anything inside.

### 3. Gate optimization features (CBM only)
When any row has `packingConfirmed === false`:
- Replace `<ContainerSuggestion>` banner with an amber warning card listing unconfirmed item names + "Review packing options" button that scrolls to the first incomplete row.
- Disable (greyed + tooltip) the 3D loading view, Loading Video button, and Download PDF button.
- Basic CBM math (volume, chargeable weight, totals) still runs normally.

### 4. Persist
Save `packingConfirmed` + flags via existing localStorage history snapshot in `storage.ts`.

### 5. Fix unrelated SSR hydration warning
In `src/routes/freight-intelligence.tsx`, fix the whitespace mismatch in the footer email span next to the `<Mail>` icon (server renders `" sales@..."`, client renders `" "`).

## Files touched
```text
EDIT  src/lib/freight/calculators.ts                  — add packingConfirmed: boolean to CbmItem
EDIT  src/components/freight/cbm-calculator.tsx       — Packing options popover, confirmation chip, gate logic, "Apply to all"
EDIT  src/components/freight/container-suggestion.tsx — accept "blocked" state + unconfirmed item list (CBM only)
EDIT  src/components/freight/results-card.tsx        — disable 3D / Video / PDF when CBM rows not confirmed
EDIT  src/lib/freight/storage.ts                      — persist new flag
EDIT  src/routes/freight-intelligence.tsx             — fix hydration whitespace bug in footer
```

## Out of scope
- Applying the gate to Air / Landed / Export / Compare / Risk calculators (not needed)
- Server-side validation
- Auto-detecting packing options from item dimensions


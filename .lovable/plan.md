## Findings from end-to-end analysis

I traced the preview path:

```text
CBM Calculator
  -> ContainerLoadView
  -> usePackingWorker
  -> packing-worker.ts
  -> pickBestPlan()
  -> packContainerAdvanced()
  -> buildRows() / buildPalletSequence() / 3D viewer
```

The visible issue is coming from `src/lib/freight/packing-advanced.ts`, not the 3D renderer. The viewer is showing the coordinates the packer produces.

## Small 1.5 ft cube test result

Test cargo: `1.5 ft × 1.5 ft × 1.5 ft` = `45.72 cm × 45.72 cm × 45.72 cm`

One carton CBM:

```text
0.4572 × 0.4572 × 0.4572 = 0.09557 m³
```

A smart geometric load should fit approximately:

```text
20ft GP: 12 length × 5 width × 5 high = 300 cartons ≈ 28.67 m³
40ft GP: 26 length × 5 width × 5 high = 650 cartons ≈ 62.12 m³
40ft HC: 26 length × 5 width × 5 high = 650 cartons ≈ 62.12 m³
```

Current packer result from the probe:

```text
20ft GP: placed 153 instead of ~300, only 14.62 m³
40ft GP: placed 318 instead of ~650, only 30.39 m³
40ft HC: placed 318 instead of ~650, only 30.39 m³
```

So the packer is using only about half of the physically loadable volume for this simple cube case.

## Root causes found

### 1. The row scoring still stacks before the floor row is complete

Current tight score is effectively:

```text
score = x * 10,000,000 + z * 1,000 + y * 1,000
```

For 45.72 cm cubes, moving sideways to the fifth floor position costs about the same or more than stacking upward. Result: after only 4 cubes across the width, the algorithm starts stacking instead of placing the 5th cube across the row.

That creates:

- empty space on one side of the container,
- premature vertical piles,
- lower total cartons loaded.

### 2. There is no true row frontier for width and height

The code only tracks `frontierX`. It does not track:

- current row start,
- next free width position,
- row floor completion,
- column height completion.

So it cannot enforce the real loading discipline:

```text
back row floor across width first
then stack that row cleanly
then next row forward
```

### 3. Stacked cartons are allowed to drift diagonally

The current support check accepts any placement with at least 85% support. For identical cubes this allows upper layers to sit offset from the cube below.

The test output showed examples like:

```text
floor: x=1, y=1, z=0
stack: x=93, y=93, z=457
next:  x=31, y=86, z=914
```

That is the zig-zag pattern you are seeing. It is technically above supported area, but it is not a smart loader pattern and wastes space.

### 4. Y-snap toward one side is still present

The plan said to remove the Y wall snap, but the current code still calls:

```ts
snapAxis("y")
```

That can pull placements toward `y = 0` and reinforces the one-side bias.

### 5. Earlier small-cargo fixes are not fully present in this code

Search shows no `small cargo backpass`, no `unplacedSmall`, no `void-seeking` scorer, and `runAllScenarios()` still has quantity downscaling for `qty > 300`. The main optimizer path uses full quantity, but the old downscale still exists in the comparison path and should be removed for consistency.

## Fix plan

### 1. Replace the current loose score with row-phase scoring

Implement explicit phases in `packContainerAdvanced()`:

```text
Phase A: fill the current back row floor across width
Phase B: stack completed floor columns vertically, aligned with supporters
Phase C: only then advance to the next x row
```

This will make the packer prefer:

```text
x row 1, y slot 1, z 0
x row 1, y slot 2, z 0
x row 1, y slot 3, z 0
x row 1, y slot 4, z 0
x row 1, y slot 5, z 0
then stack row 1 columns
then x row 2
```

### 2. Add real row/frontier state

Add tracking for:

- `currentRowXStart`
- `currentRowYFrontier`
- `currentRowFloorFull`
- `currentRowMinColumnTop`

Use this to decide whether a candidate is:

- same current row,
- completing width,
- stacking an already-laid floor column,
- incorrectly opening a forward row too early.

### 3. Generate exact edge candidates, not only stride-grid candidates

Add candidate X/Y positions from real cargo edges:

```text
1 mm wall clearance
existingBox.x + existingBox.l + 1 mm
existingBox.y + existingBox.w + 1 mm
existingBox.x
existingBox.y
```

This lets the algorithm find exact slots like the 5th cube across the width instead of missing it due to coarse stride and then stacking early.

### 4. Enforce aligned stacking for identical cartons

For same-size cartons, stacked placements should align directly above the supporter column unless there is a deliberate mixed-size bridge.

Add a strong rule/score:

- if one supporter fully matches the footprint, prefer exact same `x/y`,
- heavily penalize diagonal offsets on identical-size stacks,
- reject offset stacks when a clean aligned stack exists.

This removes the zig-zag tower pattern.

### 5. Remove the tight-mode Y wall snap

Change the commit snap order to:

```ts
snapAxis("x")
snapAxis("x")
```

Do not call `snapAxis("y")` in tight mode. Y should be selected by the row frontier, not dragged to one side afterward.

### 6. Restrict CoG spread rescue so it cannot override dense stowage

In `pickBestPlan()`, the forced spread retry currently keeps a spread plan if it places the same number of cartons and improves CoG. That can preserve count while making the visual pattern sparse/zig-zag.

Update it so spread rescue is only accepted when:

- it does not reduce placed cartons,
- it does not reduce placed CBM,
- it does not reduce packing density materially,
- the load is genuinely sparse.

Dense or partial-fit cargo should always prioritize maximum stowage.

### 7. Remove stale quantity downscaling in scenario comparison

Delete the `scaleFactor` / `safeItems` logic from `runAllScenarios()` so every path analyzes the real manifest quantity.

### 8. Add regression tests

Add tests for:

1. `1.5 ft cube capacity`
   - 20ft GP should load close to 300 cartons.
   - 40ft GP / 40ft HC should load close to 650 cartons.

2. `floor row fills width before stacking`
   - first back row should place 5 floor cubes across width before upper layers begin.

3. `no zig-zag identical cube stacks`
   - every stacked identical cube must have `x/y` aligned with its supporter column within a small tolerance.

4. `no one-side wall bias`
   - back row should use both sides of the width where geometry allows.

5. `small cargo backpass restored`
   - small cartons must fill voids after large cartons instead of being shut out.

6. Existing geometry legality still passes:
   - no overlap,
   - no floating cargo,
   - door reserve honored,
   - ceiling reserve honored.

## Expected result after implementation

For the 1.5 ft cube test, the viewer should show clean columns:

```text
Back row top view:
[ ][ ][ ][ ][ ]   full width
[ ][ ][ ][ ][ ]   next row
[ ][ ][ ][ ][ ]   next row
...
```

Side/front behavior:

```text
5 high clean vertical columns
no diagonal zig-zag stacks
no pile on only one side
row 1 densely filled before row 2 opens
```

Capacity should move from the current ~318 cartons in 40ft/40HC toward the correct ~650 cartons for this cube case.
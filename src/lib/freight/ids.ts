/**
 * Deterministic, SSR-safe ID generator for list items (React keys).
 *
 * Why not a module-level counter?
 *   In dev (StrictMode) and across SSR/CSR, state factories may run a
 *   different number of times on server vs client, so a global counter
 *   produces mismatching IDs and triggers a hydration error.
 *
 * Strategy:
 *   - Initial / "seed" items use stable, predictable IDs based on the prefix
 *     and a passed-in index (e.g. `cbm-0`, `air-0`). These are identical on
 *     server and client because they don't depend on call order.
 *   - Items added after mount (via user interaction) use a client-only
 *     timestamp + counter — those never run on the server, so they can't
 *     cause a hydration mismatch.
 */

let counter = 0;

/** Stable seed ID for initial items rendered during SSR. */
export function seedId(prefix: string, index = 0): string {
  return `${prefix}-seed-${index}`;
}

/** Client-only ID for items added after hydration. Safe in event handlers. */
export function nextId(prefix = "id"): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

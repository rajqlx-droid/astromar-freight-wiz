/**
 * Deterministic, monotonic ID generator.
 *
 * Replaces `crypto.randomUUID()` for client-side React state because random
 * UUIDs differ between SSR and the first client render, triggering a
 * hydration mismatch. A simple incrementing counter is sufficient for our
 * needs (DOM keys, dedupe within a single session) and is identical on
 * server and client because the initial state always starts at 1.
 */
let counter = 0;

export function nextId(prefix = "id"): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

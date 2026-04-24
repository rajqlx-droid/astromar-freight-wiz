/**
 * Single source of truth for valid container IDs.
 * Import this wherever a container ID string is needed.
 * Adding/removing a preset here automatically catches stale references via TypeScript.
 */

import { CONTAINERS } from "./packing";

export type ContainerId = "20gp" | "40gp" | "40hc";

export const VALID_CONTAINER_IDS: ContainerId[] = ["20gp", "40gp", "40hc"];

/** Throws at runtime (dev only) if an unknown ID is used anywhere. */
export function assertValidContainerId(id: string): asserts id is ContainerId {
  if (process.env.NODE_ENV !== "production" && !VALID_CONTAINER_IDS.includes(id as ContainerId)) {
    throw new Error(
      `[container-ids] Unknown container ID: "${id}". Valid IDs are: ${VALID_CONTAINER_IDS.join(", ")}`
    );
  }
}

/** Returns true if id is a currently supported container. */
export function isValidContainerId(id: string): id is ContainerId {
  return VALID_CONTAINER_IDS.includes(id as ContainerId);
}

/**
 * Compile-time exhaustiveness check.
 * If CONTAINERS array ever has an id not in ContainerId, TypeScript will error here.
 */
const _check: ContainerId[] = CONTAINERS.map((c) => {
  if (!isValidContainerId(c.id)) {
    console.warn(`[container-ids] Container "${c.id}" in CONTAINERS is not in ContainerId union — update container-ids.ts`);
  }
  return c.id as ContainerId;
});
void _check;

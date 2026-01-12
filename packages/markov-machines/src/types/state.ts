/**
 * Result of a state update operation.
 */
export interface StateUpdateResult<S> {
  success: boolean;
  state: S;
  error?: string;
}

/**
 * Deep merge two objects.
 * Arrays are replaced, not merged.
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  patch: Partial<T>
): T {
  const result = { ...target };

  for (const key in patch) {
    const patchValue = patch[key];
    const targetValue = target[key];

    if (
      typeof patchValue === "object" &&
      patchValue !== null &&
      !Array.isArray(patchValue) &&
      typeof targetValue === "object" &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      // Recursively merge nested objects
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        patchValue as Record<string, unknown>
      ) as T[Extract<keyof T, string>];
    } else {
      // Replace value (including arrays)
      result[key] = patchValue as T[Extract<keyof T, string>];
    }
  }

  return result;
}

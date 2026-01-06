/**
 * Helper type to extract values from a const object
 */
export type ValueOf<T> = T[keyof T];

/**
 * Creates a states/events object with automatic type inference.
 * Use this instead of enums for better TypeScript experience.
 *
 * @example
 * ```typescript
 * const State = defineStates('idle', 'loading', 'success', 'error');
 * type State = typeof State.type; // 'idle' | 'loading' | 'success' | 'error'
 *
 * // Usage:
 * State.idle    // 'idle'
 * State.loading // 'loading'
 * ```
 *
 * @param names - State or event names as string arguments
 * @returns Object with each name as both key and value, plus a virtual `type` property for type extraction
 */
export function defineStates<const T extends readonly string[]>(
  ...names: T
): { readonly [K in T[number]]: K } & { readonly type: T[number] } {
  const result = {} as { [K in T[number]]: K };

  for (const name of names) {
    (result as Record<string, string>)[name] = name;
  }

  // Virtual property for type extraction - throws if accessed at runtime
  Object.defineProperty(result, 'type', {
    enumerable: false,
    configurable: false,
    get() {
      throw new Error(
        'The "type" property is for TypeScript type extraction only. ' +
          'Use "typeof YourStates.type" to get the union type.',
      );
    },
  });

  return result as { readonly [K in T[number]]: K } & {
    readonly type: T[number];
  };
}

/**
 * Alias for defineStates - creates an events object with automatic type inference.
 *
 * @example
 * ```typescript
 * const Event = defineEvents('fetch', 'resolve', 'reject', 'retry');
 * type Event = typeof Event.type; // 'fetch' | 'resolve' | 'reject' | 'retry'
 *
 * // Usage:
 * Event.fetch   // 'fetch'
 * Event.resolve // 'resolve'
 * ```
 */
export const defineEvents = defineStates;

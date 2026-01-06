import { describe, expect, it } from 'vitest';
import { defineEvents, defineStates } from '..';

describe('defineStates', () => {
  it('should create an object with state names as keys and values', () => {
    const State = defineStates('idle', 'loading', 'success', 'error');

    expect(State.idle).toBe('idle');
    expect(State.loading).toBe('loading');
    expect(State.success).toBe('success');
    expect(State.error).toBe('error');
  });

  it('should work with single state', () => {
    const State = defineStates('active');

    expect(State.active).toBe('active');
  });

  it('should have non-enumerable type property', () => {
    const State = defineStates('a', 'b');

    expect(Object.keys(State)).toEqual(['a', 'b']);
    expect('type' in State).toBe(true);
  });

  it('should throw when accessing type property at runtime', () => {
    const State = defineStates('idle', 'loading');

    expect(() => State.type).toThrow(
      'The "type" property is for TypeScript type extraction only',
    );
  });

  it('should work with camelCase names', () => {
    const State = defineStates('productSelected', 'outOfStock');

    expect(State.productSelected).toBe('productSelected');
    expect(State.outOfStock).toBe('outOfStock');
  });
});

describe('defineEvents', () => {
  it('should be an alias for defineStates', () => {
    const Event = defineEvents('fetch', 'resolve', 'reject');

    expect(Event.fetch).toBe('fetch');
    expect(Event.resolve).toBe('resolve');
    expect(Event.reject).toBe('reject');
  });

  it('should throw when accessing type property at runtime', () => {
    const Event = defineEvents('click', 'submit');

    expect(() => Event.type).toThrow(
      'The "type" property is for TypeScript type extraction only',
    );
  });
});

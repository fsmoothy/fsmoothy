import type {
  AllowedNames,
  Callback,
  FsmContext,
  Guard,
  Transition,
} from './types';

export interface TransitionOptions<Context extends FsmContext<unknown>> {
  onExit?: Callback<Context>;
  onEnter?: Callback<Context>;
  onLeave?: Callback<Context>;
  guard?: Guard<Context>;
}

/**
 * Creates a new transition.
 *
 * @param from - From state.
 * @param event - Event name.
 * @param to - To state.
 * @param guard - Guard function.
 *
 * @overload
 * @param from - From state.
 * @param event - Event name.
 * @param to - To state.
 * @param options - Transition options.
 */
export const t = <
  const State extends AllowedNames,
  const Event extends AllowedNames,
  Context extends FsmContext<unknown> = FsmContext<unknown>,
>(
  from: ReadonlyArray<State> | State,
  event: Event,
  to: State,
  guardOrOptions: Guard<Context> | TransitionOptions<Context> = {},
): Transition<State, Event, Context> => {
  if (typeof guardOrOptions === 'function') {
    return {
      from,
      event,
      to,
      guard: guardOrOptions,
    };
  }
  const { onExit, onEnter, onLeave, guard, ...rest } = guardOrOptions;

  return {
    ...rest,
    from,
    event,
    to,
    onLeave,
    onExit,
    onEnter,
    guard,
  };
};

import { AllowedNames, Callback, Guard, Transition, FsmContext } from './types';

export interface TransitionOptions<Context extends FsmContext<unknown>> {
  onExit?: Callback<Context>;
  onEnter?: Callback<Context>;
  onLeave?: Callback<Context>;
  guard?: Guard<Context>;
}

function _noop() {
  return;
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
  guardOrOptions?: Guard<Context> | TransitionOptions<Context>,
): Transition<State, Event, Context> => {
  if (typeof guardOrOptions === 'function') {
    return {
      from: from as Array<State> | State,
      event,
      to,
      onLeave: _noop,
      onExit: _noop,
      onEnter: _noop,
      guard: guardOrOptions,
    };
  }

  const {
    onExit = _noop,
    onEnter = _noop,
    onLeave = _noop,
    guard = () => true,
    ...rest
  } = guardOrOptions ?? {};

  return {
    ...rest,
    from: from as Array<State> | State,
    event,
    to,
    onLeave,
    onExit,
    onEnter,
    guard,
  };
};

import { AllowedNames, Callback, Guard, Transition } from './types';

interface TransitionOptions<Context extends object> {
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

export function t<
  const State extends AllowedNames,
  const Event extends AllowedNames,
  Context extends object,
>(
  from: Array<State> | State,
  event: Event,
  to: State,
  options: TransitionOptions<Context>,
): Transition<State, Event, Context>;
export function t<
  State extends AllowedNames,
  Event extends AllowedNames,
  Context extends object,
>(
  from: Array<State> | State,
  event: Event,
  to: State,
  guard?: Guard<Context>,
): Transition<State, Event, Context>;
export function t<
  State extends AllowedNames,
  Event extends AllowedNames,
  Context extends object,
>(
  from: Array<State> | State,
  event: Event,
  to: State,
  guardOrOptions?: Guard<Context> | TransitionOptions<Context>,
): Transition<State, Event, Context> {
  if (typeof guardOrOptions === 'function') {
    return {
      from,
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
    from,
    event,
    to,
    onLeave,
    onExit,
    onEnter,
    guard,
  };
}

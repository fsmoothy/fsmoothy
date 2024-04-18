import { All } from './symbols';
import {
  AllowedNames,
  FsmContext,
  IInternalTransition,
  StateMachineParameters,
  Transition,
  Subscribers,
  Callback,
  Nested,
} from './types';

const IdentityEvent = Symbol('IdentityEvent') as any;

export function capitalize(parameter: string) {
  return parameter.charAt(0).toUpperCase() + parameter.slice(1);
}

export function _true() {
  return true;
}

const SpecialSymbols = new Set([All, IdentityEvent]);

export function identityTransition<
  State extends AllowedNames,
  Event extends AllowedNames,
  Context extends FsmContext<object> = FsmContext<never>,
>(state: State) {
  const transition = {
    from: state,
    event: IdentityEvent,
    to: state,
  };
  return {
    ...transition,
    _original: transition,
  } as IInternalTransition<State, Event, Context>;
}

export function addIsChecker(this: any, state: AllowedNames) {
  if (typeof state !== 'string') {
    return;
  }

  const capitalized = capitalize(state);

  this[`is${capitalized}`] = () => this.is(state);
}

export function prepareStates<State extends AllowedNames>(
  this: any,
  parameters: StateMachineParameters<any, any, any>,
) {
  const states = new Map<State, Nested | null>();
  const statesFromParameters = parameters.states?.(parameters) ?? {};

  for (const { from, to } of parameters.transitions ?? []) {
    if (Array.isArray(from)) {
      for (const state of from) {
        states.set(state, null);
      }
    } else {
      states.set(from, null);
    }
    states.set(to, null);
  }

  for (const [state, nested] of Object.entries(statesFromParameters)) {
    if (!nested) {
      continue;
    }

    (nested as any)._parent = this;
    states.set(state as State, nested);
  }

  return states;
}

export function prepareTransitions(
  this: any,
  transitions?: Array<Transition<AllowedNames, AllowedNames, any>>,
) {
  if (!transitions) {
    return new Map();
  }

  return transitions.reduce((accumulator, transition) => {
    const { from, event } = transition;
    const froms = Array.isArray(from) ? from : [from];

    if (!accumulator.has(event)) {
      accumulator.set(event, new Map());
    }

    const transitionsByState = accumulator.get(event);

    for (const from of froms) {
      if (!transitionsByState?.has(from)) {
        transitionsByState?.set(from, []);
      }

      transitionsByState?.get(from)?.push(this.bindToCallbacks(transition));
    }

    return accumulator;
  }, new Map());
}

export function prepareSubscribers<
  Event extends AllowedNames,
  Context extends FsmContext<object>,
>(this: any, subscribers?: Subscribers<Event, Context>) {
  const subscribersMap = new Map<
    Event,
    Map<Callback<Context>, Callback<Context>>
  >();

  if (!subscribers) {
    return subscribersMap;
  }

  if (All in subscribers) {
    for (const callback of subscribers[All as keyof typeof subscribers]!) {
      subscribersMap.set(All, new Map());
      subscribersMap.get(All)?.set(callback, callback.bind(this));
    }
  }

  for (const [event, callbacks] of Object.entries(subscribers)) {
    if (!subscribersMap.has(event as Event)) {
      subscribersMap.set(event as Event, new Map());
    }

    for (const callback of callbacks as Array<Callback<Context>>) {
      subscribersMap.get(event as Event)?.set(callback, callback.bind(this));
    }
  }

  return subscribersMap;
}

export function populateEventMethods(
  this: any,
  parameters: StateMachineParameters<any, any, any>,
) {
  const nestedEvents = this.nested.flatMap((nested: Nested) => {
    if (nested.type === 'parallel') {
      return nested.machines.flatMap((m) => m.events);
    }

    return nested.events;
  });

  const events = new Set([
    ...(parameters.transitions?.map((t) => t.event) ?? []),
    ...nestedEvents,
  ]);

  for (const event of events) {
    if (SpecialSymbols.has(event)) {
      continue;
    }

    addEventMethods.call(this, event);
  }
}

export function populateCheckers(
  this: any,
  parameters: StateMachineParameters<any, any, any>,
) {
  const nestedStates = this.nested.flatMap((nested: Nested) => {
    if (nested.type === 'parallel') {
      return nested.machines.flatMap((m) => m.states);
    }

    return nested.states;
  });

  const states = new Set([
    ...(parameters.transitions?.map((t) => t.from) ?? []),
    ...(parameters.transitions?.map((t) => t.to) ?? []),
    ...nestedStates,
  ]);

  for (const state of states) {
    if (SpecialSymbols.has(state)) {
      continue;
    }

    addIsChecker.call(this, state);
  }
}

export function addEventMethods<Event extends AllowedNames>(
  this: any,
  event: Event,
) {
  if (typeof event !== 'string') {
    // this could happen if the `event` is `All` or `IdentityEvent`
    return;
  }

  const capitalizedEvent = capitalize(event);

  this[event] = async (...arguments_: Array<unknown>) => {
    await this.transition(event, ...arguments_);
  };

  this[`can${capitalizedEvent}`] = (...arguments_: Array<unknown>) =>
    this.can(event, ...arguments_);
}

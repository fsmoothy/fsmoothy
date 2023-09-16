import { StateMachineError } from './fsm.error';
import { NestedState as _NestedState } from './nested';
import { All } from './symbols';
import { AllowedNames, Callback, ITransition, Subscribers } from './types';

type States<
  State extends AllowedNames | Array<AllowedNames>,
  NestedState extends _NestedState<any> = _NestedState<any>,
> = {
  [key in State extends Array<AllowedNames> ? never : State]?: NestedState;
};

export interface IStateMachineParameters<
  State extends AllowedNames | Array<AllowedNames>,
  Event extends AllowedNames,
  Context extends object = object,
  Transition extends ITransition<State, Event, Context> = ITransition<
    State,
    Event,
    Context
  >,
  Transitions extends [Transition, ...Array<Transition>] = [
    Transition,
    ...Array<Transition>,
  ],
  NestedState extends _NestedState<any> = _NestedState<any>,
> {
  ctx?: (
    parameters: IStateMachineParameters<
      State,
      Event,
      Context,
      Transition,
      Transitions
    >,
  ) => Context;
  initial: State;
  transitions: Transitions;
  id?: string;
  subscribers?: Subscribers<Event, Context>;
  states?:
    | States<State, NestedState>
    | ((
        parameters: IStateMachineParameters<
          State,
          Event,
          Context,
          Transition,
          Transitions
        >,
      ) => States<State, NestedState>);
}

type StateMachineEvents<Event extends AllowedNames> = {
  /**
   * @param arguments_ - Arguments to pass to lifecycle hooks.
   */
  [key in Event]: <T extends Array<unknown>>(...arguments_: T) => Promise<void>;
};

type CapitalizeString<S> = S extends symbol
  ? never
  : S extends string
  ? Capitalize<S>
  : S;

type StateMachineTransitionCheckers<Event extends AllowedNames> = {
  /**
   * @param arguments_ - Arguments to pass to guard.
   */
  [key in `can${CapitalizeString<Event>}`]: () => Promise<boolean>;
};

type StateMachineCheckers<State extends AllowedNames> = {
  [key in `is${CapitalizeString<State>}`]: () => boolean;
};

export type IStateMachine<
  State extends AllowedNames,
  Event extends AllowedNames,
  Context extends object,
> = _StateMachine<State, Event, Context> &
  StateMachineEvents<Event> &
  StateMachineCheckers<State> &
  StateMachineTransitionCheckers<Event>;

export type StateMachineConstructor = {
  new <
    State extends AllowedNames,
    Event extends AllowedNames,
    Context extends object,
  >(
    parameters: IStateMachineParameters<State, Event, Context>,
  ): IStateMachine<State, Event, Context>;
};

const IdentityEvent = Symbol('IdentityEvent') as any;

function capitalize(parameter: unknown) {
  if (typeof parameter !== 'string') {
    return parameter;
  }

  return parameter.charAt(0).toUpperCase() + parameter.slice(1);
}

const SpecialSymbols = new Set([All, IdentityEvent]);

function identityTransition<
  State extends AllowedNames,
  Event extends AllowedNames,
  Context extends object,
>(state: State): ITransition<State, Event, Context> {
  return {
    from: state,
    event: IdentityEvent,
    to: state,
  } as ITransition<State, Event, Context>;
}

export class _StateMachine<
  const State extends AllowedNames,
  const Event extends AllowedNames,
  Context extends object,
> {
  private _last: ITransition<State, Event, Context>;
  private _id: string;
  private _ctx: Context;

  /**
   * For nested state machines.
   */
  private _activeChild: _NestedState<
    _StateMachine<AllowedNames, AllowedNames, object>
  > | null = null;
  private _states: States<State>;

  /**
   * Map of allowed events by from-state.
   */
  private _allowedNames: Map<State, Set<Event>>;
  /**
   * Map of transitions by event and from-state.
   */
  private _transitions: Map<
    Event,
    Map<State, ITransition<State, Event, Context>>
  >;

  private _subscribers = new Map<
    Event,
    /**
     * Map of original callbacks by bound callbacks.
     */
    Map<Callback<Context>, Callback<Context>>
  >();

  private _initialParameters: IStateMachineParameters<State, Event, Context>;

  constructor(parameters: IStateMachineParameters<State, Event, Context>) {
    this._initialParameters = parameters;
    this._id = parameters.id ?? 'fsm';
    this._last = identityTransition(parameters.initial);

    if (typeof parameters.states === 'function') {
      this._states = parameters.states(parameters);
    } else {
      this._states = parameters.states ?? {};
    }

    this._ctx = parameters.ctx?.(parameters) ?? ({} as Context);

    this._allowedNames = this.prepareEvents(parameters.transitions);
    this._transitions = this.prepareTransitions(parameters.transitions);
    this._subscribers = this.prepareSubscribers(parameters.subscribers);

    this.populateEventMethods(parameters);
    this.populateCheckers(parameters);
  }

  /**
   * Current state.
   */
  get current(): State {
    return this._last.to;
  }

  /**
   * Context object.
   */
  get context(): Context {
    return this._ctx;
  }

  /**
   * Child state machine.
   */
  get child(): IStateMachine<State, Event, Context> {
    return (this._activeChild?.machine ?? this) as unknown as IStateMachine<
      State,
      Event,
      Context
    >;
  }

  /**
   * All events in the state machine.
   */
  get events(): Array<Event> {
    return [...this._transitions.keys()];
  }

  /**
   * All states in the state machine.
   */
  get states(): Array<State> {
    return [...this._allowedNames.keys()];
  }

  /**
   * Add transition to the state machine.
   * @param transition - Transition to add.
   * @returns New state machine.
   */
  public addTransition<
    NewState extends AllowedNames,
    NewEvent extends AllowedNames,
  >(transition: ITransition<NewState, NewEvent, Context>) {
    const { from, event, to } = transition as any;

    const states = Array.isArray(from) ? [...from, to] : [from, to];

    this.addEventMethods(event);
    this.addEvent(transition as any);

    if (!this._transitions.has(event)) {
      this._transitions.set(event, new Map());
    }

    for (const state of states) {
      this.addIsChecker(state);

      this._transitions
        .get(event)
        ?.set(state, this.bindToCallbacks(transition as any));
    }

    return this as unknown as IStateMachine<
      State | NewState,
      Event | NewEvent,
      Context
    >;
  }

  /**
   * Add nested state machine.
   *
   * @param state - State to add.
   * @param nestedState - Nested state machine.
   */
  public addNestedMachine(state: State, nestedState: _NestedState<any>) {
    this._states[state as keyof typeof this._states] = nestedState;

    const nestedEvents = nestedState.machine.events;

    for (const event of nestedEvents) {
      this.addEventMethods(event);
    }

    const NestedStates = nestedState.machine.states;

    for (const nestedState of Object.keys(NestedStates)) {
      this.addIsChecker(nestedState as State);
    }

    return this;
  }

  /**
   * Checks if the state machine is in the given state.
   * @param state - State to check.
   */
  public is(state: State): boolean {
    if (this._activeChild?.machine?.is(state)) {
      return true;
    }

    return this.current === state;
  }

  /**
   * Checks if the event can be triggered in the current state.
   * @param event - Event to check.
   */
  public async can<Arguments extends Array<unknown> = Array<unknown>>(
    event: Event,
    ...arguments_: Arguments
  ) {
    const allowedNames = this._allowedNames.get(this.current);
    const transitions = this._transitions.get(event);

    // check has from: all
    if (transitions?.has(All)) {
      const { guard } = transitions.get(All) ?? {};

      return await (guard?.(this._ctx, ...arguments_) ?? true);
    }

    if (!allowedNames?.has(event)) {
      return false;
    }

    if (!transitions?.has(this.current)) {
      return false;
    }

    const { guard } = transitions.get(this.current) ?? {};

    return await (guard?.(this._ctx, ...arguments_) ?? true);
  }

  /**
   * Subscribe to event. Will execute after transition.
   *
   * @param event - Event to subscribe to.
   * @param callback - Callback to execute.
   *
   * @overload
   * Subscribe to all events.
   * @param callback - Callback to execute.
   */
  public on(event: Event, callback: Callback<Context>): this;
  public on(callback: Callback<Context>): this;
  public on(
    eventOrCallback: Event | Callback<Context>,
    callback?: Callback<Context>,
  ) {
    if (typeof eventOrCallback === 'function') {
      return this.on(All, eventOrCallback);
    }

    const event = eventOrCallback;

    if (!this._subscribers.has(event)) {
      this._subscribers.set(event, new Map());
    }

    const callbacks = this._subscribers.get(event);
    callbacks?.set(callback!, callback!.bind(this));

    return this;
  }

  /**
   * Unsubscribe from event.
   * @param event - Event to unsubscribe from.
   * @param callback - Callback to unsubscribe.
   *
   * @overload
   * Unsubscribe from `All` event.
   * @param callback - Callback to unsubscribe.
   */
  public off(event: Event, callback: Callback<Context>): this;
  public off(callback: Callback<Context>): this;
  public off(
    eventOrCallback: Event | Callback<Context>,
    callback?: Callback<Context>,
  ) {
    if (typeof eventOrCallback === 'function') {
      return this.off(All, eventOrCallback);
    }

    const event = eventOrCallback;
    if (!this._subscribers.has(event)) {
      console.warn(`Event ${String(event)} is not subscribed in ${this._id}`);
      return;
    }

    const callbacks = this._subscribers.get(event);
    callbacks?.delete(callback!);

    return this;
  }

  /**
   * Transitions the state machine to the next state.
   *
   * @param event - Event to trigger.
   * @param arguments_ - Arguments to pass to lifecycle hooks.
   */
  public async transition<Arguments extends Array<unknown> = Array<unknown>>(
    event: Event,
    ...arguments_: Arguments
  ): Promise<this> {
    // check nested state machine
    if (await this._activeChild?.machine?.can(event, ...arguments_)) {
      await this._activeChild?.machine?.transition(event, ...arguments_);
      return this;
    }
    // propagate to parent

    if (!(await this.can(event, ...arguments_))) {
      throw new StateMachineError(
        `Event ${String(event)} is not allowed in state ${String(
          this.current,
        )} of ${this._id}`,
      );
    }

    const transitions = this._transitions.get(event);

    const transition =
      // we already checked if the event is allowed
      // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
      transitions?.get(this.current) ?? transitions?.get(All)!;

    await this.executeTransition(transition, ...arguments_);

    return this;
  }

  public async identity<Arguments extends Array<unknown> = Array<unknown>>(
    ...arguments_: Arguments
  ) {
    return await this.transition(IdentityEvent as Event, ...arguments_);
  }

  private prepareSubscribers(subscribers?: Subscribers<Event, Context>) {
    const _subscribers = new Map<
      Event,
      Map<Callback<Context>, Callback<Context>>
    >();

    if (!subscribers) {
      return _subscribers;
    }

    if (All in subscribers) {
      for (const callback of subscribers[
        All as keyof typeof subscribers
      ] as Array<Callback<Context>>) {
        _subscribers.set(All, new Map());
        _subscribers.get(All)?.set(callback, callback.bind(this));
      }
    }

    for (const [event, callbacks] of Object.entries(subscribers)) {
      if (!_subscribers.has(event as Event)) {
        _subscribers.set(event as Event, new Map());
      }

      for (const callback of callbacks as Array<Callback<Context>>) {
        _subscribers.get(event as Event)?.set(callback, callback.bind(this));
      }
    }

    return _subscribers;
  }

  private addEvent(transition: ITransition<State, Event, Context>) {
    const { from, event, to } = transition;
    const froms = Array.isArray(from) ? from : [from];

    for (const from of [...froms, to]) {
      if (!this._allowedNames.has(from)) {
        this._allowedNames.set(from, new Set<Event>([IdentityEvent as Event]));
      }

      this._allowedNames.get(from)?.add(event);
    }
  }

  private prepareEvents(
    transitions: Array<ITransition<State, Event, Context>>,
  ) {
    return transitions.reduce((accumulator, transition) => {
      const { from, event, to } = transition;
      const froms = Array.isArray(from) ? from : [from];

      for (const from of [...froms, to]) {
        if (!accumulator.has(from)) {
          accumulator.set(from, new Set<Event>([IdentityEvent as Event]));
        }

        accumulator.get(from)?.add(event);
      }

      return accumulator;
    }, new Map<State, Set<Event>>());
  }

  private prepareTransitions(
    transitions: Array<ITransition<State, Event, Context>>,
  ) {
    const _transitionMap = transitions.reduce((accumulator, transition) => {
      const { from, event } = transition;
      const froms = Array.isArray(from) ? from : [from];

      if (!accumulator.has(event)) {
        accumulator.set(
          event,
          new Map<State, ITransition<State, Event, Context>>(),
        );
      }

      for (const from of froms) {
        accumulator.get(event)?.set(from, this.bindToCallbacks(transition));
      }

      return accumulator;
    }, new Map<Event, Map<State, ITransition<State, Event, Context>>>());

    _transitionMap.set(
      IdentityEvent as Event,
      new Map<State, ITransition<State, Event, Context>>(),
    );

    for (const { from } of transitions) {
      const froms = Array.isArray(from) ? from : [from];

      for (const from of froms) {
        _transitionMap
          .get(IdentityEvent as Event)
          ?.set(from, identityTransition(from));
      }
    }

    return _transitionMap;
  }

  /**
   * Adds event methods to the state machine instance.
   */
  private addEventMethods(event: Event) {
    if (typeof event !== 'string') {
      return;
    }

    const capitalizedEvent = capitalize(event);

    // @ts-expect-error We need to assign the method to the instance.
    this[event] = async (...arguments_: [unknown, ...Array<unknown>]) => {
      await this.transition(event, ...arguments_);
    };

    // @ts-expect-error We need to assign the method to the instance.
    this[`can${capitalizedEvent}`] = (...arguments_) =>
      this.can(event, ...arguments_);
  }

  private populateEventMethods(
    parameters: IStateMachineParameters<State, Event, Context>,
  ) {
    const nestedEvents = Object.values(this._states ?? {}).flatMap(
      (nested: any) => {
        return nested.machine.events;
      },
    );
    const events = [
      ...parameters.transitions.map((t) => t.event),
      ...nestedEvents,
    ];

    for (const event of events) {
      if (SpecialSymbols.has(event)) {
        continue;
      }

      this.addEventMethods(event);
    }
  }

  private addIsChecker(state: State) {
    if (typeof state !== 'string') {
      return;
    }

    const capitalized = capitalize(state);

    // @ts-expect-error We need to assign the method to the instance.
    this[`is${capitalized}`] = () => this.is(state);
  }

  private populateCheckers(
    parameters: IStateMachineParameters<State, Event, Context>,
  ) {
    const nestedStates = Object.values(this._states ?? {}).flatMap(
      (nested: any) => {
        return nested.machine.states;
      },
    );

    const states = [
      ...parameters.transitions.map((t) => t.from),
      ...parameters.transitions.map((t) => t.to),
      ...nestedStates,
    ];

    for (const state of states) {
      if (SpecialSymbols.has(state)) {
        continue;
      }

      this.addIsChecker(state);
    }
  }

  /**
   * This method binds the callbacks of the transition to the state machine instance.
   * It useful in case if we need to access the state machine instance from the callbacks.
   */
  private bindToCallbacks(transition: ITransition<State, Event, Context>) {
    return {
      ...transition,
      onLeave: transition.onLeave?.bind(this),
      onEnter: transition.onEnter?.bind(this),
      onExit: transition.onExit?.bind(this),
      guard: transition.guard?.bind(this),
    };
  }

  private makeTransition(transition: ITransition<State, Event, Context>) {
    this._last = transition ?? this._last;

    if (!this._states) {
      return;
    }

    if (!(transition.to in this._states)) {
      this._activeChild = null;
      return;
    }

    const child = this._states[transition.to] as _NestedState<
      _StateMachine<AllowedNames, AllowedNames, object>
    >;

    switch (child.history) {
      case 'none': {
        this._activeChild = {
          ...child,
          machine: new _StateMachine(child.machine._initialParameters),
        };

        break;
      }
      case 'deep': {
        this._activeChild = child;
      }
    }
  }

  private async executeTransition<
    Arguments extends Array<unknown> = Array<unknown>,
  >(transition: ITransition<State, Event, Context>, ...arguments_: Arguments) {
    const { from, to, onEnter, onExit, event } = transition ?? {};

    const subscribers = this._subscribers.get(event);
    const allSubscribers = this._subscribers.get(All);

    try {
      await this._last.onLeave?.(this._ctx, ...arguments_);
      await onEnter?.(this._ctx, ...arguments_);
      await this.makeTransition(transition);

      for (const subscriber of subscribers?.values() ?? []) {
        await subscriber(this._ctx, ...arguments_);
      }

      for (const subscriber of allSubscribers?.values() ?? []) {
        await subscriber(this._ctx, ...arguments_);
      }

      await onExit?.(this._ctx, ...arguments_);
    } catch (error) {
      if (error instanceof StateMachineError) {
        throw error;
      }

      if (!(error instanceof Error)) {
        throw new StateMachineError(
          `Exception caught in ${this._id} on transition from ${String(
            from,
          )} to ${String(to)}: ${error}`,
          transition,
        );
      }

      throw new StateMachineError(
        `Exception caught in ${this._id} on transition from ${String(
          from,
        )} to ${String(to)}: ${error.message}`,
        transition,
      );
    }
  }
}

/**
 * Creates a new state machine.
 *
 * @param parameters - State machine parameters.
 * @param parameters.id - State machine id. Used in error messages.
 * @param parameters.initial - Initial state.
 * @param parameters.ctx - Context object.
 * @param parameters.transitions - Transitions.
 * @param parameters.transitions[].from - From state.
 * @param parameters.transitions[].from[] - From states.
 * @param parameters.transitions[].event - Event name.
 * @param parameters.transitions[].to - To state.
 * @param parameters.transitions[].onEnter - Callback to execute on enter.
 * @param parameters.transitions[].onExit - Callback to execute on exit.
 * @param parameters.transitions[].onLeave - Callback to execute on transition to the next state.
 * @param parameters.transitions[].guard - Guard function.
 *
 * @example
 * const stateMachine = new StateMachine({
 *   id: '1',
 *   initial: State.idle,
 *   transitions: [
 *    t(State.idle, Event.fetch, State.pending),
 *    t(State.pending, Event.resolve, State.idle),
 *   ],
 * });
 *
 * @returns New state machine.
 */
export const StateMachine = function <
  const State extends AllowedNames,
  const Event extends AllowedNames,
  Context extends object,
>(
  this: _StateMachine<State, Event, Context>,
  parameters: IStateMachineParameters<State, Event, Context>,
) {
  return new _StateMachine(parameters);
} as unknown as StateMachineConstructor;

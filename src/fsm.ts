import { StateMachineError } from './fsm.error';
import { INestedStateMachineParameters } from './nested';
import { All } from './symbols';
import { TransitionOptions, t } from './transition';
import {
  AllowedNames,
  Callback,
  Transition,
  Subscribers,
  FsmContext,
  Guard,
  IStateMachine,
  ParallelState,
  HistoryTypes,
  INestedStateMachine,
} from './types';

type Nested = _NestedStateMachine<any, any, any> | ParallelState<any, any, any>;

type States<State extends AllowedNames> = Map<State, Nested | null>;

type Injectable<
  State extends AllowedNames | Array<AllowedNames>,
  Event extends AllowedNames,
  Context extends FsmContext<object> = FsmContext<object>,
> = {
  [Key in keyof Omit<Context, 'data'>]?: (
    fsm: IStateMachine<
      State extends AllowedNames ? State : never,
      Event,
      Context
    >,
  ) => Context[Key] | Promise<Context[Key]>;
};

export interface StateMachineParameters<
  State extends AllowedNames | Array<AllowedNames>,
  Event extends AllowedNames,
  Context extends FsmContext<object> = FsmContext<object>,
> {
  readonly data?: (
    parameters: StateMachineParameters<State, Event, Context>,
  ) => Context['data'] | Promise<Context['data']>;
  readonly initial: State;
  readonly transitions?: [
    Transition<State, Event, Context>,
    ...Array<Transition<State, Event, Context>>,
  ];
  readonly id?: string;
  readonly subscribers?: Subscribers<Event, Context>;
  readonly states?: (
    parameters: StateMachineParameters<State, Event, Context>,
  ) => {
    [key in State extends Array<AllowedNames> ? never : State]?: Nested;
  };
  readonly inject?: Injectable<State, Event, Context>;
}

export type StateMachineConstructor = {
  new <
    State extends AllowedNames,
    Event extends AllowedNames,
    Context extends FsmContext<object> = FsmContext<never>,
  >(
    parameters: StateMachineParameters<State, Event, Context>,
  ): IStateMachine<State, Event, Context>;
};

interface IInternalTransition<
  State extends AllowedNames,
  Event extends AllowedNames,
  Context extends FsmContext<object> = FsmContext<never>,
> extends Transition<State, Event, Context> {
  _original: Transition<State, Event, Context>;
}

const IdentityEvent = Symbol('IdentityEvent') as any;

function capitalize(parameter: string) {
  return parameter.charAt(0).toUpperCase() + parameter.slice(1);
}

function _true() {
  return true;
}

const SpecialSymbols = new Set([All, IdentityEvent]);

function identityTransition<
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

type TransitionsStorage<
  State extends AllowedNames,
  Event extends AllowedNames,
  Context extends FsmContext<object> = FsmContext<never>,
> = Map<Event, Map<State, Array<IInternalTransition<State, Event, Context>>>>;

export class _StateMachine<
  const State extends AllowedNames,
  const Event extends AllowedNames,
  Context extends FsmContext<object>,
> {
  protected _context = {} as Context;

  private _last: Transition<State, Event, Context>;
  private _id: string;
  private _contextPromise: Promise<Context> | null = null;
  private _boundTo: any = this;
  private _dataPromise: Promise<Context['data']> | null = null;

  /**
   * For nested state machines.
   */
  private _activeChild: INestedStateMachine<any, any, any> | null = null;
  private _activeParallelState: ParallelState<any, any, any> | null = null;
  private _states: States<State>;

  /**
   * Map of transitions by event and from-state.
   */
  private _transitions: TransitionsStorage<State, Event, Context>;

  private _subscribers = new Map<
    Event,
    /**
     * Map of original callbacks by bound callbacks.
     */
    Map<Callback<Context>, Callback<Context>>
  >();

  /**
   * We're saving initial parameters mostly for nested states when history = none
   */
  private _initialParameters: StateMachineParameters<State, Event, Context>;

  constructor(parameters: StateMachineParameters<State, Event, Context>) {
    this._initialParameters = parameters;
    this._id = parameters.id ?? 'fsm';
    this._last = identityTransition(parameters.initial);

    this._states = this.prepareStates(parameters);

    this._transitions = this.prepareTransitions(parameters.transitions);
    this._subscribers = this.prepareSubscribers(parameters.subscribers);

    this.populateEventMethods(parameters);
    this.populateCheckers(parameters);
    this.populateContext(parameters);
  }

  /**
   * Current state.
   */
  public get current(): State {
    return this._last.to;
  }

  /**
   * Data object.
   */
  public get data(): Context['data'] {
    return this._context.data;
  }

  public get context(): Context {
    return this._context;
  }

  /**
   * Active child state machine.
   */
  public get child() {
    return this._activeChild;
  }

  /**
   * All events in the state machine.
   */
  public get events(): Array<Event> {
    return [...this._transitions.keys()];
  }

  /**
   * All states in the state machine.
   */
  public get states(): Array<State> {
    return [...this._states.keys()];
  }

  /**
   * Add transition to the state machine.
   * @param transition - Transition to add.
   * @returns New state machine.
   */
  public addTransition<
    const NewState extends AllowedNames,
    const NewEvent extends AllowedNames,
  >(
    from: Array<State> | State,
    event: Event,
    to: State,
    guardOrOptions?: Guard<Context> | TransitionOptions<Context>,
  ) {
    const transition = t(from, event, to, guardOrOptions);
    const states = Array.isArray(from) ? [...from, to] : [from, to];

    this.addEventMethods(event);

    if (!this._transitions.has(event)) {
      this._transitions.set(event, new Map());
    }

    for (const state of states) {
      this.addIsChecker(state);

      const transitionsByState = this._transitions.get(event);

      if (!transitionsByState?.has(state)) {
        transitionsByState?.set(state, []);
      }
      transitionsByState?.get(state)?.push(this.bindToCallbacks(transition));
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
  public addNestedMachine(state: State, nestedState: Nested) {
    this._states.set(state, nestedState);

    if (nestedState.type === 'parallel') {
      return this;
    }

    (nestedState as any)._parent = this;

    const nestedEvents = nestedState.events;

    for (const event of nestedEvents) {
      this.addEventMethods(event);
    }

    const nestedStates = nestedState.states;

    for (const nestedState of nestedStates) {
      this.addIsChecker(nestedState as State);
    }

    return this;
  }

  /**
   * Removes all nested state machines by state.
   */
  public removeState(state: State) {
    if (this.current === state) {
      this._activeChild = null;
      this._activeParallelState = null;
    }

    this._states.delete(state);

    return this;
  }

  /**
   * Checks if the state machine is in the given state.
   * @param state - State to check.
   */
  public is(state: State): boolean {
    if (this._activeChild?.is(state)) {
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
    if (await this._activeChild?.can(event, ...arguments_)) {
      return true;
    }

    const transitionsByState = this._transitions.get(event);

    // check has from: all
    if (transitionsByState?.has(All)) {
      for (const transition of transitionsByState.get(All) ?? []) {
        const { guard = _true } = transition;

        const result = await (guard?.(this._context, ...arguments_) ?? true);

        if (result) {
          return true;
        }
      }
    }

    if (!transitionsByState?.has(this.current)) {
      return false;
    }

    const transitions = transitionsByState.get(this.current) ?? [];

    for (const transition of transitions) {
      const { guard = _true } = transition;

      const result = await (guard?.(this._context, ...arguments_) ?? true);

      if (result) {
        return true;
      }
    }

    return false;
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
    if (callback) {
      callbacks?.set(callback, callback.bind(this._boundTo));
    }

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
    if (await this.makeNestedTransition(event, ...arguments_)) {
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

    const transition = (await this.getAllowedTransition(event, ...arguments_))!;

    if (this._contextPromise) {
      for (const [key, value] of Object.entries(await this._contextPromise)) {
        this._context[key as keyof Context] = value as Context[keyof Context];
      }
      this._contextPromise = null;
    }

    if (this._dataPromise) {
      this._context.data = await this._dataPromise;
      this._dataPromise = null;
    }

    await this.executeTransition(transition, ...arguments_);

    return this;
  }

  /**
   * Will remove all transitions with the given from, to and event.
   */
  public removeTransition(from: State, event: Event, to: State) {
    const transitions = this._transitions.get(event)?.get(from);

    if (!transitions) {
      return this;
    }

    const newTransitions = transitions.filter((t) => t.to !== to);
    this._transitions.get(event)?.set(from, newTransitions);

    return this;
  }

  /**
   * Binds external context to the state machine callbacks.
   *
   * @param this - Context to bind.
   * @returns state machine instance.
   */
  public bind<T>(_this: T) {
    for (const callbacks of this._subscribers.values()) {
      for (const callback of callbacks.keys()) {
        callbacks.set(callback, callback.bind(_this));
      }
    }

    for (const transitionsByState of this._transitions.values()) {
      for (const transition of transitionsByState.values()) {
        for (const t of transition) {
          t.onEnter = t._original.onEnter?.bind(_this);
          t.onExit = t._original.onExit?.bind(_this);
          t.onLeave = t._original.onLeave?.bind(_this);
          t.guard = t._original.guard?.bind(_this);
        }
      }
    }

    this._boundTo = _this;

    return this;
  }

  /**
   * Injects service into the state machine context.
   */
  public inject<const Key extends keyof Omit<Context, 'data'>>(
    key: Key,
    service: Context[Key],
  ) {
    this._context[key] = service;

    return this;
  }

  /**
   * Injects service into the state machine context using factory function.
   */
  public injectAsync<const Key extends keyof Omit<Context, 'data'>>(
    key: Key,
    service: (fsm: this) => Promise<Context[Key]> | Context[Key],
  ) {
    const contextValue = service(this);

    if (contextValue instanceof Promise) {
      this._contextPromise ??= Promise.resolve({} as Context);
      this._contextPromise.then((context) => {
        return contextValue.then((value) => {
          context[key as keyof Context] = value;
          return context;
        });
      });
    } else {
      this._context[key as keyof Context] = contextValue;
    }

    return this;
  }

  private async makeNestedTransition(
    event: Event,
    ...arguments_: Array<unknown>
  ) {
    let hasExecuted = false;

    if (!this._activeChild && !this._activeParallelState) {
      return hasExecuted;
    }

    const children = this._activeParallelState?.machines ?? [this._activeChild];

    for (const child of children) {
      if (child && (await child.can(event, ...arguments_))) {
        const _child: any = child;

        this._activeChild = _child;
        await child?.transition(event, ...arguments_);
        hasExecuted = true;
      }
    }

    return hasExecuted;
  }

  private async getAllowedTransition(
    event: Event,
    ...arguments_: Array<unknown>
  ) {
    const transitionsByState = this._transitions.get(event);

    if (!transitionsByState) {
      return null;
    }

    const transitions = transitionsByState.get(this.current);

    if (transitions) {
      for (const t of transitions) {
        const { guard = _true } = t;

        const result = await (guard?.(this._context, ...arguments_) ?? true);

        if (result) {
          return t;
        }
      }
    }

    // Handle from All
    const allTransitions = transitionsByState.get(All);
    if (allTransitions) {
      for (const t of allTransitions) {
        const { guard = _true } = t;

        const result = await (guard?.(this._context, ...arguments_) ?? true);

        if (result) {
          return t;
        }
      }
    }

    return null;
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

  private prepareStates(
    parameters: StateMachineParameters<State, Event, Context>,
  ) {
    const states = new Map<State, Nested | null>();
    const statesFromParameters = parameters.states?.(parameters);

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

    for (const [state, nested] of Object.entries(statesFromParameters ?? {})) {
      (nested as any)._parent = this;
      states.set(state as State, nested as Nested);
    }

    return states;
  }

  private prepareTransitions(
    transitions?: Array<Transition<State, Event, Context>>,
  ) {
    return (
      transitions?.reduce((accumulator, transition) => {
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
      }, new Map()) ?? new Map()
    );
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
    parameters: StateMachineParameters<State, Event, Context>,
  ) {
    const nestedEvents = [...this._states.values()].flatMap((nested) => {
      if (!nested) {
        return [];
      }

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

  private populateContext(
    parameters: StateMachineParameters<State, Event, Context>,
  ) {
    this._contextPromise = Promise.resolve({} as Context);

    for (const [key, value] of Object.entries(parameters.inject ?? {})) {
      const contextValue = (
        typeof value === 'function' ? value(this) : value
      ) as Context[keyof Context];

      if (contextValue instanceof Promise) {
        this._contextPromise = this._contextPromise.then((context) => {
          return contextValue.then((value) => {
            context[key as keyof Context] = value;
            return context;
          });
        });
      } else {
        this._context[key as keyof Context] = contextValue;
      }
    }

    const data = parameters.data?.(parameters) ?? {};
    if (data instanceof Promise) {
      this._dataPromise = data;
      this._context.data = {};
    } else {
      this._context.data = data;
    }
  }

  private populateCheckers(
    parameters: StateMachineParameters<State, Event, Context>,
  ) {
    const nestedStates = [...this._states.values()].flatMap((nested) => {
      if (!nested) {
        return [];
      }

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

      this.addIsChecker(state);
    }
  }

  /**
   * This method binds the callbacks of the transition to the state machine instance.
   * It useful in case if we need to access the state machine instance from the callbacks.
   */
  private bindToCallbacks(transition: Transition<State, Event, Context>) {
    return {
      ...transition,
      onLeave: transition.onLeave?.bind(this._boundTo),
      onEnter: transition.onEnter?.bind(this._boundTo),
      onExit: transition.onExit?.bind(this._boundTo),
      guard: transition.guard?.bind(this._boundTo),
      _original: transition,
    };
  }

  private switchNestedState(transition: Transition<State, Event, Context>) {
    let child = this._states.get(transition.to);

    if (!child) {
      this._activeChild = null;
      this._activeParallelState = null;
      return;
    }

    if (child.type === 'parallel') {
      this._activeParallelState = child;

      child = child.machines[0];

      return;
    }

    switch (child.history) {
      case 'none': {
        this._activeChild = new _NestedStateMachine(
          child._initialParameters,
          this,
        ) as any;
        break;
      }
      case 'deep': {
        this._activeChild = child as any;
      }
    }
  }

  private makeTransition(transition: Transition<State, Event, Context>) {
    this._last = transition ?? this._last;
  }

  private async executeTransition<
    Arguments extends Array<unknown> = Array<unknown>,
  >(transition: Transition<State, Event, Context>, ...arguments_: Arguments) {
    const { from, to, onEnter, onExit, event } = transition ?? {};

    const subscribers = this._subscribers.get(event);
    const allSubscribers = this._subscribers.get(All);

    try {
      await this._last.onLeave?.(this.context, ...arguments_);
      await onEnter?.(this.context, ...arguments_);
      this.makeTransition(transition);
      this.switchNestedState(transition);

      for (const subscriber of subscribers?.values() ?? []) {
        await subscriber(this.context, ...arguments_);
      }

      for (const subscriber of allSubscribers?.values() ?? []) {
        await subscriber(this.context, ...arguments_);
      }

      await onExit?.(this.context, ...arguments_);
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

export class _NestedStateMachine<
  const State extends AllowedNames,
  const Event extends AllowedNames,
  Context extends FsmContext<object>,
> extends _StateMachine<State, Event, Context> {
  public readonly type = 'nested';
  public readonly history: HistoryTypes;

  constructor(
    parameters: INestedStateMachineParameters<State, Event, Context>,
    protected _parent: _StateMachine<any, any, any> | null = null,
  ) {
    super(parameters);
    this.history = parameters.history ?? 'deep';
  }

  public get context() {
    return { ...this._parent?.context, ...this._context };
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
 *
 */
export const StateMachine = _StateMachine as unknown as StateMachineConstructor;

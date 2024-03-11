import { StateMachineError } from './fsm.error';
import {
  identityTransition,
  prepareStates,
  prepareTransitions,
  prepareSubscribers,
  populateEventMethods,
  populateCheckers,
  populateContext,
  addIsChecker,
  _true,
  capitalize,
} from './heplers';
import { INestedStateMachineParameters } from './nested';
import { All } from './symbols';
import { TransitionOptions, t } from './transition';
import {
  AllowedNames,
  Callback,
  Transition,
  FsmContext,
  Guard,
  IStateMachine,
  ParallelState,
  HistoryTypes,
  INestedStateMachine,
  HydratedState,
  Nested,
  StateMachineConstructor,
  StateMachineParameters,
  States,
  TransitionsStorage,
} from './types';

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
   * Active nested state machine.
   */
  private _activeChild: INestedStateMachine<any, any, any> | null = null;
  /**
   * Active parallel state machine.
   */
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

    this._states = (prepareStates<State>).call(this, parameters);

    this._transitions = prepareTransitions.call(this, parameters.transitions);
    this._subscribers = (prepareSubscribers<Event, Context>).call(
      this,
      parameters.subscribers,
    );

    populateEventMethods.call(this, parameters);
    populateCheckers.call(this, parameters);
    populateContext.call(this, parameters);
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

  /**
   * Context object.
   */
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
   *
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
      addIsChecker.call(this, state);

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
      addIsChecker.call(this, nestedState as State);
    }

    return this;
  }

  /**
   * Removes all nested state machines by state.
   *
   * @param state - State to remove.
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
   *
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
   *
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
   * Without providing event will subscribe to `All` event.
   *
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
   *
   * @param event - Event to unsubscribe from.
   * @param callback - Callback to unsubscribe.
   *
   * @overload
   * Unsubscribe from `All` event.
   *
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
   *
   * @param key - Key to inject.
   * @param service - Service factory function.
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

  /**
   * Hydrates the state machine to JSON.
   *
   * @returns Hydrated JSON.
   */
  public dehydrate(): string {
    const hydrated: HydratedState<State, Context['data']> = {
      current: this.current,
      data: this._context.data,
    };

    if (this._activeChild) {
      hydrated.nested = JSON.parse(this._activeChild.dehydrate());
    }

    return JSON.stringify(hydrated);
  }

  /**
   * Apply hydrated JSON to the state machine.
   *
   * @param hydrated - Hydrated JSON.
   */
  public hydrate(hydrated: string) {
    const hydratedObject: HydratedState<State, Context['data']> =
      JSON.parse(hydrated);

    this._last = identityTransition(hydratedObject.current);
    this._context.data = hydratedObject.data;

    if (this._activeChild) {
      this._activeChild.hydrate(JSON.stringify(hydratedObject.nested));
    }
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

  /**
   * Adds event methods to the state machine instance.
   */
  private addEventMethods(event: Event) {
    if (typeof event !== 'string') {
      // when event is a symbol
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

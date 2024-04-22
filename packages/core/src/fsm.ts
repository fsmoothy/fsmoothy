import {
  StateMachineTransitionError,
  isStateMachineTransitionError,
} from './fsm.error';
import {
  identityTransition,
  prepareStates,
  prepareTransitions,
  prepareSubscribers,
  populateEventMethods,
  populateCheckers,
  addIsChecker,
  _true,
  addEventMethods,
} from './heplers';
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
  Context extends FsmContext<unknown>,
> {
  protected _context = {} as Context;

  constructor(parameters: StateMachineParameters<State, Event, Context>) {
    this.#initialParameters = parameters;
    this.#id = parameters.id ?? 'fsm';
    this.#last = identityTransition(parameters.initial);

    this.#states = (prepareStates<State>).call(this, parameters);

    this.#transitions = prepareTransitions.call(this, parameters.transitions);
    this.#subscribers = (prepareSubscribers<Event, Context>).call(
      this,
      parameters.subscribers,
    );

    populateEventMethods.call(this, parameters);
    populateCheckers.call(this, parameters);
    this.populateContext(parameters);
  }

  #last: Transition<State, Event, Context>;
  #id: string;
  #contextPromise: Promise<Context> | null = null;
  #boundTo: any = this;
  #dataPromise: Promise<Context['data']> | null = null;

  /**
   * Active nested state machine.
   */
  #activeChild: INestedStateMachine<any, any, any> | null = null;
  /**
   * Active parallel state machine.
   */
  #activeParallelState: ParallelState<any, any, any> | null = null;

  /**
   * Map of nested states.
   */
  #states: States<State>;

  /**
   * Map of transitions by event and from-state.
   */
  #transitions: TransitionsStorage<State, Event, Context>;

  #subscribers = new Map<
    Event,
    /**
     * Map of original callbacks by bound callbacks.
     */
    Map<Callback<Context>, Callback<Context>>
  >();

  /**
   * We're saving initial parameters mostly for nested states when history = none
   */
  #initialParameters: StateMachineParameters<State, Event, Context>;

  get context(): Context {
    return this._context;
  }

  /**
   * Current state.
   */
  get current(): State {
    return this.#last.to;
  }

  /**
   * Data object.
   */
  get data(): Context['data'] {
    return this._context.data;
  }

  /**
   * Active child state machine.
   */
  get child() {
    return this.#activeChild;
  }

  /**
   * All events in the state machine.
   */
  get events(): Array<Event> {
    return [...this.#transitions.keys()];
  }

  /**
   * All states in the state machine.
   */
  get states(): Array<State> {
    return [...this.#states.keys()];
  }

  get nested(): Array<Nested> {
    return [...this.#states.values()].filter(
      (v) => v !== null,
    ) as Array<Nested>;
  }

  /**
   * Add transition to the state machine.
   *
   * @param transition - Transition to add.
   * @returns New state machine.
   */
  addTransition<
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

    addEventMethods.call(this, event);

    if (!this.#transitions.has(event)) {
      this.#transitions.set(event, new Map());
    }

    for (const state of states) {
      addIsChecker.call(this, state);

      const transitionsByState = this.#transitions.get(event);

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
  addNestedMachine(state: State, nestedState: Nested) {
    this.#states.set(state, nestedState);

    if (nestedState.type === 'parallel') {
      return this;
    }

    (nestedState as any)._parent = this;

    const nestedEvents = nestedState.events;

    for (const event of nestedEvents) {
      addEventMethods.call(this, event);
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
  removeState(state: State) {
    if (this.current === state) {
      this.#activeChild = null;
      this.#activeParallelState = null;
    }

    this.#states.delete(state);

    return this;
  }

  /**
   * Checks if the state machine is in the given state.
   *
   * @param state - State to check.
   */
  is(state: State): boolean {
    if (this.#activeChild?.is(state)) {
      return true;
    }

    return this.current === state;
  }

  /**
   * Checks if the event can be triggered in the current state.
   *
   * @param event - Event to check.
   */
  async can<Arguments extends Array<unknown> = Array<unknown>>(
    event: Event,
    ...arguments_: Arguments
  ) {
    if (await this.#activeChild?.can(event, ...arguments_)) {
      return true;
    }

    const transitionsByState = this.#transitions.get(event);

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
  on(event: Event, callback: Callback<Context>): this;
  on(callback: Callback<Context>): this;
  on(eventOrCallback: Event | Callback<Context>, callback?: Callback<Context>) {
    if (typeof eventOrCallback === 'function') {
      return this.on(All, eventOrCallback);
    }

    const event = eventOrCallback;

    if (!this.#subscribers.has(event)) {
      this.#subscribers.set(event, new Map());
    }

    const callbacks = this.#subscribers.get(event);
    if (callback) {
      callbacks?.set(callback, callback.bind(this.#boundTo));
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
  off(event: Event, callback: Callback<Context>): this;
  off(callback: Callback<Context>): this;
  off(
    eventOrCallback: Event | Callback<Context>,
    callback?: Callback<Context>,
  ) {
    if (typeof eventOrCallback === 'function') {
      return this.off(All, eventOrCallback);
    }

    const event = eventOrCallback;
    if (!this.#subscribers.has(event)) {
      return;
    }

    const callbacks = this.#subscribers.get(event);
    callbacks?.delete(callback!);

    return this;
  }

  /**
   * Transitions the state machine to the next state.
   *
   * @param event - Event to trigger.
   * @param arguments_ - Arguments to pass to lifecycle hooks.
   */
  async transition<Arguments extends Array<unknown> = Array<unknown>>(
    event: Event,
    ...arguments_: Arguments
  ): Promise<this> {
    // check nested state machine
    if (await this.makeNestedTransition(event, ...arguments_)) {
      return this;
    }
    // propagate to parent

    if (!(await this.can(event, ...arguments_))) {
      throw new StateMachineTransitionError(this.#id, this.current, event);
    }

    const transition = (await this.getAllowedTransition(event, ...arguments_))!;

    if (this.#contextPromise) {
      for (const [key, value] of Object.entries(await this.#contextPromise)) {
        this._context[key as keyof Context] = value as Context[keyof Context];
      }
      this.#contextPromise = null;
    }

    if (this.#dataPromise) {
      this._context.data = await this.#dataPromise;
      this.#dataPromise = null;
    }

    await this.executeTransition(transition, ...arguments_);

    return this;
  }

  /**
   * Tries to transition the state machine to the next state.
   * Returns `false` if the transition is not allowed instead of throwing an error.
   */
  async tryTransition<Arguments extends Array<unknown> = Array<unknown>>(
    event: Event,
    ...arguments_: Arguments
  ): Promise<boolean> {
    try {
      await this.transition(event, ...arguments_);
      return true;
    } catch (error) {
      if (isStateMachineTransitionError(error)) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Will remove all transitions with the given from, to and event.
   */
  removeTransition(from: State, event: Event, to: State) {
    const transitions = this.#transitions.get(event)?.get(from);

    if (!transitions) {
      return this;
    }

    const newTransitions = transitions.filter((t) => t.to !== to);
    this.#transitions.get(event)?.set(from, newTransitions);

    return this;
  }

  /**
   * Binds external context to the state machine callbacks.
   *
   * @param this - Context to bind.
   * @returns state machine instance.
   */
  bind<T>(_this: T) {
    for (const callbacks of this.#subscribers.values()) {
      for (const callback of callbacks.keys()) {
        callbacks.set(callback, callback.bind(_this));
      }
    }

    for (const transitionsByState of this.#transitions.values()) {
      for (const transition of transitionsByState.values()) {
        for (const t of transition) {
          t.onEnter = t._original.onEnter?.bind(_this);
          t.onExit = t._original.onExit?.bind(_this);
          t.onLeave = t._original.onLeave?.bind(_this);
          t.guard = t._original.guard?.bind(_this);
        }
      }
    }

    this.#boundTo = _this;

    return this;
  }

  /**
   * Injects service into the state machine context.
   */
  inject<const Key extends keyof Omit<Context, 'data'>>(
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
  injectAsync<const Key extends keyof Omit<Context, 'data'>>(
    key: Key,
    service: (fsm: this) => Promise<Context[Key]> | Context[Key],
  ) {
    const contextValue = service(this);

    if (contextValue instanceof Promise) {
      this.#contextPromise ??= Promise.resolve({} as Context);
      this.#contextPromise.then((context) => {
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
   * Hydrates the state machine to plain object.
   *
   * @returns Hydrated JSON.
   */
  dehydrate(): HydratedState<State, Context['data']> {
    const hydrated: HydratedState<State, Context['data']> = {
      current: this.current,
      data: this._context.data,
    };

    if (this.#activeChild) {
      hydrated.nested = this.#activeChild.dehydrate();
    }

    return hydrated;
  }

  /**
   * Apply hydrated plain object to the state machine.
   *
   * @param hydrated - Hydrated JSON.
   */
  hydrate(hydrated: HydratedState<State, Context['data']>) {
    this.#last = identityTransition(hydrated.current);
    this._context.data = hydrated.data;

    if (this.#activeChild && hydrated.nested) {
      this.#activeChild.hydrate(hydrated.nested);
    }

    return this;
  }

  protected populateContext(parameters: StateMachineParameters<any, any, any>) {
    this.#contextPromise = Promise.resolve({} as Context);

    for (const [key, value] of Object.entries(parameters.inject ?? {})) {
      const contextValue =
        typeof value === 'function'
          ? value(this as IStateMachine<any, any, any>)
          : value;

      if (contextValue instanceof Promise) {
        this.#contextPromise = this.#contextPromise.then((context: any) => {
          return contextValue.then((value) => {
            context[key] = value;
            return context;
          });
        });
      } else {
        this._context[key as keyof Context] = contextValue;
      }
    }

    const data = parameters.data?.(parameters) ?? {};

    if (data instanceof Promise) {
      this.#dataPromise = data;
      this._context.data = {};
    } else {
      this._context.data = data;
    }
  }

  private async makeNestedTransition(
    event: Event,
    ...arguments_: Array<unknown>
  ) {
    let hasExecuted = false;

    if (!this.#activeChild && !this.#activeParallelState) {
      return hasExecuted;
    }

    const children = this.#activeParallelState?.machines ?? [this.#activeChild];

    for (const child of children) {
      if (child && (await child.can(event, ...arguments_))) {
        const _child = child;

        this.#activeChild = _child;
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
    const transitionsByState = this.#transitions.get(event);

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
   * This method binds the callbacks of the transition to the state machine instance.
   * It useful in case if we need to access the state machine instance from the callbacks.
   */
  private bindToCallbacks(transition: Transition<State, Event, Context>) {
    return {
      ...transition,
      onLeave: transition.onLeave?.bind(this.#boundTo),
      onEnter: transition.onEnter?.bind(this.#boundTo),
      onExit: transition.onExit?.bind(this.#boundTo),
      guard: transition.guard?.bind(this.#boundTo),
      _original: transition,
    };
  }

  private switchNestedState(transition: Transition<State, Event, Context>) {
    let child = this.#states.get(transition.to);

    if (!child) {
      this.#activeChild = null;
      this.#activeParallelState = null;
      return;
    }

    if (child.type === 'parallel') {
      this.#activeParallelState = child;

      child = child.machines[0];

      return;
    }

    switch (child.history) {
      case 'none': {
        this.#activeChild = new (child as any).constructor(
          child.#initialParameters,
          this,
        );
        break;
      }
      case 'deep': {
        this.#activeChild = child;
      }
    }
  }

  private makeTransition(transition: Transition<State, Event, Context>) {
    this.#last = transition ?? this.#last;
  }

  private async executeTransition<
    Arguments extends Array<unknown> = Array<unknown>,
  >(transition: Transition<State, Event, Context>, ...arguments_: Arguments) {
    const { onEnter, onExit, event } = transition ?? {};

    const subscribers = this.#subscribers.get(event);
    const allSubscribers = this.#subscribers.get(All);

    await this.#last.onLeave?.(this.context, ...arguments_);
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

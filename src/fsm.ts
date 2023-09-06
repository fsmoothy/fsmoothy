import { StateMachineError } from './fsm.error';
import { IdentityEvent } from './symbols';
import { AllowedNames, Callback, ITransition } from './types';

type Subscribers<Event extends AllowedNames, Context extends object> = {
  [key in Event]: Array<Callback<Context>>;
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
> {
  ctx?:
    | Context
    | ((
        parameters: IStateMachineParameters<
          State,
          Event,
          Context,
          Transition,
          Transitions
        >,
      ) => Context);
  initial: State;
  transitions: Transitions;
  id?: string;
  subscribers?: Subscribers<Event, Context>;
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

function capitalize(parameter: unknown) {
  if (typeof parameter !== 'string') {
    return parameter;
  }

  return parameter.charAt(0).toUpperCase() + parameter.slice(1);
}

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
  State extends AllowedNames,
  Event extends AllowedNames,
  Context extends object,
> {
  protected _current: ITransition<State, Event, Context>;
  protected _id: string;
  protected _ctx: Context;
  /**
   * Map of allowed events by from-state.
   */
  protected _AllowedNames: Map<State, Set<Event>>;
  /**
   * Map of transitions by event and from-state.
   */
  protected _transitions: Map<
    Event,
    Map<State, ITransition<State, Event, Context>>
  >;

  protected _subscribers = new Map<
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
    this._current = identityTransition(parameters.initial);

    this._ctx =
      typeof parameters.ctx === 'function'
        ? parameters.ctx(parameters)
        : parameters.ctx ?? ({} as Context);

    this.checkDuplicateTransitions(parameters.transitions);

    this._AllowedNames = this.prepareEvents(parameters.transitions);
    this._transitions = this.prepareTransitions(parameters.transitions);
    this._subscribers = this.prepareSubscribers(parameters.subscribers);

    this.populateEventMethods(parameters.transitions);
    this.populateCheckers(parameters.transitions);
  }

  /**
   * Current state.
   */
  get current(): State {
    return this._current.to;
  }

  /**
   * Context object.
   */
  get context(): Context {
    return this._ctx;
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
    return [...this._AllowedNames.keys()];
  }

  /**
   * Returns new state machine with added transition with the same context, initial state and subscribers.
   * @param transition - Transition to add.
   * @returns New state machine.
   */
  public addTransition<
    NewState extends AllowedNames,
    NewEvent extends AllowedNames,
  >(transition: ITransition<NewState, NewEvent, Context>) {
    const parameters = {
      ...this._initialParameters,
      initial: this.current,
      ctx: this._ctx,
      transitions: [...this._initialParameters.transitions, transition],
    } as IStateMachineParameters<State | NewState, Event | NewEvent, Context>;

    const _stateMachine = new StateMachine(parameters);

    // we need to copy subscribers to the new state machine
    _stateMachine._subscribers = new Map();
    for (const [event, callbacks] of this._subscribers.entries()) {
      _stateMachine._subscribers.set(event, callbacks);
    }

    return _stateMachine;
  }

  /**
   * Checks if the state machine is in the given state.
   * @param state - State to check.
   */
  public is(state: State): boolean {
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
    const AllowedNames = this._AllowedNames.get(this.current);
    if (!AllowedNames?.has(event)) {
      return false;
    }

    const transitions = this._transitions.get(event);
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
   */
  public on(event: Event, callback: Callback<Context>) {
    if (!this._subscribers.has(event)) {
      this._subscribers.set(event, new Map());
    }

    const callbacks = this._subscribers.get(event);
    callbacks?.set(callback, callback.bind(this));

    return this;
  }

  /**
   * Unsubscribe from event.
   */
  public off(event: Event, callback: Callback<Context>) {
    if (!this._subscribers.has(event)) {
      console.warn(`Event ${String(event)} is not subscribed in ${this._id}`);
      return;
    }

    const callbacks = this._subscribers.get(event);
    callbacks?.delete(callback);

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
  ) {
    return await new Promise<this>(async (resolve, reject) => {
      if (!(await this.can(event, ...arguments_))) {
        reject(
          new StateMachineError(
            `Event ${String(event)} is not allowed in state ${String(
              this.current,
            )} of ${this._id}`,
          ),
        );
        return;
      }

      // delay execution to make it really async
      setTimeout(() => {
        const transitions = this._transitions.get(event);

        // we already checked if the event is allowed
        // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
        const transition = transitions?.get(this.current)!;

        this.executeTransition(transition, ...arguments_).then(() =>
          resolve(this),
        );
      }, 0);
    });
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

  private prepareEvents(
    transitions: Array<ITransition<State, Event, Context>>,
  ) {
    return transitions.reduce((accumulator, transition) => {
      const { from, event } = transition;
      const froms = Array.isArray(from) ? from : [from];

      for (const from of froms) {
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

  private populateEventMethods(
    transitions: Array<ITransition<State, Event, Context>>,
  ) {
    for (const transition of transitions) {
      const { event } = transition;
      // @ts-expect-error We need to assign the method to the instance.
      this[event] = async (...arguments_: [unknown, ...Array<unknown>]) => {
        await this.transition(event, ...arguments_);
      };
    }
  }

  /**
   * Adds useful warnings on fsm initialization.
   */
  private checkDuplicateTransitions(
    transitions: Array<ITransition<State, Event, Context>>,
  ) {
    const transitionsMap = new Map<
      State,
      Map<Event, ITransition<State, Event, Context>>
    >();

    for (const transition of transitions) {
      const { from, event } = transition;
      const froms = Array.isArray(from) ? from : [from];

      for (const from of froms) {
        if (!transitionsMap.has(from)) {
          transitionsMap.set(from, new Map());
        }

        if (transitionsMap.get(from)?.has(event)) {
          console.warn(
            `Duplicate transition from ${String(from)} on event ${String(
              event,
            )}`,
          );
        }

        transitionsMap.get(from)?.set(event, transition);
      }
    }
  }

  private populateCheckers(
    transitions: Array<ITransition<State, Event, Context>>,
  ) {
    for (const transition of transitions) {
      const { from, to, event } = transition;
      const capitalizedFrom = capitalize(from);
      const capitalizedTo = capitalize(to);
      const capitalizedEvent = capitalize(event);

      // @ts-expect-error We need to assign the method to the instance.
      this[`is${capitalizedFrom}`] = () => this.is(from);

      // @ts-expect-error We need to assign the method to the instance.
      this[`is${capitalizedTo}`] = () => this.is(to);

      // @ts-expect-error We need to assign the method to the instance.
      this[`can${capitalizedEvent}`] = (...arguments_) =>
        this.can(event, ...arguments_);
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

  private async executeTransition<
    Arguments extends Array<unknown> = Array<unknown>,
  >(transition: ITransition<State, Event, Context>, ...arguments_: Arguments) {
    const { from, to, onEnter, onExit, event } = transition ?? {};

    const subscribers = this._subscribers.get(event);

    try {
      await this._current.onLeave?.(this._ctx, ...arguments_);
      await onEnter?.(this._ctx, ...arguments_);
      this._current = transition ?? this._current;

      for (const subscriber of subscribers?.values() ?? []) {
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

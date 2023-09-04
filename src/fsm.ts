import { StateMachineError } from './fsm.error';
import { AllowedNames, Callback, ITransition } from './types';

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
}

type StateMachineEvents<Event extends AllowedNames> = {
  /**
   * @param arguments_ - Arguments to pass to lifecycle hooks.
   */
  [key in Event]: <T extends Array<unknown>>(...arguments_: T) => Promise<void>;
};

type CapitalizeString<S> = S extends string ? Capitalize<S> : S;

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

export class _StateMachine<
  State extends AllowedNames,
  Event extends AllowedNames,
  Context extends object,
> {
  protected _current: State;
  protected _id: string;
  protected _ctx: Context;
  /**
   * Map of allowed events by from-state.
   */
  protected _allowedEvents: Map<State, Set<Event>>;
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
    this._current = parameters.initial;
    this._ctx =
      typeof parameters.ctx === 'function'
        ? parameters.ctx(parameters)
        : parameters.ctx ?? ({} as Context);

    this.checkDuplicateTransitions(parameters.transitions);

    this._allowedEvents = this.prepareEvents(parameters.transitions);
    this._transitions = this.prepareTransitions(parameters.transitions);

    this.populateEventMethods(parameters.transitions);
    this.populateCheckers(parameters.transitions);
  }

  /**
   * Current state.
   */
  get current(): State {
    return this._current;
  }

  /**
   * Context object.
   */
  get context(): Context {
    return this._ctx;
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
    const parameters: IStateMachineParameters<
      State | NewState,
      Event | NewEvent,
      Context
    > = {
      ...this._initialParameters,
      initial: this._current,
      ctx: this._ctx,
      transitions: [...this._initialParameters.transitions, transition],
    };

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
    return this._current === state;
  }

  /**
   * Checks if the event can be triggered in the current state.
   * @param event - Event to check.
   */
  public async can<Arguments extends Array<unknown> = Array<unknown>>(
    event: Event,
    ...arguments_: Arguments
  ) {
    const allowedEvents = this._allowedEvents.get(this._current);
    if (!allowedEvents?.has(event)) {
      return false;
    }

    const transitions = this._transitions.get(event);
    if (!transitions?.has(this._current)) {
      return false;
    }

    const { guard } = transitions.get(this._current) ?? {};

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
      console.warn(`Event ${event} is not subscribed in ${this._id}`);
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
            `Event ${event} is not allowed in state ${this._current} of ${this._id}`,
          ),
        );
        return;
      }

      // delay execution to make it really async
      setTimeout(() => {
        const transitions = this._transitions.get(event);

        // we already checked if the event is allowed
        // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
        const transition = transitions?.get(this._current)!;

        this.executeTransition(transition, ...arguments_).then(() =>
          resolve(this),
        );
      }, 0);
    });
  }

  private prepareEvents(
    transitions: Array<ITransition<State, Event, Context>>,
  ) {
    return transitions.reduce((accumulator, transition) => {
      const { from, event } = transition;
      const froms = Array.isArray(from) ? from : [from];

      for (const from of froms) {
        if (!accumulator.has(from)) {
          accumulator.set(from, new Set<Event>());
        }

        accumulator.get(from)?.add(event);
      }

      return accumulator;
    }, new Map<State, Set<Event>>());
  }

  private prepareTransitions(
    transitions: Array<ITransition<State, Event, Context>>,
  ) {
    return transitions.reduce((accumulator, transition) => {
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
          console.warn(`Duplicate transition from ${from} on event ${event}`);
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
      await onEnter?.(this._ctx, ...arguments_);
      this._current = to ?? this._current;

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
          `Exception caught in ${this._id} on transition from ${from} to ${to}: ${error}`,
          transition,
        );
      }

      throw new StateMachineError(
        `Exception caught in ${this._id} on transition from ${from} to ${to}: ${error.message}`,
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

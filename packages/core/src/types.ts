import { _StateMachine } from './fsm';
import { _NestedStateMachine } from './nested';

export type AllowedNames = string | number;

export interface FsmContext<D = never> {
  data: D;
}

export type Callback<
  Context extends FsmContext<unknown>,
  // TODO: figure out how to type this
  T extends Array<any> = Array<any>,
> = (context: Context, ...arguments_: T) => Promise<void> | void;

export type Guard<
  Context extends FsmContext<unknown>,
  // TODO: figure out how to type this
  T extends Array<any> = Array<any>,
> = (context: Context, ...arguments_: T) => Promise<boolean> | boolean;

export interface Transition<
  State extends AllowedNames,
  Event extends AllowedNames,
  Context extends FsmContext<unknown>,
> {
  from: ReadonlyArray<State> | State;
  event: Event;
  to: State;
  onEnter?: Callback<Context>;
  onExit?: Callback<Context>;
  onLeave?: Callback<Context>;
  guard?: Guard<Context>;
}

export type Subscribers<
  Event extends AllowedNames,
  Context extends FsmContext<unknown>,
> = {
  [key in Event]?: Array<Callback<Context>>;
};

type StateMachineEvents<Event extends AllowedNames> = {
  /**
   * @param arguments_ - Arguments to pass to lifecycle hooks.
   */
  [key in Event]: (...arguments_: Array<unknown>) => Promise<void>;
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
  [key in `can${CapitalizeString<Event>}`]: (
    ...arguments_: Array<unknown>
  ) => Promise<boolean>;
};

type StateMachineCheckers<State extends AllowedNames> = {
  [key in `is${CapitalizeString<State>}`]: () => boolean;
};

export type IStateMachine<
  State extends AllowedNames,
  Event extends AllowedNames,
  Context extends FsmContext<unknown>,
> = _StateMachine<State, Event, Context> &
  StateMachineEvents<Event> &
  StateMachineCheckers<State> &
  StateMachineTransitionCheckers<Event>;

export type HistoryTypes = 'none' | 'deep';

export interface INestedStateMachineParameters<
  State extends AllowedNames,
  Event extends AllowedNames,
  Context extends FsmContext<unknown>,
> extends StateMachineParameters<State, Event, Context> {
  /**
   * The history type of the nested state machine.
   * @default 'deep'
   */
  history?: HistoryTypes;
}

export type INestedStateMachine<
  State extends AllowedNames,
  Event extends AllowedNames,
  Context extends FsmContext<unknown>,
> = _NestedStateMachine<State, Event, Context> &
  StateMachineEvents<Event> &
  StateMachineCheckers<State> &
  StateMachineTransitionCheckers<Event>;

export type NestedStateMachineConstructor = {
  new <
    State extends AllowedNames,
    Event extends AllowedNames,
    Context extends FsmContext<unknown>,
  >(
    parameters: StateMachineParameters<State, Event, Context>,
    parent?: _StateMachine<AllowedNames, AllowedNames, FsmContext<unknown>>,
  ): INestedStateMachine<State, Event, Context>;
};

export interface ParallelState<
  State extends AllowedNames,
  Event extends AllowedNames,
  Context extends FsmContext<unknown>,
> {
  type: 'parallel';
  machines: ReadonlyArray<INestedStateMachine<State, Event, Context>>;
}

export interface HydratedState<State extends AllowedNames, Data> {
  current: State;
  data: Data;
  nested?: HydratedState<AllowedNames, unknown>;
}

// TODO: figure out how to type this
export type Nested =
  | INestedStateMachine<any, any, any>
  | ParallelState<any, any, any>;

export type States<State extends AllowedNames> = Map<State, Nested | null>;

type Injectable<
  State extends AllowedNames,
  Event extends AllowedNames,
  Context extends FsmContext<unknown> = FsmContext<unknown>,
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
  State extends AllowedNames,
  Event extends AllowedNames,
  Context extends FsmContext<unknown> = FsmContext<unknown>,
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
    [key in State extends ReadonlyArray<AllowedNames> ? never : State]?: Nested;
  };
  readonly inject?: Injectable<State, Event, Context>;
}

export type StateMachineConstructor = {
  new <
    State extends AllowedNames,
    Event extends AllowedNames,
    Context extends FsmContext<unknown> = FsmContext<never>,
  >(
    parameters: StateMachineParameters<State, Event, Context>,
  ): IStateMachine<State, Event, Context>;
};

export interface IInternalTransition<
  State extends AllowedNames,
  Event extends AllowedNames,
  Context extends FsmContext<unknown> = FsmContext<never>,
> extends Transition<State, Event, Context> {
  _original: Transition<State, Event, Context>;
}

export type TransitionsStorage<
  State extends AllowedNames,
  Event extends AllowedNames,
  Context extends FsmContext<unknown> = FsmContext<never>,
> = Map<Event, Map<State, Array<IInternalTransition<State, Event, Context>>>>;

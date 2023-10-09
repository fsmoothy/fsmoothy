import { _StateMachine } from './fsm';

export type AllowedNames = string | number;

export type FsmContext<D extends object = never> = {
  data: D;
};

export interface Callback<
  Context extends FsmContext<object>,
  T extends Array<any> = Array<any>,
> {
  (context: Context, ...arguments_: T): Promise<void> | void;
}

export interface Guard<
  Context extends FsmContext<object>,
  T extends Array<any> = Array<any>,
> {
  (context: Context, ...arguments_: T): Promise<boolean> | boolean;
}

export interface Transition<
  State extends AllowedNames | Array<AllowedNames>,
  Event extends AllowedNames,
  Context extends FsmContext<object>,
> {
  from: Array<State> | State;
  event: Event;
  to: State;
  onEnter?: Callback<Context>;
  onExit?: Callback<Context>;
  onLeave?: Callback<Context>;
  guard?: Guard<Context>;
}

export type Subscribers<
  Event extends AllowedNames,
  Context extends FsmContext<object>,
> = {
  [key in Event]?: Array<Callback<Context>>;
};

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
  Context extends FsmContext<object>,
> = _StateMachine<State, Event, Context> &
  StateMachineEvents<Event> &
  StateMachineCheckers<State> &
  StateMachineTransitionCheckers<Event>;

export type HistoryTypes = 'none' | 'deep';

export interface NestedState<
  NestedStatedStateMachine extends IStateMachine<
    AllowedNames,
    AllowedNames,
    FsmContext<object>
  >,
> {
  type: 'nested';
  machine: NestedStatedStateMachine;
  history: HistoryTypes;
}

export interface ParallelState<_NestedState extends NestedState<any>> {
  type: 'parallel';
  machines: Array<_NestedState>;
}

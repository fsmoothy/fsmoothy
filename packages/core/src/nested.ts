import { _StateMachine } from './fsm';
import {
  AllowedNames,
  FsmContext,
  HistoryTypes,
  INestedStateMachine,
  INestedStateMachineParameters,
  NestedStateMachineConstructor,
  ParallelState,
} from './types';

type NestedStateMachineParent = _StateMachine<any, any, any>;

export class _NestedStateMachine<
  const State extends AllowedNames,
  const Event extends AllowedNames,
  Context extends FsmContext<object>,
> extends _StateMachine<State, Event, Context> {
  readonly type = 'nested';
  readonly history: HistoryTypes;

  constructor(
    parameters: INestedStateMachineParameters<State, Event, Context>,
    protected _parent: NestedStateMachineParent | null = null,
  ) {
    super(parameters);
    this.history = parameters.history ?? 'deep';
  }

  get context(): Context {
    return { ...this._parent?.context, ...this._context };
  }
}

export const NestedStateMachine =
  _NestedStateMachine as unknown as NestedStateMachineConstructor;

/**
 * Creates a nested state machine.
 *
 * @param machineParameters The parameters of the nested state machine.
 * @param options The options of the nested state machine.
 * @returns A nested state machine.
 */
export function nested<
  const State extends AllowedNames,
  const Event extends AllowedNames,
  Context extends FsmContext<object>,
>(
  machineParameters: INestedStateMachineParameters<State, Event, Context>,
): INestedStateMachine<State, Event, Context> {
  return new NestedStateMachine(machineParameters);
}

export function parallel<
  const State extends AllowedNames,
  const Event extends AllowedNames,
  Context extends FsmContext<object>,
>(
  nested: INestedStateMachine<State, Event, Context>,
): ParallelState<State, Event, Context>;
export function parallel<
  const State1 extends AllowedNames,
  const Event1 extends AllowedNames,
  Context1 extends FsmContext<object>,
  const State2 extends AllowedNames,
  const Event2 extends AllowedNames,
  Context2 extends FsmContext<object>,
>(
  nested1: INestedStateMachine<State1, Event1, Context1>,
  nested2: INestedStateMachine<State2, Event2, Context2>,
): ParallelState<State1 | State2, Event1 | Event1, Context1 | Context2>;
export function parallel<
  const State1 extends AllowedNames,
  const Event1 extends AllowedNames,
  Context1 extends FsmContext<object>,
  const State2 extends AllowedNames,
  const Event2 extends AllowedNames,
  Context2 extends FsmContext<object>,
  const State3 extends AllowedNames,
  const Event3 extends AllowedNames,
  Context3 extends FsmContext<object>,
>(
  nested1: INestedStateMachine<State1, Event1, Context1>,
  nested2: INestedStateMachine<State2, Event2, Context2>,
  nested3: INestedStateMachine<State3, Event3, Context3>,
): ParallelState<
  State1 | State2 | State3,
  Event1 | Event1 | Event3,
  Context1 | Context2 | Context3
>;
export function parallel(
  ...nested: Array<INestedStateMachine<any, any, any>>
): ParallelState<any, any, any> {
  return {
    type: 'parallel',
    machines: nested,
  };
}

import { _NestedStateMachine } from './fsm';
import {
  AllowedNames,
  FsmContext,
  HistoryTypes,
  INestedStateMachine,
  ParallelState,
  StateMachineParameters,
} from './types';

export interface INestedStateMachineParameters<
  State extends AllowedNames,
  Event extends AllowedNames,
  Context extends FsmContext<object>,
> extends StateMachineParameters<State, Event, Context> {
  /**
   * The history type of the nested state machine.
   * @default 'deep'
   */
  history?: HistoryTypes;
}

export type NestedStateMachineConstructor = {
  new <
    State extends AllowedNames,
    Event extends AllowedNames,
    Context extends FsmContext<object> = FsmContext<never>,
  >(
    parameters: StateMachineParameters<State, Event, Context>,
  ): INestedStateMachine<State, Event, Context> & {
    readonly history: HistoryTypes;
    readonly type: 'nested';
  };
};

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

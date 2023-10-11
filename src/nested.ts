import { StateMachineParameters, _NestedStateMachine } from './fsm';
import {
  AllowedNames,
  FsmContext,
  HistoryTypes,
  IStateMachine,
  ParallelState,
} from './types';

export interface INestedStateMachineParameters<
  State extends AllowedNames,
  Event extends AllowedNames,
  Context extends FsmContext<object>,
> extends StateMachineParameters<State, Event, Context> {
  history?: HistoryTypes;
}

export type NestedStateMachineConstructor = {
  new <
    State extends AllowedNames,
    Event extends AllowedNames,
    Context extends FsmContext<object> = FsmContext<never>,
  >(
    parameters: StateMachineParameters<State, Event, Context>,
  ): IStateMachine<State, Event, Context> & {
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
>(machineParameters: INestedStateMachineParameters<State, Event, Context>) {
  return new NestedStateMachine(machineParameters);
}

export function parallel<
  const State extends AllowedNames,
  const Event extends AllowedNames,
  Context extends FsmContext<object>,
>(
  ...nested: Array<_NestedStateMachine<State, Event, Context>>
): ParallelState<State, Event, Context> {
  return {
    type: 'parallel',
    machines: nested,
  };
}

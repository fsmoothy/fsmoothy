import { IStateMachineParameters, StateMachine, _StateMachine } from './fsm';
import { AllowedNames } from './types';

export type HistoryTypes = 'none' | 'deep';

export type NestedState<
  NestedStatedStateMachine extends _StateMachine<
    AllowedNames,
    AllowedNames,
    object
  >,
> = {
  type: 'nested';
  machine: NestedStatedStateMachine;
  history: HistoryTypes;
};

export interface INestedOptions {
  history?: HistoryTypes;
}
export function nested<
  const State extends AllowedNames,
  const Event extends AllowedNames,
  Context extends object,
>(
  machineParameters: IStateMachineParameters<State, Event, Context>,
  { history = 'deep' }: INestedOptions = {},
): NestedState<any> {
  return {
    type: 'nested',
    machine: new StateMachine(machineParameters),
    history,
  };
}

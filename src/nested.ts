import { StateMachineParameters, StateMachine, _StateMachine } from './fsm';
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
  Context extends object,
>(
  machineParameters: StateMachineParameters<State, Event, Context>,
  { history = 'deep' }: INestedOptions = {},
): NestedState<any> {
  return {
    type: 'nested',
    machine: new StateMachine(machineParameters),
    history,
  };
}

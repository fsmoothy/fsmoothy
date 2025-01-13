import { _StateMachine } from './fsm';

import type {
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
  Context extends FsmContext<unknown>,
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
  Context extends FsmContext<unknown>,
>(
  machineParameters: INestedStateMachineParameters<State, Event, Context>,
): INestedStateMachine<State, Event, Context> {
  return new NestedStateMachine(machineParameters);
}

/**
 * Creates a parallel state. Parallel states execute all nested state machines at the same time.
 *
 * @param nested The nested state machines.
 */
export function parallel<
  NestedMachines extends ReadonlyArray<
    INestedStateMachine<State, Event, Context>
  >,
  const State extends AllowedNames = NestedMachines[number]['current'],
  const Event extends AllowedNames = NestedMachines[number]['events'][number],
  Context extends FsmContext<unknown> = NestedMachines[number]['context'],
>(...nested: NestedMachines): ParallelState<State, Event, Context> {
  return {
    type: 'parallel',
    machines: nested,
  };
}

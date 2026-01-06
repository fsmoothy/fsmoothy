import type { AllowedNames, FsmContext } from '@fsmoothy/core';
import type { IStateMachineEntityColumnParameters } from './fsm.entity';

export const state = <
  const State extends AllowedNames,
  const Event extends AllowedNames,
  Context extends FsmContext<unknown> = FsmContext<unknown>,
>(
  parameters: IStateMachineEntityColumnParameters<State, Event, Context>,
) => parameters;

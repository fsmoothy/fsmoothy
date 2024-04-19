import { AllowedNames, FsmContext } from '@fsmoothy/core';

import { IStateMachineEntityColumnParameters } from './fsm.entity';

export const state = <
  const State extends AllowedNames,
  const Event extends AllowedNames,
  Context extends FsmContext<unknown> = FsmContext<unknown>,
>(
  parameters: IStateMachineEntityColumnParameters<State, Event, Context>,
) => parameters;

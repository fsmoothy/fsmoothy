import { AllowedNames, FsmContext } from '@fsmoothy/core';

import { IStateMachineEntityColumnParameters } from './fsm.entity';

export const state = <
  const State extends AllowedNames,
  const Event extends AllowedNames,
  Context extends FsmContext<object> = FsmContext<object>,
>(
  parameters: IStateMachineEntityColumnParameters<State, Event, Context>,
) => parameters;

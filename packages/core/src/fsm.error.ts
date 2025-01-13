import type { AllowedNames } from './types';

export class StateMachineTransitionError extends Error {
  constructor(
    id: string,
    from: AllowedNames,
    event: AllowedNames,
    cause?: unknown,
  ) {
    super(
      `Event ${String(event)} is not allowed in state ${String(from)} of ${id}`,
    );
    this.name = 'StateMachineTransitionError';
    this.cause = cause;
  }
}

export const isStateMachineTransitionError = (
  error: unknown,
): error is StateMachineTransitionError =>
  error instanceof StateMachineTransitionError;

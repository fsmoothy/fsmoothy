export class StateMachineError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'StateMachineError';
    this.cause = cause;
  }
}

export const isStateMachineError = (
  error: unknown,
): error is StateMachineError => error instanceof StateMachineError;

import { describe, expect, it } from 'vitest';
import type { FsmContext } from '../..';
import { defineEvents, defineStates, StateMachine } from '../..';

const State = defineStates('sleeping', 'running', 'cleaning');
type State = typeof State.type;

const Event = defineEvents('run', 'clean', 'sleep');
type Event = typeof Event.type;

interface IContext {
  isCleanerAvailable: boolean;
}

class JobStatus extends StateMachine<State, Event, FsmContext<IContext>> {
  constructor() {
    super({
      initial: State.sleeping,
      async data() {
        const isCleanerAvailable = await Promise.resolve(true);
        return {
          isCleanerAvailable,
        };
      },
    });

    this.addTransition(State.sleeping, Event.run, State.running, {
      onExit(context) {
        context.data.isCleanerAvailable = true;
      },
    })
      .addTransition(State.running, Event.clean, State.cleaning, {
        guard: (context) => context.data.isCleanerAvailable,
        onExit(context) {
          context.data.isCleanerAvailable = false;
        },
      })
      .addTransition(
        [State.cleaning, State.running],
        Event.sleep,
        State.sleeping,
      );
  }
}

describe('Job', () => {
  it('should start in sleeping state', async () => {
    const job = new JobStatus();

    expect(job.isSleeping()).toBe(true);

    await job.run();
    expect(job.isRunning()).toBe(true);
    expect(job.data.isCleanerAvailable).toBe(true);
  });
});

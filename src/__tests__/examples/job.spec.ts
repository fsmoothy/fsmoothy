import { describe, it, expect } from 'vitest';

import { StateMachine, FsmContext } from '../..';

enum States {
  Sleeping = 'sleeping',
  Running = 'running',
  Cleaning = 'cleaning',
}

enum Events {
  Run = 'run',
  Clean = 'clean',
  Sleep = 'sleep',
}

interface IContext {
  isCleanerAvailable: boolean;
}

class JobStatus extends StateMachine<States, Events, FsmContext<IContext>> {
  constructor() {
    super({
      initial: States.Sleeping,
      async data() {
        const isCleanerAvailable = await Promise.resolve(true);
        return {
          isCleanerAvailable,
        };
      },
    });

    this.addTransition(States.Sleeping, Events.Run, States.Running, {
      onExit(context) {
        context.data.isCleanerAvailable = true;
      },
    })
      .addTransition(States.Running, Events.Clean, States.Cleaning, {
        guard: (context) => context.data.isCleanerAvailable,
        onExit(context) {
          context.data.isCleanerAvailable = false;
        },
      })
      .addTransition(
        [States.Cleaning, States.Running],
        Events.Sleep,
        States.Sleeping,
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

import { describe, it, expect } from 'vitest';

import { StateMachine, t } from '../..';

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

const buildJobFsm = () =>
  new StateMachine<States, Events, IContext>({
    initial: States.Sleeping,
    async ctx() {
      const isCleanerAvailable = await Promise.resolve(true);
      return {
        isCleanerAvailable,
      };
    },
    transitions: [
      t(States.Sleeping, Events.Run, States.Running, {
        onExit(context) {
          context.isCleanerAvailable = true;
        },
      }),
      t(States.Running, Events.Clean, States.Cleaning, {
        guard: (context) => context.isCleanerAvailable,
        onExit(context) {
          context.isCleanerAvailable = false;
        },
      }),
      t([States.Cleaning, States.Running], Events.Sleep, States.Sleeping),
    ],
  });

describe('Job', () => {
  it('should start in sleeping state', async () => {
    const job = buildJobFsm();

    expect(job.isSleeping()).toBe(true);

    await job.run();
    expect(job.isRunning()).toBe(true);
    expect(job.context.isCleanerAvailable).toBe(true);
  });
});

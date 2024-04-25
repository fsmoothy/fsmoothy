import { FsmContext, StateMachine } from '@fsmoothy/core';
import { render } from 'src';
import { describe, expect, it } from 'vitest';

describe('graphviz', () => {
  it('should render a state machine', async () => {
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

    const fsm = new JobStatus();
    await fsm.transition(Events.Run);
    expect(render(fsm.inspect())).toMatchSnapshot();
  });
});

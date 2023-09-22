import { describe, expect, it, vi } from 'vitest'
import { t, StateMachine, IStateMachineParameters, nested } from '../..';

enum State {
  green = 'green',
  yellow = 'yellow',
  red = 'red',
}

enum Event {
  Tick = 'tick',
}

enum CrosswalkStates {
  walk = 'walk',
  dontWalk = 'dontWalk',
}

enum CrosswalkEvents {
  toggle = 'toggle',
}

const trafficLightStateMachineParameters: IStateMachineParameters<
  State | CrosswalkStates,
  Event | CrosswalkEvents
> = {
  initial: State.green,
  transitions: [
    t(State.green, Event.Tick, State.yellow),
    t(State.yellow, Event.Tick, State.red),
    t(State.red, Event.Tick, State.green),
  ],
  states: () => ({
    [State.red]: nested(
      {
        id: 'crosswalk',
        initial: CrosswalkStates.dontWalk,
        transitions: [
          t(
            CrosswalkStates.dontWalk,
            CrosswalkEvents.toggle,
            CrosswalkStates.walk,
          ),
          t(
            CrosswalkStates.walk,
            CrosswalkEvents.toggle,
            CrosswalkStates.dontWalk,
          ),
        ],
      },
      {
        history: 'none',
      },
    ),
  }),
};

const createTrafficLightStateMachine = () =>
  new StateMachine(trafficLightStateMachineParameters);

describe('Traffic Light', () => {
  it('should transition from green to yellow on Tick event', async () => {
    const trafficLightStateMachine = createTrafficLightStateMachine();

    expect(trafficLightStateMachine.current).toBe(State.green);
    await trafficLightStateMachine.tick();
    expect(trafficLightStateMachine.current).toBe(State.yellow);
  });

  it('should transition from yellow to red on TIMER event', async () => {
    const trafficLightStateMachine = createTrafficLightStateMachine();

    await trafficLightStateMachine.tick();
    expect(trafficLightStateMachine.current).toBe(State.yellow);
    await trafficLightStateMachine.tick();
    expect(trafficLightStateMachine.current).toBe(State.red);
  });

  it('should transition from red to green on TIMER event', async () => {
    const trafficLightStateMachine = createTrafficLightStateMachine();

    await trafficLightStateMachine.tick();
    await trafficLightStateMachine.tick();

    expect(trafficLightStateMachine.current).toBe(State.red);

    await trafficLightStateMachine.tick();
    expect(trafficLightStateMachine.current).toBe(State.green);
  });

  it('should work for traffic light with crosswalk', async () => {
    const trafficLightStateMachine = createTrafficLightStateMachine();

    expect(trafficLightStateMachine.current).toBe(State.green);
    await trafficLightStateMachine.tick();
    await trafficLightStateMachine.tick();
    expect(trafficLightStateMachine.current).toBe(State.red);
    expect(trafficLightStateMachine.isDontWalk()).toBeTruthy();

    await trafficLightStateMachine.toggle();
    expect(trafficLightStateMachine.isWalk()).toBeTruthy();

    await trafficLightStateMachine.tick();
    expect(trafficLightStateMachine.current).toBe(State.green);

    await trafficLightStateMachine.tick();
    await trafficLightStateMachine.tick();

    expect(trafficLightStateMachine.current).toBe(State.red);
    expect(trafficLightStateMachine.isDontWalk()).toBeTruthy();
  });
});

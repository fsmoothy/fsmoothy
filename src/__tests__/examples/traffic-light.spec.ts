import { describe, expect, it } from 'vitest';

import { t, StateMachine, nested } from '../..';

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

class TrafficLight extends StateMachine<
  State | CrosswalkStates,
  Event | CrosswalkEvents
> {
  constructor() {
    super({
      initial: State.green,
      transitions: [
        t(State.green, Event.Tick, State.yellow),
        t(State.yellow, Event.Tick, State.red),
        t(State.red, Event.Tick, State.green),
      ],
    });

    this.addNestedMachine(
      State.red,
      nested({
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
        history: 'none',
      }),
    );
  }
}

describe('Traffic Light', () => {
  it('should transition from green to yellow on Tick event', async () => {
    const trafficLightStateMachine = new TrafficLight();

    expect(trafficLightStateMachine.current).toBe(State.green);
    await trafficLightStateMachine.tick();
    expect(trafficLightStateMachine.current).toBe(State.yellow);
  });

  it('should transition from yellow to red on TIMER event', async () => {
    const trafficLightStateMachine = new TrafficLight();

    await trafficLightStateMachine.tick();
    expect(trafficLightStateMachine.current).toBe(State.yellow);
    await trafficLightStateMachine.tick();
    expect(trafficLightStateMachine.current).toBe(State.red);
  });

  it('should transition from red to green on TIMER event', async () => {
    const trafficLightStateMachine = new TrafficLight();

    await trafficLightStateMachine.tick();
    await trafficLightStateMachine.tick();

    expect(trafficLightStateMachine.current).toBe(State.red);

    await trafficLightStateMachine.tick();
    expect(trafficLightStateMachine.current).toBe(State.green);
  });

  it('should work for traffic light with crosswalk', async () => {
    const trafficLightStateMachine = new TrafficLight();

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

import { describe, expect, it } from 'vitest';

import { defineEvents, defineStates, nested, StateMachine, t } from '../..';

const State = defineStates('green', 'yellow', 'red');
type State = typeof State.type;

const Event = defineEvents('tick');
type Event = typeof Event.type;

const CrosswalkState = defineStates('walk', 'dontWalk');
type CrosswalkState = typeof CrosswalkState.type;

const CrosswalkEvent = defineEvents('toggle');
type CrosswalkEvent = typeof CrosswalkEvent.type;

class TrafficLight extends StateMachine<
  State | CrosswalkState,
  Event | CrosswalkEvent
> {
  constructor() {
    super({
      initial: State.green,
      transitions: [
        t(State.green, Event.tick, State.yellow),
        t(State.yellow, Event.tick, State.red),
        t(State.red, Event.tick, State.green),
      ],
    });

    this.addNestedMachine(
      State.red,
      nested({
        id: 'crosswalk',
        initial: CrosswalkState.dontWalk,
        transitions: [
          t(
            CrosswalkState.dontWalk,
            CrosswalkEvent.toggle,
            CrosswalkState.walk,
          ),
          t(
            CrosswalkState.walk,
            CrosswalkEvent.toggle,
            CrosswalkState.dontWalk,
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

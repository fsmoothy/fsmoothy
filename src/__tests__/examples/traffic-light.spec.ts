import { t, StateMachine, IStateMachineParameters } from '../..';

enum State {
  green = 'green',
  yellow = 'yellow',
  red = 'red',
}

enum Event {
  Tick = 'tick',
}

const trafficLightStateMachineParameters: IStateMachineParameters<
  State,
  Event
> = {
  initial: State.green,
  transitions: [
    t(State.green, Event.Tick, State.yellow),
    t(State.yellow, Event.Tick, State.red),
    t(State.red, Event.Tick, State.green),
  ],
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
});

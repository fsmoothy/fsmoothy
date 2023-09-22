import { describe, expect, it } from 'vitest';

import { StateMachine, t, IStateMachine, IStateMachineParameters } from '../..';

enum ClockState {
  Clock = 'clock',
  Bell = 'bell',
  Alarm = 'alarm',
}

enum ClockEvent {
  Tick = 'tick',
  ClickH = 'clickH',
  ClickM = 'clickM',
  ClickMode = 'clickMode',
  LongClickMode = 'longClickMode',
  ActivateAlarm = 'activateAlarm',
}

interface IClockContext {
  time: {
    minutes: number;
    hours: number;
  };
  alarm: {
    minutes: number;
    hours: number;
  };
  isAlarmOn: boolean;
}

type Clock = IStateMachine<ClockState, ClockEvent, IClockContext>;

type ClockAddTimeCallback = (
  type: 'time' | 'alarm',
) => (context: IClockContext) => void;

const addMinutes: ClockAddTimeCallback = (type) => (context) => {
  context[type].minutes = (context[type].minutes + 1) % 60;
};

const addHours: ClockAddTimeCallback = (type) => (context) => {
  context[type].hours = (context[type].hours + 1) % 24;
};

const stateMachineParameters: IStateMachineParameters<
  ClockState,
  ClockEvent,
  IClockContext
> = {
  initial: ClockState.Clock,
  ctx: () => ({
    time: {
      minutes: 0,
      hours: 12,
    },
    alarm: {
      minutes: 0,
      hours: 6,
    },
    isAlarmOn: false,
  }),
  transitions: [
    t(ClockState.Clock, ClockEvent.ClickMode, ClockState.Alarm),
    t(ClockState.Alarm, ClockEvent.ClickMode, ClockState.Clock),
    t(ClockState.Bell, ClockEvent.ClickH, ClockState.Bell),
    t(ClockState.Bell, ClockEvent.ClickM, ClockState.Bell),
    t(ClockState.Bell, ClockEvent.ClickMode, ClockState.Bell),
    t(ClockState.Bell, ClockEvent.Tick, ClockState.Bell),
    t(ClockState.Bell, ClockEvent.LongClickMode, ClockState.Clock),
    t(ClockState.Clock, ClockEvent.Tick, ClockState.Clock),
    t(ClockState.Alarm, ClockEvent.Tick, ClockState.Alarm),
    t(
      [ClockState.Clock, ClockState.Alarm],
      ClockEvent.ActivateAlarm,
      ClockState.Bell,
      (context: IClockContext) =>
        context.isAlarmOn &&
        context.time.hours === context.alarm.hours &&
        context.time.minutes === context.alarm.minutes,
    ),
    t(ClockState.Clock, ClockEvent.ClickH, ClockState.Clock, {
      onEnter: addHours('time'),
    }),
    t(ClockState.Clock, ClockEvent.ClickM, ClockState.Clock, {
      onEnter: addMinutes('time'),
    }),
    t(ClockState.Alarm, ClockEvent.ClickH, ClockState.Alarm, {
      onEnter: addHours('alarm'),
    }),
    t(ClockState.Alarm, ClockEvent.ClickM, ClockState.Alarm, {
      onEnter: addMinutes('alarm'),
    }),
    t(ClockState.Clock, ClockEvent.LongClickMode, ClockState.Clock, {
      onEnter(context) {
        context.isAlarmOn = !context.isAlarmOn;
      },
    }),
  ],
  subscribers: {
    [ClockEvent.Tick]: [
      async function (context, minutes: number = 1) {
        const _minutes = context.time.minutes + minutes;
        const _hours = context.time.hours + Math.floor(_minutes / 60);

        context.time.minutes = _minutes % 60;
        context.time.hours = _hours % 24;
      },
      async function (this: Clock) {
        if (await this.canActivateAlarm()) {
          await this.activateAlarm();
        }
      },
    ],
  },
};

describe('Alarm clock', () => {
  it('should have default values', () => {
    const clock = new StateMachine(stateMachineParameters);

    expect(clock.context.time.hours).toBe(12);
    expect(clock.context.time.minutes).toBe(0);
    expect(clock.context.alarm.hours).toBe(6);
    expect(clock.context.alarm.minutes).toBe(0);
  });

  it('should change state when click to mode', async () => {
    const clock = new StateMachine(stateMachineParameters);
    expect(clock.context.isAlarmOn).toBe(false);
    expect(clock.current).toBe(ClockState.Clock);

    await clock.clickMode();
    expect(clock.context.isAlarmOn).toBe(false);
    expect(clock.current).toBe(ClockState.Alarm);

    await clock.clickMode();
    expect(clock.context.isAlarmOn).toBe(false);
    expect(clock.current).toBe(ClockState.Clock);

    await clock.longClickMode();
    expect(clock.context.isAlarmOn).toBe(true);
    expect(clock.current).toBe(ClockState.Clock);

    await clock.clickMode();
    expect(clock.context.isAlarmOn).toBe(true);
    expect(clock.current).toBe(ClockState.Alarm);

    await clock.clickMode();
    expect(clock.context.isAlarmOn).toBe(true);
    expect(clock.current).toBe(ClockState.Clock);

    await clock.longClickMode();
    expect(clock.context.isAlarmOn).toBe(false);
    expect(clock.current).toBe(ClockState.Clock);
  });

  it('should change hours and minutes', async () => {
    const clock = new StateMachine(stateMachineParameters);

    await clock.clickH();
    expect(clock.context.time.hours).toBe(13);
    expect(clock.context.time.minutes).toBe(0);
    expect(clock.context.alarm.hours).toBe(6);
    expect(clock.context.alarm.minutes).toBe(0);

    await clock.clickM();
    expect(clock.context.time.hours).toBe(13);
    expect(clock.context.time.minutes).toBe(1);
    expect(clock.context.alarm.hours).toBe(6);
    expect(clock.context.alarm.minutes).toBe(0);

    await clock.clickMode();

    await clock.clickH();

    expect(clock.context.time.hours).toBe(13);
    expect(clock.context.time.minutes).toBe(1);
    expect(clock.context.alarm.hours).toBe(7);
    expect(clock.context.alarm.minutes).toBe(0);

    await clock.clickM();
    expect(clock.context.time.hours).toBe(13);
    expect(clock.context.time.minutes).toBe(1);
    expect(clock.context.alarm.hours).toBe(7);
    expect(clock.context.alarm.minutes).toBe(1);

    for (let index = 0; index < 60; index += 1) {
      await clock.clickM();
    }
    expect(clock.context.alarm.minutes).toBe(1);
    expect(clock.context.alarm.hours).toBe(7);

    for (let index = 0; index < 17; index += 1) {
      await clock.clickH();
    }
    expect(clock.context.alarm.hours).toBe(0);
  });

  it('should not start bell if alarm off', async () => {
    const clock = new StateMachine(stateMachineParameters);

    await clock.tick(18 * 60);

    expect(await clock.canActivateAlarm()).toBe(false);
    expect(clock.current).toBe(ClockState.Clock);
    await clock.clickM();
    await clock.clickH();

    await clock.tick();
    expect(clock.current).toBe(ClockState.Clock);
  });

  it('should start bell if alarm on', async () => {
    const clock = new StateMachine(stateMachineParameters);

    await clock.longClickMode();

    await clock.tick(18 * 60);

    expect(clock.current).toBe(ClockState.Bell);

    await clock.clickM();
    await clock.clickH();
    await clock.tick();

    await clock.longClickMode();

    expect(clock.current).toBe(ClockState.Clock);
  });

  it('should start bell if state is Alarm', async () => {
    const clock = new StateMachine(stateMachineParameters);
    await clock.longClickMode();
    await clock.clickMode();
    expect(clock.current).toBe(ClockState.Alarm);

    await clock.tick(18 * 60);

    expect(clock.current).toBe(ClockState.Bell);

    await clock.clickMode();
    expect(clock.current).toBe(ClockState.Bell);
  });

  it('should increment minutes after Alarm', async () => {
    const clock = new StateMachine(stateMachineParameters);
    await clock.longClickMode();

    await clock.tick(18 * 60);

    expect(clock.current).toBe(ClockState.Bell);

    await clock.tick();
    await clock.longClickMode();

    expect(clock.current).toBe(ClockState.Clock);
    expect(clock.context.time.minutes).toBe(1);
  });
});

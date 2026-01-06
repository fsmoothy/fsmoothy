import { describe, expect, it } from 'vitest';
import type { FsmContext } from '../..';
import { defineEvents, defineStates, StateMachine, t } from '../..';

const ClockState = defineStates('clock', 'bell', 'alarm');
type ClockState = typeof ClockState.type;

const ClockEvent = defineEvents(
  'tick',
  'clickH',
  'clickM',
  'clickMode',
  'longClickMode',
  'activateAlarm',
);
type ClockEvent = typeof ClockEvent.type;

type ClockContext = FsmContext<{
  time: {
    minutes: number;
    hours: number;
  };
  alarm: {
    minutes: number;
    hours: number;
  };
  isAlarmOn: boolean;
}>;

type ClockAddTimeCallback = (
  type: 'time' | 'alarm',
) => (context: ClockContext) => void;

const addMinutes: ClockAddTimeCallback = (type) => (context) => {
  context.data[type].minutes = (context.data[type].minutes + 1) % 60;
};

const addHours: ClockAddTimeCallback = (type) => (context) => {
  context.data[type].hours = (context.data[type].hours + 1) % 24;
};

class AlarmClock extends StateMachine<ClockState, ClockEvent, ClockContext> {
  constructor() {
    super({
      initial: ClockState.clock,
      data: () => ({
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
        t(ClockState.clock, ClockEvent.clickMode, ClockState.alarm),
        t(ClockState.alarm, ClockEvent.clickMode, ClockState.clock),
        t(ClockState.bell, ClockEvent.clickH, ClockState.bell),
        t(ClockState.bell, ClockEvent.clickM, ClockState.bell),
        t(ClockState.bell, ClockEvent.clickMode, ClockState.bell),
        t(ClockState.bell, ClockEvent.tick, ClockState.bell),
        t(ClockState.bell, ClockEvent.longClickMode, ClockState.clock),
        t(ClockState.clock, ClockEvent.tick, ClockState.clock),
        t(ClockState.alarm, ClockEvent.tick, ClockState.alarm),
        t(
          [ClockState.clock, ClockState.alarm],
          ClockEvent.activateAlarm,
          ClockState.bell,
          (context) =>
            context.data.isAlarmOn &&
            context.data.time.hours === context.data.alarm.hours &&
            context.data.time.minutes === context.data.alarm.minutes,
        ),
        t(ClockState.clock, ClockEvent.clickH, ClockState.clock, {
          onEnter: addHours('time'),
        }),
        t(ClockState.clock, ClockEvent.clickM, ClockState.clock, {
          onEnter: addMinutes('time'),
        }),
        t(ClockState.alarm, ClockEvent.clickH, ClockState.alarm, {
          onEnter: addHours('alarm'),
        }),
        t(ClockState.alarm, ClockEvent.clickM, ClockState.alarm, {
          onEnter: addMinutes('alarm'),
        }),
        t(ClockState.clock, ClockEvent.longClickMode, ClockState.clock, {
          onEnter(context) {
            context.data.isAlarmOn = !context.data.isAlarmOn;
          },
        }),
      ],
    });

    this.on(ClockEvent.tick, this.onTick);
  }

  async onTick(context: ClockContext, minutes = 1) {
    const _minutes = context.data.time.minutes + minutes;
    const _hours = context.data.time.hours + Math.floor(_minutes / 60);

    context.data.time.minutes = _minutes % 60;
    context.data.time.hours = _hours % 24;

    if (await this.canActivateAlarm()) {
      await this.activateAlarm();
    }
  }
}

describe('Alarm clock', () => {
  it('should have default values', () => {
    const clock = new AlarmClock();

    expect(clock.data.time.hours).toBe(12);
    expect(clock.data.time.minutes).toBe(0);
    expect(clock.data.alarm.hours).toBe(6);
    expect(clock.data.alarm.minutes).toBe(0);
  });

  it('should change state when click to mode', async () => {
    const clock = new AlarmClock();
    expect(clock.data.isAlarmOn).toBe(false);
    expect(clock.current).toBe(ClockState.clock);

    await clock.clickMode();
    expect(clock.data.isAlarmOn).toBe(false);
    expect(clock.current).toBe(ClockState.alarm);

    await clock.clickMode();
    expect(clock.data.isAlarmOn).toBe(false);
    expect(clock.current).toBe(ClockState.clock);

    await clock.longClickMode();
    expect(clock.data.isAlarmOn).toBe(true);
    expect(clock.current).toBe(ClockState.clock);

    await clock.clickMode();
    expect(clock.data.isAlarmOn).toBe(true);
    expect(clock.current).toBe(ClockState.alarm);

    await clock.clickMode();
    expect(clock.data.isAlarmOn).toBe(true);
    expect(clock.current).toBe(ClockState.clock);

    await clock.longClickMode();
    expect(clock.data.isAlarmOn).toBe(false);
    expect(clock.current).toBe(ClockState.clock);
  });

  it('should change hours and minutes', async () => {
    const clock = new AlarmClock();

    await clock.clickH();
    expect(clock.data.time.hours).toBe(13);
    expect(clock.data.time.minutes).toBe(0);
    expect(clock.data.alarm.hours).toBe(6);
    expect(clock.data.alarm.minutes).toBe(0);

    await clock.clickM();
    expect(clock.data.time.hours).toBe(13);
    expect(clock.data.time.minutes).toBe(1);
    expect(clock.data.alarm.hours).toBe(6);
    expect(clock.data.alarm.minutes).toBe(0);

    await clock.clickMode();

    await clock.clickH();

    expect(clock.data.time.hours).toBe(13);
    expect(clock.data.time.minutes).toBe(1);
    expect(clock.data.alarm.hours).toBe(7);
    expect(clock.data.alarm.minutes).toBe(0);

    await clock.clickM();
    expect(clock.data.time.hours).toBe(13);
    expect(clock.data.time.minutes).toBe(1);
    expect(clock.data.alarm.hours).toBe(7);
    expect(clock.data.alarm.minutes).toBe(1);

    for (let index = 0; index < 60; index += 1) {
      await clock.clickM();
    }
    expect(clock.data.alarm.minutes).toBe(1);
    expect(clock.data.alarm.hours).toBe(7);

    for (let index = 0; index < 17; index += 1) {
      await clock.clickH();
    }
    expect(clock.data.alarm.hours).toBe(0);
  });

  it('should not start bell if alarm off', async () => {
    const clock = new AlarmClock();

    await clock.tick(18 * 60);

    expect(await clock.canActivateAlarm()).toBe(false);
    expect(clock.current).toBe(ClockState.clock);
    await clock.clickM();
    await clock.clickH();

    await clock.tick();
    expect(clock.current).toBe(ClockState.clock);
  });

  it('should start bell if alarm on', async () => {
    const clock = new AlarmClock();

    await clock.longClickMode();

    await clock.tick(18 * 60);

    expect(clock.current).toBe(ClockState.bell);

    await clock.clickM();
    await clock.clickH();
    await clock.tick();

    await clock.longClickMode();

    expect(clock.current).toBe(ClockState.clock);
  });

  it('should start bell if state is Alarm', async () => {
    const clock = new AlarmClock();
    await clock.longClickMode();
    await clock.clickMode();
    expect(clock.current).toBe(ClockState.alarm);

    await clock.tick(18 * 60);

    expect(clock.current).toBe(ClockState.bell);

    await clock.clickMode();
    expect(clock.current).toBe(ClockState.bell);
  });

  it('should increment minutes after Alarm', async () => {
    const clock = new AlarmClock();
    await clock.longClickMode();

    await clock.tick(18 * 60);

    expect(clock.current).toBe(ClockState.bell);

    await clock.tick();
    await clock.longClickMode();

    expect(clock.current).toBe(ClockState.clock);
    expect(clock.data.time.minutes).toBe(1);
  });
});

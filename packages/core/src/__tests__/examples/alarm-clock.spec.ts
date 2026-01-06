import { describe, expect, it } from 'vitest';
import type { FsmContext } from '../..';
import { StateMachine, t } from '../..';

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
      initial: ClockState.Clock,
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
          (context) =>
            context.data.isAlarmOn &&
            context.data.time.hours === context.data.alarm.hours &&
            context.data.time.minutes === context.data.alarm.minutes,
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
            context.data.isAlarmOn = !context.data.isAlarmOn;
          },
        }),
      ],
    });

    this.on(ClockEvent.Tick, this.onTick);
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
    expect(clock.current).toBe(ClockState.Clock);

    await clock.clickMode();
    expect(clock.data.isAlarmOn).toBe(false);
    expect(clock.current).toBe(ClockState.Alarm);

    await clock.clickMode();
    expect(clock.data.isAlarmOn).toBe(false);
    expect(clock.current).toBe(ClockState.Clock);

    await clock.longClickMode();
    expect(clock.data.isAlarmOn).toBe(true);
    expect(clock.current).toBe(ClockState.Clock);

    await clock.clickMode();
    expect(clock.data.isAlarmOn).toBe(true);
    expect(clock.current).toBe(ClockState.Alarm);

    await clock.clickMode();
    expect(clock.data.isAlarmOn).toBe(true);
    expect(clock.current).toBe(ClockState.Clock);

    await clock.longClickMode();
    expect(clock.data.isAlarmOn).toBe(false);
    expect(clock.current).toBe(ClockState.Clock);
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
    expect(clock.current).toBe(ClockState.Clock);
    await clock.clickM();
    await clock.clickH();

    await clock.tick();
    expect(clock.current).toBe(ClockState.Clock);
  });

  it('should start bell if alarm on', async () => {
    const clock = new AlarmClock();

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
    const clock = new AlarmClock();
    await clock.longClickMode();
    await clock.clickMode();
    expect(clock.current).toBe(ClockState.Alarm);

    await clock.tick(18 * 60);

    expect(clock.current).toBe(ClockState.Bell);

    await clock.clickMode();
    expect(clock.current).toBe(ClockState.Bell);
  });

  it('should increment minutes after Alarm', async () => {
    const clock = new AlarmClock();
    await clock.longClickMode();

    await clock.tick(18 * 60);

    expect(clock.current).toBe(ClockState.Bell);

    await clock.tick();
    await clock.longClickMode();

    expect(clock.current).toBe(ClockState.Clock);
    expect(clock.data.time.minutes).toBe(1);
  });
});

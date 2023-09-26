import { describe, expect, it, vi } from 'vitest';

import { StateMachine } from '../fsm';
import { nested } from '../nested';
import { All } from '../symbols';
import { t } from '../transition';

import { isStateMachineError } from './../fsm.error';

enum State {
  idle = 'idle',
  pending = 'pending',
  resolved = 'resolved',
  rejected = 'rejected',
}

enum Event {
  fetch = 'fetch',
  resolve = 'resolve',
  reject = 'reject',
  reset = 'reset',
}

const createFetchStateMachine = () => {
  return new StateMachine({
    id: 'fetch fsm',
    initial: State.idle,
    transitions: [
      t(State.idle, Event.fetch, State.pending),
      t(State.pending, Event.resolve, State.idle),
    ],
  });
};

describe('StateMachine', () => {
  it('should set initial as current on initialize', () => {
    const stateMachine = createFetchStateMachine();

    expect(stateMachine.current).toBe(State.idle);
  });

  it('should be possible to pass array of from', () => {
    const stateMachine = new StateMachine({
      initial: State.pending,
      transitions: [
        t([State.idle, State.pending], Event.fetch, State.pending),
        t(State.pending, Event.resolve, State.idle),
      ],
    });

    expect(stateMachine.current).toBe(State.pending);
  });

  it('should be possible to define async initialization for context', async () => {
    const stateMachine = new StateMachine({
      initial: State.idle,
      ctx: () => Promise.resolve({ foo: 'bar' }),
      transitions: [
        t(State.idle, Event.fetch, State.pending),
        t(State.pending, Event.resolve, State.idle),
      ],
    });

    await stateMachine.fetch();
    expect(stateMachine.context).toEqual({ foo: 'bar' });
  });

  describe('transition', () => {
    it('should change current state', async () => {
      const stateMachine = createFetchStateMachine();

      await stateMachine.transition(Event.fetch);
      expect(stateMachine.current).toBe(State.pending);
    });

    it('should call onEnter, onExit and onLeave with context, arguments and bound state machine', async () => {
      let handlerContext: unknown;

      const handler = vi.fn().mockImplementation(function (this: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias, unicorn/no-this-assignment
        handlerContext = this;
      });

      const stateMachine = new StateMachine({
        initial: State.idle,
        ctx: () => ({ foo: 'bar' }),
        transitions: [
          {
            from: State.idle,
            event: Event.fetch,
            to: State.pending,
            onEnter: handler,
            onExit: handler,
            onLeave: handler,
          },
          t(State.pending, Event.resolve, State.idle),
        ],
      });

      await stateMachine.transition(Event.fetch, 'test');
      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ foo: 'bar' }),
        'test',
      );
      expect(handlerContext).toBe(stateMachine);

      await stateMachine.resolve();
      expect(handler).toHaveBeenCalledTimes(3);
      expect(handlerContext).toBe(stateMachine);
    });

    it('should be able to call event by event name', async () => {
      const stateMachine = createFetchStateMachine();

      await stateMachine.fetch();
      expect(stateMachine.current).toBe(State.pending);
    });

    it('should be able to add transition after initialization', async () => {
      const callback = vi.fn();

      const stateMachine = new StateMachine({
        initial: State.idle,
        ctx: () => ({ n: 1 }),
        transitions: [
          t(State.idle, Event.fetch, State.pending, {
            onExit(context: { n: number }) {
              context.n += 1;
              return true;
            },
          }),
          {
            from: State.pending,
            event: Event.resolve,
            to: State.resolved,
            guard: () => {
              return true;
            },
            onEnter(context) {
              context.n += 1;
            },
          },
        ],
      }).on(Event.resolve, callback);

      await stateMachine.fetch();

      // @ts-expect-error - we should not be able to check type in old state machine
      stateMachine.is(State.rejected);

      const _stateMachine = stateMachine
        .addTransition(t(State.pending, Event.reject, State.rejected))
        .addTransition(
          t([State.resolved, State.rejected], Event.reset, State.idle),
        )
        // try to add transition with the same event - show warning
        .addTransition(t(State.pending, Event.reject, State.rejected));

      await _stateMachine.resolve();
      expect(_stateMachine.isResolved()).toBe(true);
      expect(_stateMachine.context).toEqual({ n: 3 });
      expect(callback).toHaveBeenCalledTimes(1);

      await _stateMachine.reset();
      expect(_stateMachine.isIdle()).toBe(true);

      await _stateMachine.fetch();
      await _stateMachine.reject();
      expect(_stateMachine.isRejected()).toBe(true);
    });

    it('should throw if transition is not possible', async () => {
      const stateMachine = createFetchStateMachine();

      await expect(stateMachine.transition(Event.resolve)).rejects.toThrow(
        'Event resolve is not allowed in state idle of fetch fsm',
      );
    });

    it("should throw if transition don't pass guard", async () => {
      const stateMachine = new StateMachine({
        id: 'guard fsm',
        initial: State.idle,
        transitions: [
          t(State.idle, Event.fetch, State.pending, () => false),
          t(State.pending, Event.resolve, State.idle),
        ],
      });

      await expect(stateMachine.transition(Event.fetch)).rejects.toThrow(
        'Event fetch is not allowed in state idle of guard fsm',
      );
    });

    it('should throw if transition is not defined', async () => {
      const stateMachine = createFetchStateMachine();

      try {
        // @ts-expect-error - we don't have this event
        await stateMachine.transition('unknown event');
      } catch (error) {
        expect(isStateMachineError(error)).toBe(true);
      }

      expect.assertions(1);
    });

    it('should be able to make transition from All states', async () => {
      const stateMachine = new StateMachine<State, Event, object>({
        initial: State.idle,
        transitions: [
          t(All, Event.reset, State.idle),
          t(State.idle, Event.fetch, State.pending),
          t(State.pending, Event.resolve, State.resolved),
          t(State.pending, Event.reject, State.rejected),
        ],
      });

      await stateMachine.fetch();
      await stateMachine.reset();
      expect(stateMachine.isIdle()).toBe(true);

      await stateMachine.fetch();
      await stateMachine.resolve();
      await stateMachine.reset();
      expect(stateMachine.isIdle()).toBe(true);

      await stateMachine.fetch();
      await stateMachine.reject();
      await stateMachine.reset();
      expect(stateMachine.isIdle()).toBe(true);
    });

    it('should be able to define conditional transitions', async () => {
      const stateMachine = new StateMachine<State, Event, { foo: string }>({
        initial: State.idle,
        ctx: () => ({ foo: 'bar' }),
        transitions: [
          t(State.idle, Event.fetch, State.pending, {
            guard: (context) => context.foo === 'bar',
          }),
          t(State.idle, Event.fetch, State.resolved, {
            guard: (context) => context.foo === 'foo',
          }),
          t(All, Event.reset, State.idle),
        ],
      });

      await stateMachine.fetch();
      expect(stateMachine.isPending()).toBe(true);

      await stateMachine.reset();
      stateMachine.context.foo = 'foo';
      await stateMachine.fetch();
      expect(stateMachine.isResolved()).toBe(true);
    });
  });

  describe('can', () => {
    it('should return true if transition is possible', async () => {
      const stateMachine = createFetchStateMachine();

      expect(await stateMachine.canFetch()).toBe(true);
    });

    it('should respect guards', async () => {
      const stateMachine = new StateMachine({
        initial: State.idle,
        transitions: [
          t(State.idle, Event.fetch, State.pending, () => false),
          t(State.pending, Event.resolve, State.idle),
        ],
      });

      expect(await stateMachine.canFetch()).toBe(false);
    });
  });

  describe('is', () => {
    it('should return true if current state is equal to passed', async () => {
      const stateMachine = createFetchStateMachine();

      expect(stateMachine.is(State.idle)).toBe(true);
    });

    it('should be able to check state by state name', async () => {
      const stateMachine = createFetchStateMachine();

      expect(stateMachine.isIdle()).toBe(true);
      expect(stateMachine.isPending()).toBe(false);
    });
  });

  describe('subscribe', () => {
    it('should be abele to subscribe to transition event', async () => {
      const stateMachine = createFetchStateMachine();

      const handler = vi.fn();

      stateMachine.on(Event.fetch, handler);

      await stateMachine.transition(Event.fetch);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should be able to unsubscribe from transition event', async () => {
      const stateMachine = new StateMachine({
        initial: State.idle,
        transitions: [t(State.idle, Event.fetch, State.pending)],
      });

      const handler = vi.fn();

      stateMachine.on(Event.fetch, handler);
      stateMachine.off(Event.fetch, handler);

      await stateMachine.transition(Event.fetch);
      expect(handler).toHaveBeenCalledTimes(0);
    });

    it('should do nothing on unsubscribe if handler is not subscribed', async () => {
      const stateMachine = createFetchStateMachine();
      const callback = vi.fn();

      stateMachine.off(Event.fetch, callback);
    });

    it('should attach subscriber on init', async () => {
      const callback = vi.fn();

      const stateMachine = new StateMachine({
        initial: State.idle,
        transitions: [t(State.idle, Event.fetch, State.pending)],
        subscribers: {
          [Event.fetch]: [callback],
        },
      });

      await stateMachine.fetch();
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should pass context and this as state machine to subscriber', async () => {
      let handlerContext: unknown;

      const callback = vi.fn().mockImplementation(function (this: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias, unicorn/no-this-assignment
        handlerContext = this;
      });

      const stateMachine = new StateMachine({
        initial: State.idle,
        ctx: () => ({ foo: 'bar' }),
        transitions: [t(State.idle, Event.fetch, State.pending)],
        subscribers: {
          [Event.fetch]: [callback],
        },
      });

      await stateMachine.fetch();
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(stateMachine.context);
      expect(handlerContext).toBe(stateMachine);
    });

    it('should be able to subscribe to All events', async () => {
      const callback = vi.fn();
      const callback2 = vi.fn();

      const stateMachine = new StateMachine({
        initial: State.idle,
        transitions: [t(State.idle, Event.fetch, State.idle)],
        subscribers: {
          [All]: [callback],
        },
      });

      await stateMachine.fetch();
      expect(callback).toHaveBeenCalledTimes(1);

      stateMachine.on(callback2);

      await stateMachine.fetch();
      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback2).toHaveBeenCalledTimes(1);

      stateMachine.off(callback);

      await stateMachine.fetch();
      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback2).toHaveBeenCalledTimes(2);
    });

    it('should throw if error is thrown in subscriber', async () => {
      const stateMachine = new StateMachine({
        initial: State.idle,
        transitions: [t(State.idle, Event.fetch, State.idle)],
        subscribers: {
          [Event.fetch]: [
            () => {
              throw new Error('test');
            },
          ],
        },
      });

      await expect(stateMachine.fetch()).rejects.toThrow('test');
    });
  });

  describe('nested', () => {
    enum NestedStates {
      walk = 'walk',
      dontWalk = 'dontWalk',
    }

    enum NestedEvents {
      toggle = 'toggle',
    }

    enum State {
      green = 'green',
      yellow = 'yellow',
      red = 'red',
    }

    enum Event {
      next = 'next',
    }

    it('should be able to define nested FSM', async () => {
      const fsm = new StateMachine<
        State | NestedStates,
        Event | NestedEvents,
        { test: string }
      >({
        id: 'fsm',
        initial: State.green,
        ctx: () => ({ test: 'bar' }),
        transitions: [
          t(State.green, Event.next, State.yellow),
          t(State.yellow, Event.next, State.red),
          t(State.red, Event.next, State.green),
        ],
        states: () => ({
          [State.red]: nested({
            id: 'nested-fsm',
            initial: NestedStates.dontWalk,
            transitions: [
              t(NestedStates.dontWalk, NestedEvents.toggle, NestedStates.walk),
            ],
          }),
        }),
      });

      await fsm.next();
      await fsm.next();
      expect(fsm.is(State.red)).toBe(true);
      await fsm.toggle();

      expect(fsm.isRed()).toBe(true);
      expect(fsm.isWalk()).toBe(true);
      await fsm.next();

      expect(fsm.is(State.green)).toBe(true);
      expect(fsm.isWalk()).toBe(false);
    });

    it('should change context of nested FSM', async () => {
      const fsm = new StateMachine<
        State | NestedStates,
        Event | NestedEvents,
        { test: string }
      >({
        id: 'fsm',
        initial: State.green,
        ctx: () => ({ test: 'bar' }),
        transitions: [
          t(State.green, Event.next, State.yellow),
          t(State.yellow, Event.next, State.red),
          t(State.red, Event.next, State.green),
        ],
        states: () => ({
          [State.red]: nested({
            id: 'nested-fsm',
            initial: NestedStates.dontWalk,
            transitions: [
              t(NestedStates.dontWalk, NestedEvents.toggle, NestedStates.walk),
            ],
            ctx: () => ({ test: 'foo' }),
            subscribers: {
              [NestedEvents.toggle]: [
                (context) => {
                  context.test = 'foo';
                },
              ],
            },
          }),
        }),
      });

      await fsm.next();
      await fsm.next();
      expect(fsm.is(State.red)).toBe(true);

      await fsm.toggle();
      expect(fsm.is(State.red)).toBe(true);
      expect(fsm.child.is(NestedStates.walk)).toBe(true);
      expect(fsm.child.context).toEqual({ test: 'foo' });

      await fsm.next();
      expect(fsm.is(State.green)).toBe(true);
      expect(fsm.child.is(NestedStates.walk)).toBe(false);
      expect(fsm.child.context).toEqual({ test: 'bar' });

      await fsm.next();
      await fsm.next();
      expect(fsm.is(State.red)).toBe(true);
      expect(fsm.child.context).toEqual({ test: 'foo' });
    });

    it('should not save nested FSM context if history is none', async () => {
      const fsm = new StateMachine<
        State | NestedStates,
        Event | NestedEvents,
        { test: string }
      >({
        id: 'fsm',
        initial: State.green,
        ctx: () => ({ test: 'bar' }),
        transitions: [
          t(State.green, Event.next, State.yellow),
          t(State.yellow, Event.next, State.red),
          t(State.red, Event.next, State.green),
        ],
        states: () => ({
          [State.red]: nested(
            {
              id: 'nested-fsm',
              initial: NestedStates.dontWalk,
              transitions: [
                t(
                  NestedStates.dontWalk,
                  NestedEvents.toggle,
                  NestedStates.walk,
                ),
              ],
              ctx: () => ({ test: 'bar' }),
              subscribers: {
                [NestedEvents.toggle]: [
                  (context) => {
                    context.test = 'foo';
                  },
                ],
              },
            },
            { history: 'none' },
          ),
        }),
      });

      await fsm.next();
      await fsm.next();
      expect(fsm.is(State.red)).toBe(true);

      await fsm.toggle();
      expect(fsm.is(State.red)).toBe(true);
      expect(fsm.child.is(NestedStates.walk)).toBe(true);
      expect(fsm.child.context).toEqual({ test: 'foo' });

      await fsm.next();
      expect(fsm.is(State.green)).toBe(true);
      expect(fsm.child.is(NestedStates.walk)).toBe(false);
      expect(fsm.child.context).toEqual({ test: 'bar' });

      await fsm.next();
      await fsm.next();
      expect(fsm.is(State.red)).toBe(true);
      expect(fsm.child.context).toEqual({ test: 'bar' });
    });

    it('should trigger subscribers on nested effects and transitions', async () => {
      const callback = vi.fn();

      let handlerContext: unknown;

      const nestedCallback = vi.fn().mockImplementation(function (
        this: unknown,
      ) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias, unicorn/no-this-assignment
        handlerContext = this;
      });

      const fsm = new StateMachine<
        State | NestedStates,
        Event | NestedEvents,
        { test: string }
      >({
        id: 'fsm',
        initial: State.green,
        ctx: () => ({ test: 'bar' }),
        transitions: [
          t(State.green, Event.next, State.yellow),
          t(State.yellow, Event.next, State.red),
          t(State.red, Event.next, State.green),
        ],
        states: () => ({
          [State.red]: nested({
            id: 'nested-fsm',
            initial: NestedStates.dontWalk,
            transitions: [
              t(NestedStates.dontWalk, NestedEvents.toggle, NestedStates.walk),
            ],
            ctx: () => ({ test: 'foo' }),
            subscribers: {
              [NestedEvents.toggle]: [nestedCallback],
            },
          }),
        }),
        subscribers: {
          [Event.next]: [callback],
        },
      });

      await fsm.next();
      await fsm.next();
      expect(fsm.is(State.red)).toBe(true);

      await fsm.toggle();
      expect(fsm.is(State.red)).toBe(true);
      expect(fsm.child.is(NestedStates.walk)).toBe(true);
      expect(fsm.child.context).toEqual({ test: 'foo' });

      await fsm.next();
      expect(fsm.is(State.green)).toBe(true);
      expect(fsm.child.is(NestedStates.walk)).toBe(false);
      expect(fsm.child.context).toEqual({ test: 'bar' });

      await fsm.next();
      await fsm.next();
      expect(fsm.is(State.red)).toBe(true);
      expect(fsm.child.context).toEqual({ test: 'foo' });

      expect(callback).toHaveBeenCalledTimes(5);
      expect(nestedCallback).toHaveBeenCalledTimes(1);
      expect(nestedCallback).toHaveBeenCalledWith(fsm.child.context);
      expect(handlerContext).toBe(fsm.child);
    });

    it('should be able to add nested states dynamically', async () => {
      const fsm = new StateMachine<
        State | NestedStates,
        Event | NestedEvents,
        never
      >({
        id: 'fsm',
        initial: State.green,
        transitions: [
          t(State.green, Event.next, State.yellow),
          t(State.yellow, Event.next, State.red),
          t(State.red, Event.next, State.green),
        ],
      });

      fsm.addNestedMachine(
        State.red,
        nested({
          id: 'nested-fsm',
          initial: NestedStates.dontWalk,
          transitions: [
            t(NestedStates.dontWalk, NestedEvents.toggle, NestedStates.walk),
          ],
        }),
      );

      await fsm.next();
      await fsm.next();
      expect(fsm.is(State.red)).toBe(true);

      await fsm.toggle();
      expect(fsm.is(State.red)).toBe(true);
      expect(fsm.child.is(NestedStates.walk)).toBe(true);

      await fsm.next();
      expect(fsm.is(State.green)).toBe(true);
    });
  });

  describe('bind', () => {
    it('should be able to bind another context to state machine callbacks', async () => {
      let handlerContext: unknown;
      let onExitCallbackContext: unknown;

      const subscribeCallback = vi.fn().mockImplementation(function (
        this: unknown,
      ) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias, unicorn/no-this-assignment
        handlerContext = this;
      });

      const callback = vi.fn().mockImplementation(function (this: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias, unicorn/no-this-assignment
        onExitCallbackContext = this;
      });

      const stateMachine = new StateMachine({
        initial: State.idle,
        ctx: () => ({ foo: 'bar' }),
        transitions: [
          t(State.idle, Event.fetch, State.pending),
          t(All, Event.resolve, State.idle, { onExit: callback }),
        ],
        subscribers: {
          [Event.fetch]: [subscribeCallback],
        },
      });

      const bound = {
        foo: 'bar',
      };

      await stateMachine.bind(bound).fetch();
      expect(subscribeCallback).toHaveBeenCalledTimes(1);
      expect(handlerContext).toBe(bound);

      await stateMachine.resolve();
      expect(callback).toHaveBeenCalledTimes(1);
      expect(onExitCallbackContext).toBe(bound);
    });

    it('should bind custom this either to subscribers and new transitions', async () => {
      let handlerContext: unknown;
      let onExitCallbackContext: unknown;

      const subscribeCallback = vi.fn().mockImplementation(function (
        this: unknown,
      ) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias, unicorn/no-this-assignment
        handlerContext = this;
      });

      const callback = vi.fn().mockImplementation(function (this: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias, unicorn/no-this-assignment
        onExitCallbackContext = this;
      });

      const stateMachine = new StateMachine<State, Event, { foo: string }>({
        initial: State.idle,
        ctx: () => ({ foo: 'bar' }),
        transitions: [t(State.idle, Event.fetch, State.pending)],
      });

      const bound = {
        foo: 'bar',
      };

      stateMachine.bind(bound);
      stateMachine.on(Event.fetch, subscribeCallback);

      stateMachine.addTransition(
        t(State.pending, Event.resolve, State.idle, {
          onEnter: callback,
        }),
      );

      await stateMachine.fetch();
      expect(subscribeCallback).toHaveBeenCalledTimes(1);
      expect(handlerContext).toBe(bound);

      await stateMachine.resolve();
      expect(callback).toHaveBeenCalledTimes(1);
      expect(onExitCallbackContext).toBe(bound);
    });
  });
});

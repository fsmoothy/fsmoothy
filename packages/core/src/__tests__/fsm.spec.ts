import { describe, expect, it, vi } from 'vitest';

import { StateMachine } from '../fsm';
import { NestedStateMachine, nested, parallel } from '../nested';
import { All } from '../symbols';
import { t } from '../transition';

import { isStateMachineError } from './../fsm.error';
import { FsmContext } from './../types';

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
      data: () => Promise.resolve({ foo: 'bar' }),
      transitions: [
        t(State.idle, Event.fetch, State.pending),
        t(State.pending, Event.resolve, State.idle),
      ],
    });

    await stateMachine.fetch();
    expect(stateMachine.data).toEqual({ foo: 'bar' });
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
        data: () => ({ foo: 'bar' }),
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
        expect.objectContaining({ data: { foo: 'bar' } }),
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

      const stateMachine = new StateMachine<
        State,
        Event,
        FsmContext<{ n: number }>
      >({
        initial: State.idle,
        data: () => ({ n: 1 }),
        transitions: [
          t(State.idle, Event.fetch, State.pending, {
            onExit(context) {
              context.data.n += 1;
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
              context.data.n += 1;
            },
          },
        ],
      }).on(Event.resolve, callback);

      await stateMachine.fetch();

      const _stateMachine = stateMachine
        .addTransition(State.pending, Event.reject, State.rejected)
        .addTransition(
          [State.resolved, State.rejected],
          Event.reset,
          State.idle,
        )
        // try to add transition with the same event - show warning
        .addTransition(State.pending, Event.reject, State.rejected);

      await _stateMachine.resolve();
      expect(_stateMachine.isResolved()).toBe(true);
      expect(_stateMachine.data).toEqual({ n: 3 });
      expect(callback).toHaveBeenCalledTimes(1);

      await _stateMachine.reset();
      expect(_stateMachine.isIdle()).toBe(true);

      await _stateMachine.fetch();
      await _stateMachine.reject();
      expect(_stateMachine.isRejected()).toBe(true);
    });

    it('should be able to remove transition', async () => {
      const stateMachine = createFetchStateMachine();

      stateMachine.removeTransition(State.idle, Event.fetch, State.pending);

      await expect(stateMachine.fetch()).rejects.toThrow(
        'Event fetch is not allowed in state idle of fetch fsm',
      );
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
      const stateMachine = new StateMachine<State, Event>({
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
      const stateMachine = new StateMachine<
        State,
        Event,
        FsmContext<{ foo: string }>
      >({
        initial: State.idle,
        data: () => ({ foo: 'bar' }),
        transitions: [
          t(
            State.idle,
            Event.fetch,
            State.pending,
            (context) => context.data.foo === 'bar',
          ),
          t(
            State.idle,
            Event.fetch,
            State.resolved,
            (context) => context.data.foo === 'foo',
          ),
          t(All, Event.reset, State.idle),
        ],
      });

      await stateMachine.fetch();
      expect(stateMachine.isPending()).toBe(true);

      await stateMachine.reset();
      stateMachine.data.foo = 'foo';
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
        data: () => ({ foo: 'bar' }),
        transitions: [t(State.idle, Event.fetch, State.pending)],
        subscribers: {
          [Event.fetch]: [callback],
        },
      });

      await stateMachine.fetch();
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({ data: stateMachine.data });
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

  describe('inject', () => {
    it('should be able to inject context', async () => {
      const service = vi.fn().mockResolvedValue({ foo: 'bar' });
      const asyncService = vi.fn().mockResolvedValue({ foo: 'bar' });
      const callback = vi.fn();

      const stateMachine = new StateMachine<
        State,
        Event,
        FsmContext<{ foo: string }> & {
          service: typeof service;
          asyncService: typeof asyncService;
        }
      >({
        initial: State.idle,
        data: () => ({ foo: 'bar' }),
        transitions: [t(State.idle, Event.fetch, State.pending)],
      })
        .inject('service', service)
        .injectAsync('asyncService', async () => asyncService);

      stateMachine.on(Event.fetch, callback);

      await stateMachine.fetch();
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({
        data: { foo: 'bar' },
        service,
        asyncService,
      });
    });

    it('should be able to inject services on initialization', async () => {
      const service = vi.fn().mockResolvedValue({ foo: 'bar' });
      const asyncService = vi.fn().mockResolvedValue({ foo: 'bar' });
      const callback = vi.fn();

      const stateMachine = new StateMachine<
        State,
        Event,
        FsmContext<{ foo: string }> & {
          service: typeof service;
          asyncService: typeof asyncService;
        }
      >({
        initial: State.idle,
        data: () => ({ foo: 'bar' }),
        transitions: [t(State.idle, Event.fetch, State.pending)],
        inject: {
          service: () => service,
          asyncService: async () => asyncService,
        },
      });

      stateMachine.on(Event.fetch, callback);

      await stateMachine.fetch();
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({
        data: { foo: 'bar' },
        service,
        asyncService,
      });
    });

    it('should propagate context even its history: none nested fsm', async () => {
      const service = vi.fn().mockResolvedValue({ foo: 'bar' });
      const callback = vi.fn();

      const stateMachine = new StateMachine<
        State,
        Event,
        FsmContext<{ foo: string }> & {
          service: typeof service;
        }
      >({
        initial: State.idle,
        data: () => ({ foo: 'bar' }),
        transitions: [t(State.idle, Event.fetch, State.pending)],
        inject: {
          service: () => service,
        },
        states: () => ({
          [State.pending]: nested({
            id: 'nested-fsm',
            history: 'none',
            initial: State.idle,
            transitions: [t(State.idle, Event.fetch, State.pending)],
            subscribers: {
              [Event.fetch]: [callback],
            },
          }),
        }),
      });

      await stateMachine.fetch();
      await stateMachine.fetch();
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({
        data: {},
        service,
      });
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
        FsmContext<{ test: string }>
      >({
        id: 'fsm',
        initial: State.green,
        data: () => ({ test: 'bar' }),
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
      expect(fsm.child).toBeTruthy();
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
        FsmContext<{ test: string }>
      >({
        id: 'fsm',
        initial: State.green,
        data: () => ({ test: 'bar' }),
        transitions: [
          t(State.green, Event.next, State.yellow),
          t(State.yellow, Event.next, State.red),
          t(State.red, Event.next, State.green),
        ],
        states: () => ({
          [State.red]: nested<
            NestedStates,
            NestedEvents,
            FsmContext<{ test: string }>
          >({
            id: 'nested-fsm',
            initial: NestedStates.dontWalk,
            transitions: [
              t(NestedStates.dontWalk, NestedEvents.toggle, NestedStates.walk),
            ],
            data: () => ({ test: 'foo' }),
            subscribers: {
              [NestedEvents.toggle]: [
                (context) => {
                  context.data.test = 'foo';
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
      expect(fsm.child?.is(NestedStates.walk)).toBe(true);
      expect(fsm.child?.data).toEqual({ test: 'foo' });

      await fsm.next();
      expect(fsm.is(State.green)).toBe(true);
      expect(fsm.child?.is(NestedStates.walk)).toBeFalsy();

      await fsm.next();
      await fsm.next();
      expect(fsm.is(State.red)).toBe(true);
      expect(fsm.child?.data).toEqual({ test: 'foo' });
    });

    it('should not save nested FSM context if history is none', async () => {
      interface Payload {
        test: string;
      }
      const fsm = new StateMachine<
        State | NestedStates,
        Event | NestedEvents,
        FsmContext<Payload>
      >({
        id: 'fsm',
        initial: State.green,
        data: () => ({ test: 'bar' }),
        transitions: [
          t(State.green, Event.next, State.yellow),
          t(State.yellow, Event.next, State.red),
          t(State.red, Event.next, State.green),
        ],
        states: () => ({
          [State.red]: nested<
            NestedStates,
            NestedEvents,
            FsmContext<{ test: string }>
          >({
            id: 'nested-fsm',
            history: 'none',
            initial: NestedStates.dontWalk,
            transitions: [
              t(NestedStates.dontWalk, NestedEvents.toggle, NestedStates.walk),
            ],
            data: () => ({ test: 'bar' }),
            subscribers: {
              [NestedEvents.toggle]: [
                (context) => {
                  context.data.test = 'foo';
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
      expect(fsm.child?.is(NestedStates.walk)).toBe(true);
      expect(fsm.child?.data).toEqual({ test: 'foo' });

      await fsm.next();
      expect(fsm.is(State.green)).toBe(true);
      expect(fsm.child?.is(NestedStates.walk)).toBeFalsy();

      await fsm.next();
      await fsm.next();
      expect(fsm.is(State.red)).toBe(true);
      expect(fsm.child?.data).toEqual({ test: 'bar' });
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
      type States = State | NestedStates;
      type Events = Event | NestedEvents;

      const fsm = new StateMachine<
        States,
        Events,
        FsmContext<{ test: string }>
      >({
        id: 'fsm',
        initial: State.green,
        data: () => ({ test: 'bar' }),
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
            data: () => ({ test: 'foo' }),
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
      expect(fsm.child?.is(NestedStates.walk)).toBe(true);
      expect(fsm.child?.data).toEqual({ test: 'foo' });

      await fsm.next();
      expect(fsm.is(State.green)).toBe(true);
      expect(fsm.child?.is(NestedStates.walk)).toBeFalsy();

      await fsm.next();
      await fsm.next();
      expect(fsm.is(State.red)).toBe(true);
      expect(fsm.child?.data).toEqual({ test: 'foo' });

      expect(callback).toHaveBeenCalledTimes(5);
      expect(nestedCallback).toHaveBeenCalledTimes(1);
      expect(nestedCallback).toHaveBeenCalledWith({ data: fsm.child?.data });
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
      expect(fsm.child?.is(NestedStates.walk)).toBe(true);

      await fsm.next();
      expect(fsm.is(State.green)).toBe(true);
    });

    it('should be able to remove nested states dynamically', async () => {
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
      expect(fsm.child).toBeTruthy();

      fsm.removeState(State.red);

      expect(fsm.isRed()).toBe(true);
      expect(fsm.child).toBeFalsy();

      await expect(fsm.toggle()).rejects.toThrow(
        'Event toggle is not allowed in state red of fsm',
      );
    });

    it('should inherit context from parent FSM', async () => {
      const service = vi.fn().mockResolvedValue({ foo: 'bar' });
      const parentService = vi.fn().mockResolvedValue({ foo: 'test' });

      type BaseFSMContext = FsmContext<{ test: string }> & {
        parentService: typeof parentService;
      };
      type NestedFSMContext = BaseFSMContext & {
        service: typeof service;
      };

      class NestedFSM extends NestedStateMachine<
        NestedStates,
        NestedEvents,
        NestedFSMContext
      > {
        constructor() {
          super({
            id: 'nested-fsm',
            initial: NestedStates.dontWalk,
            transitions: [
              t(NestedStates.dontWalk, NestedEvents.toggle, NestedStates.walk),
            ],
          });
        }
      }

      const fsm = new StateMachine<
        State | NestedStates,
        Event | NestedEvents,
        BaseFSMContext
      >({
        id: 'fsm',
        initial: State.green,
        data: () => ({ test: 'bar' }),
        transitions: [
          t(State.green, Event.next, State.yellow),
          t(State.yellow, Event.next, State.red),
          t(State.red, Event.next, State.green),
        ],
        states: () => {
          const nested = new NestedFSM();
          const nestedInNested = new NestedFSM();
          nested.addNestedMachine(NestedStates.walk, nestedInNested);
          nested.inject('service', service);

          nestedInNested.on(All, (context) => {
            context.service();
            context.parentService();
          });

          return {
            [State.red]: nested,
          };
        },
      });

      fsm.inject('parentService', parentService);

      await fsm.next();
      await fsm.next();

      expect(fsm.is(State.red)).toBe(true);
      expect(fsm.child).toBeTruthy();

      await fsm.toggle();
      await fsm.toggle();
      expect(fsm.child?.child).toBeTruthy();
      expect(fsm.child?.child?.is(NestedStates.walk)).toBe(true);
      expect(service).toHaveBeenCalledTimes(1);
      expect(parentService).toHaveBeenCalledTimes(1);
    });
  });

  describe('parallel', () => {
    it('should make transition in all nested FSMs one by one', async () => {
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

      let count = 0;

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
        states: () => ({
          [State.red]: parallel(
            nested({
              id: 'nested-fsm',
              initial: NestedStates.dontWalk,
              transitions: [
                t(
                  NestedStates.dontWalk,
                  NestedEvents.toggle,
                  NestedStates.walk,
                  {
                    onEnter() {
                      count += 1;
                    },
                  },
                ),
              ],
            }),
            nested({
              id: 'nested-fsm2',
              initial: NestedStates.dontWalk,
              transitions: [
                t(
                  NestedStates.dontWalk,
                  NestedEvents.toggle,
                  NestedStates.walk,
                  {
                    onEnter() {
                      count += 2;
                    },
                  },
                ),
              ],
            }),
            nested({
              id: 'nested-fsm3',
              initial: State.red,
              transitions: [t(State.red, Event.next, State.yellow)],
            }),
          ),
        }),
      });

      const test = parallel(
        nested({
          id: 'nested-fsm3',
          initial: State.red,
          transitions: [t(State.red, Event.next, State.yellow)],
        }),
      );
      test.machines[0].states;

      fsm.child?.is(NestedStates.walk);

      await fsm.next();
      await fsm.next();
      expect(fsm.is(State.red)).toBe(true);

      await fsm.toggle();
      expect(fsm.is(State.red)).toBe(true);
      expect(fsm.child?.is(NestedStates.walk)).toBe(true);

      await fsm.next();
      expect(fsm.child?.is(State.yellow)).toBe(true);

      await fsm.next();
      expect(fsm.is(State.green)).toBe(true);
      expect(fsm.child?.is(NestedStates.walk)).toBeFalsy();

      expect(count).toBe(3);
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
        data: () => ({ foo: 'bar' }),
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

      const stateMachine = new StateMachine<
        State,
        Event,
        FsmContext<{ foo: string }>
      >({
        initial: State.idle,
        data: () => ({ foo: 'bar' }),
        transitions: [t(State.idle, Event.fetch, State.pending)],
      });

      const bound = {
        foo: 'bar',
      };

      stateMachine.bind(bound);
      stateMachine.on(Event.fetch, subscribeCallback);

      stateMachine.addTransition(State.pending, Event.resolve, State.idle, {
        onEnter: callback,
      });

      await stateMachine.fetch();
      expect(subscribeCallback).toHaveBeenCalledTimes(1);
      expect(handlerContext).toBe(bound);

      await stateMachine.resolve();
      expect(callback).toHaveBeenCalledTimes(1);
      expect(onExitCallbackContext).toBe(bound);
    });
  });

  describe('hydrate', () => {
    it('should be able to dehydrate state machine to string', () => {
      const stateMachine = createFetchStateMachine();

      expect(stateMachine.dehydrate()).toBe(
        JSON.stringify({ current: 'idle', data: {} }),
      );
    });

    it('should be able to dehydrate state machine from string', () => {
      const stateMachine = createFetchStateMachine();

      stateMachine.hydrate(
        JSON.stringify({ current: 'pending', data: { foo: 'bar' } }),
      );

      expect(stateMachine.current).toBe(State.pending);
      expect(stateMachine.data).toEqual({ foo: 'bar' });
    });

    it('should be able to hydrate and dehydrate nested FSM', async () => {
      const fsm = new StateMachine({
        id: 'fsm',
        initial: State.idle,
        data: () => ({ foo: 'bar' }),
        transitions: [t(State.idle, Event.fetch, State.pending)],
        states: () => ({
          [State.pending]: nested({
            id: 'nested-fsm',
            initial: State.idle,
            transitions: [t(State.idle, Event.fetch, State.pending)],
          }),
        }),
      });

      await fsm.fetch();

      const dehydrated = fsm.dehydrate();

      expect(dehydrated).toBe(
        JSON.stringify({
          current: 'pending',
          data: { foo: 'bar' },
          nested: {
            current: 'idle',
            data: {},
          },
        }),
      );

      fsm.hydrate(
        JSON.stringify({
          current: State.pending,
          data: { foo: 'bar' },
          nested: {
            current: State.idle,
            data: {},
          },
        }),
      );

      expect(fsm.current).toBe(State.pending);
      expect(fsm.data).toEqual({ foo: 'bar' });
      expect(fsm.child?.current).toBe(State.idle);
      expect(fsm.child?.data).toEqual({});
    });
  });
});

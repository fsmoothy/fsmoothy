import { describe, expect, it, vi } from 'vitest';
import type { FsmContext } from '..';
import {
  All,
  isStateMachineTransitionError,
  nested,
  parallel,
  StateMachine,
  t,
} from '..';

// Using union types instead of enum (minimalist approach)
type State = 'idle' | 'pending' | 'resolved' | 'rejected';
type Event = 'fetch' | 'resolve' | 'reject' | 'reset';

const createFetchStateMachine = () => {
  return new StateMachine<State, Event>({
    id: 'fetch fsm',
    initial: 'idle',
    transitions: [
      t('idle', 'fetch', 'pending'),
      t('pending', 'resolve', 'idle'),
    ],
  });
};

describe('StateMachine', () => {
  it('should set initial as current on initialize', () => {
    const stateMachine = createFetchStateMachine();

    expect(stateMachine.current).toBe('idle');
  });

  it('should be possible to pass array of from', () => {
    const stateMachine = new StateMachine<State, Event>({
      initial: 'pending',
      transitions: [
        t(['idle', 'pending'], 'fetch', 'pending'),
        t('pending', 'resolve', 'idle'),
      ],
    });

    expect(stateMachine.current).toBe('pending');
  });

  it('should be possible to define async initialization for context', async () => {
    const stateMachine = new StateMachine<
      State,
      Event,
      FsmContext<{ foo: string }>
    >({
      initial: 'idle',
      data: () => Promise.resolve({ foo: 'bar' }),
      transitions: [
        t('idle', 'fetch', 'pending'),
        t('pending', 'resolve', 'idle'),
      ],
    });

    await stateMachine.fetch();
    expect(stateMachine.data).toEqual({ foo: 'bar' });
  });

  describe('transition', () => {
    it('should change current state', async () => {
      const stateMachine = createFetchStateMachine();

      await stateMachine.transition('fetch');
      expect(stateMachine.current).toBe('pending');
    });

    it('should call onEnter, onExit and onLeave with context, arguments and bound state machine', async () => {
      let handlerContext: unknown;

      const handler = vi.fn().mockImplementation(function (this: unknown) {
        handlerContext = this;
      });

      const stateMachine = new StateMachine<
        State,
        Event,
        FsmContext<{ foo: string }>
      >({
        initial: 'idle',
        data: () => ({ foo: 'bar' }),
        transitions: [
          {
            from: 'idle',
            event: 'fetch',
            to: 'pending',
            onEnter: handler,
            onExit: handler,
            onLeave: handler,
          },
          t('pending', 'resolve', 'idle'),
        ],
      });

      await stateMachine.transition('fetch', 'test');
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
      expect(stateMachine.current).toBe('pending');
    });

    it('should be able to add transition after initialization', async () => {
      const callback = vi.fn();

      const stateMachine = new StateMachine<
        State,
        Event,
        FsmContext<{ n: number }>
      >({
        initial: 'idle',
        data: () => ({ n: 1 }),
        transitions: [
          t('idle', 'fetch', 'pending', {
            onExit(context) {
              context.data.n += 1;
            },
          }),
          {
            from: 'pending',
            event: 'resolve',
            to: 'resolved',
            guard: () => {
              return true;
            },
            onEnter(context) {
              context.data.n += 1;
            },
          },
        ],
      }).on('resolve', callback);

      await stateMachine.fetch();

      const _stateMachine = stateMachine
        .addTransition('pending', 'reject', 'rejected')
        .addTransition(['resolved', 'rejected'], 'reset', 'idle')
        // try to add transition with the same event - show warning
        .addTransition('pending', 'reject', 'rejected');

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

      stateMachine.removeTransition('idle', 'fetch', 'pending');

      await expect(stateMachine.fetch()).rejects.toThrow(
        'Event fetch is not allowed in state idle of fetch fsm',
      );
    });

    it('should throw if transition is not possible', async () => {
      const stateMachine = createFetchStateMachine();

      await expect(stateMachine.transition('resolve')).rejects.toThrow(
        'Event resolve is not allowed in state idle of fetch fsm',
      );
    });

    it("should throw if transition don't pass guard", async () => {
      const stateMachine = new StateMachine<State, Event>({
        id: 'guard fsm',
        initial: 'idle',
        transitions: [
          t('idle', 'fetch', 'pending', () => false),
          t('pending', 'resolve', 'idle'),
        ],
      });

      await expect(stateMachine.transition('fetch')).rejects.toThrow(
        'Event fetch is not allowed in state idle of guard fsm',
      );
    });

    it('should throw if transition is not defined', async () => {
      const stateMachine = createFetchStateMachine();

      try {
        // @ts-expect-error - we don't have this event
        await stateMachine.transition('unknown event');
      } catch (error) {
        expect(isStateMachineTransitionError(error)).toBe(true);
      }

      expect.assertions(1);
    });

    it('should be able to make transition from All states', async () => {
      const stateMachine = new StateMachine<State, Event>({
        initial: 'idle',
        transitions: [
          t(All, 'reset', 'idle'),
          t('idle', 'fetch', 'pending'),
          t('pending', 'resolve', 'resolved'),
          t('pending', 'reject', 'rejected'),
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
        initial: 'idle',
        data: () => ({ foo: 'bar' }),
        transitions: [
          t(
            'idle',
            'fetch',
            'pending',
            (context) => context.data.foo === 'bar',
          ),
          t(
            'idle',
            'fetch',
            'resolved',
            (context) => context.data.foo === 'foo',
          ),
          t(All, 'reset', 'idle'),
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

  describe('tryTransition', () => {
    it('should return true if transition is possible', async () => {
      const stateMachine = createFetchStateMachine();

      expect(await stateMachine.tryTransition('fetch')).toBe(true);
    });

    it('should return false if transition is not possible', async () => {
      const stateMachine = createFetchStateMachine();

      expect(await stateMachine.tryTransition('resolve')).toBe(false);
    });

    it('should throw error if error occurs during transition', async () => {
      const stateMachine = createFetchStateMachine();
      stateMachine.on('fetch', () => {
        throw new Error('test');
      });

      await expect(stateMachine.tryTransition('fetch')).rejects.toThrow('test');
    });
  });

  describe('can', () => {
    it('should return true if transition is possible', async () => {
      const stateMachine = createFetchStateMachine();

      expect(await stateMachine.canFetch()).toBe(true);
    });

    it('should respect guards', async () => {
      const stateMachine = new StateMachine<State, Event>({
        initial: 'idle',
        transitions: [
          t('idle', 'fetch', 'pending', () => false),
          t('pending', 'resolve', 'idle'),
        ],
      });

      expect(await stateMachine.canFetch()).toBe(false);
    });
  });

  describe('is', () => {
    it('should return true if current state is equal to passed', async () => {
      const stateMachine = createFetchStateMachine();

      expect(stateMachine.is('idle')).toBe(true);
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

      stateMachine.on('fetch', handler);

      await stateMachine.transition('fetch');

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should be able to unsubscribe from transition event', async () => {
      const stateMachine = new StateMachine<State, Event>({
        initial: 'idle',
        transitions: [t('idle', 'fetch', 'pending')],
      });

      const handler = vi.fn();

      stateMachine.on('fetch', handler);
      stateMachine.off('fetch', handler);

      await stateMachine.transition('fetch');
      expect(handler).toHaveBeenCalledTimes(0);
    });

    it('should do nothing on unsubscribe if handler is not subscribed', async () => {
      const stateMachine = createFetchStateMachine();
      const callback = vi.fn();

      stateMachine.off('fetch', callback);
    });

    it('should attach subscriber on init', async () => {
      const callback = vi.fn();

      const stateMachine = new StateMachine<State, Event>({
        initial: 'idle',
        transitions: [t('idle', 'fetch', 'pending')],
        subscribers: {
          fetch: [callback],
        },
      });

      await stateMachine.fetch();
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should pass context and this as state machine to subscriber', async () => {
      let handlerContext: unknown;

      const callback = vi.fn().mockImplementation(function (this: unknown) {
        handlerContext = this;
      });

      const stateMachine = new StateMachine<
        State,
        Event,
        FsmContext<{ foo: string }>
      >({
        initial: 'idle',
        data: () => ({ foo: 'bar' }),
        transitions: [t('idle', 'fetch', 'pending')],
        subscribers: {
          fetch: [callback],
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

      const stateMachine = new StateMachine<State, Event>({
        initial: 'idle',
        transitions: [t('idle', 'fetch', 'idle')],
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
      const stateMachine = new StateMachine<State, Event>({
        initial: 'idle',
        transitions: [t('idle', 'fetch', 'idle')],
        subscribers: {
          fetch: [
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
        initial: 'idle',
        data: () => ({ foo: 'bar' }),
        transitions: [t('idle', 'fetch', 'pending')],
      })
        .inject('service', service)
        .injectAsync('asyncService', async () => asyncService);

      stateMachine.on('fetch', callback);

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
        initial: 'idle',
        data: () => ({ foo: 'bar' }),
        transitions: [t('idle', 'fetch', 'pending')],
        inject: {
          service: () => service,
          asyncService: async () => asyncService,
        },
      });

      stateMachine.on('fetch', callback);

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
        initial: 'idle',
        data: () => ({ foo: 'bar' }),
        transitions: [t('idle', 'fetch', 'pending')],
        inject: {
          service: () => service,
        },
        states: () => ({
          pending: nested({
            id: 'nested-fsm',
            history: 'none',
            initial: 'idle' as State,
            transitions: [
              t('idle' as State, 'fetch' as Event, 'pending' as State),
            ],
            subscribers: {
              fetch: [callback],
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
    // Using `as const` for nested FSM types
    const NestedStates = {
      walk: 'walk',
      dontWalk: 'dontWalk',
    } as const;
    type NestedStates = (typeof NestedStates)[keyof typeof NestedStates];

    const NestedEvents = {
      toggle: 'toggle',
    } as const;
    type NestedEvents = (typeof NestedEvents)[keyof typeof NestedEvents];

    const TrafficState = {
      green: 'green',
      yellow: 'yellow',
      red: 'red',
    } as const;
    type TrafficState = (typeof TrafficState)[keyof typeof TrafficState];

    const TrafficEvent = {
      next: 'next',
    } as const;
    type TrafficEvent = (typeof TrafficEvent)[keyof typeof TrafficEvent];

    it('should be able to define nested FSM', async () => {
      const fsm = new StateMachine<
        TrafficState | NestedStates,
        TrafficEvent | NestedEvents,
        FsmContext<{ test: string }>
      >({
        id: 'fsm',
        initial: TrafficState.green,
        data: () => ({ test: 'bar' }),
        transitions: [
          t(TrafficState.green, TrafficEvent.next, TrafficState.yellow),
          t(TrafficState.yellow, TrafficEvent.next, TrafficState.red),
          t(TrafficState.red, TrafficEvent.next, TrafficState.green),
        ],
        states: () => ({
          [TrafficState.red]: nested({
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
      expect(fsm.is(TrafficState.red)).toBe(true);
      expect(fsm.child).toBeTruthy();
      await fsm.toggle();

      expect(fsm.isRed()).toBe(true);
      expect(fsm.isWalk()).toBe(true);
      await fsm.next();

      expect(fsm.is(TrafficState.green)).toBe(true);
      expect(fsm.isWalk()).toBe(false);
    });

    it('should change context of nested FSM', async () => {
      const fsm = new StateMachine<
        TrafficState | NestedStates,
        TrafficEvent | NestedEvents,
        FsmContext<{ test: string }>
      >({
        id: 'fsm',
        initial: TrafficState.green,
        data: () => ({ test: 'bar' }),
        transitions: [
          t(TrafficState.green, TrafficEvent.next, TrafficState.yellow),
          t(TrafficState.yellow, TrafficEvent.next, TrafficState.red),
          t(TrafficState.red, TrafficEvent.next, TrafficState.green),
        ],
        states: () => ({
          [TrafficState.red]: nested<
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
      expect(fsm.is(TrafficState.red)).toBe(true);

      await fsm.toggle();
      expect(fsm.is(TrafficState.red)).toBe(true);
      expect(fsm.child?.is(NestedStates.walk)).toBe(true);
      expect(fsm.child?.data).toEqual({ test: 'foo' });

      await fsm.next();
      expect(fsm.is(TrafficState.green)).toBe(true);
      expect(fsm.child?.is(NestedStates.walk)).toBeFalsy();

      await fsm.next();
      await fsm.next();
      expect(fsm.is(TrafficState.red)).toBe(true);
      expect(fsm.child?.data).toEqual({ test: 'foo' });
    });

    it('should not save nested FSM context if history is none', async () => {
      interface Payload {
        test: string;
      }
      const fsm = new StateMachine<
        TrafficState | NestedStates,
        TrafficEvent | NestedEvents,
        FsmContext<Payload>
      >({
        id: 'fsm',
        initial: TrafficState.green,
        data: () => ({ test: 'bar' }),
        transitions: [
          t(TrafficState.green, TrafficEvent.next, TrafficState.yellow),
          t(TrafficState.yellow, TrafficEvent.next, TrafficState.red),
          t(TrafficState.red, TrafficEvent.next, TrafficState.green),
        ],
        states: () => ({
          [TrafficState.red]: nested<
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
      expect(fsm.is(TrafficState.red)).toBe(true);

      await fsm.toggle();
      expect(fsm.is(TrafficState.red)).toBe(true);
      expect(fsm.child?.is(NestedStates.walk)).toBe(true);
      expect(fsm.child?.data).toEqual({ test: 'foo' });

      await fsm.next();
      expect(fsm.is(TrafficState.green)).toBe(true);
      expect(fsm.child?.is(NestedStates.walk)).toBeFalsy();

      await fsm.next();
      await fsm.next();
      expect(fsm.is(TrafficState.red)).toBe(true);
      expect(fsm.child?.data).toEqual({ test: 'bar' });
    });

    it('should trigger subscribers on nested effects and transitions', async () => {
      const callback = vi.fn();

      let handlerContext: unknown;

      const nestedCallback = vi.fn().mockImplementation(function (
        this: unknown,
      ) {
        handlerContext = this;
      });
      type States = TrafficState | NestedStates;
      type Events = TrafficEvent | NestedEvents;

      const fsm = new StateMachine<
        States,
        Events,
        FsmContext<{ test: string }>
      >({
        id: 'fsm',
        initial: TrafficState.green,
        data: () => ({ test: 'bar' }),
        transitions: [
          t(TrafficState.green, TrafficEvent.next, TrafficState.yellow),
          t(TrafficState.yellow, TrafficEvent.next, TrafficState.red),
          t(TrafficState.red, TrafficEvent.next, TrafficState.green),
        ],
        states: () => ({
          [TrafficState.red]: nested({
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
          [TrafficEvent.next]: [callback],
        },
      });

      await fsm.next();
      await fsm.next();
      expect(fsm.is(TrafficState.red)).toBe(true);

      await fsm.toggle();
      expect(fsm.is(TrafficState.red)).toBe(true);
      expect(fsm.child?.is(NestedStates.walk)).toBe(true);
      expect(fsm.child?.data).toEqual({ test: 'foo' });

      await fsm.next();
      expect(fsm.is(TrafficState.green)).toBe(true);
      expect(fsm.child?.is(NestedStates.walk)).toBeFalsy();

      await fsm.next();
      await fsm.next();
      expect(fsm.is(TrafficState.red)).toBe(true);
      expect(fsm.child?.data).toEqual({ test: 'foo' });

      expect(callback).toHaveBeenCalledTimes(5);
      expect(nestedCallback).toHaveBeenCalledTimes(1);
      expect(nestedCallback).toHaveBeenCalledWith({ data: fsm.child?.data });
      expect(handlerContext).toBe(fsm.child);
    });

    it('should be able to add nested states dynamically', async () => {
      const fsm = new StateMachine<
        TrafficState | NestedStates,
        TrafficEvent | NestedEvents,
        never
      >({
        id: 'fsm',
        initial: TrafficState.green,
        transitions: [
          t(TrafficState.green, TrafficEvent.next, TrafficState.yellow),
          t(TrafficState.yellow, TrafficEvent.next, TrafficState.red),
          t(TrafficState.red, TrafficEvent.next, TrafficState.green),
        ],
      });

      fsm.addNestedMachine(
        TrafficState.red,
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
      expect(fsm.is(TrafficState.red)).toBe(true);

      await fsm.toggle();
      expect(fsm.is(TrafficState.red)).toBe(true);
      expect(fsm.child?.is(NestedStates.walk)).toBe(true);

      await fsm.next();
      expect(fsm.is(TrafficState.green)).toBe(true);
    });

    it('should be able to remove nested states dynamically', async () => {
      const fsm = new StateMachine<
        TrafficState | NestedStates,
        TrafficEvent | NestedEvents,
        never
      >({
        id: 'fsm',
        initial: TrafficState.green,
        transitions: [
          t(TrafficState.green, TrafficEvent.next, TrafficState.yellow),
          t(TrafficState.yellow, TrafficEvent.next, TrafficState.red),
          t(TrafficState.red, TrafficEvent.next, TrafficState.green),
        ],
        states: () => ({
          [TrafficState.red]: nested({
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
      expect(fsm.is(TrafficState.red)).toBe(true);
      expect(fsm.child).toBeTruthy();

      fsm.removeState(TrafficState.red);

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

      const fsm = new StateMachine<
        TrafficState | NestedStates,
        TrafficEvent | NestedEvents,
        BaseFSMContext
      >({
        id: 'fsm',
        initial: TrafficState.green,
        data: () => ({ test: 'bar' }),
        transitions: [
          t(TrafficState.green, TrafficEvent.next, TrafficState.yellow),
          t(TrafficState.yellow, TrafficEvent.next, TrafficState.red),
          t(TrafficState.red, TrafficEvent.next, TrafficState.green),
        ],
        states: () => {
          const _nested = nested<NestedStates, NestedEvents, NestedFSMContext>({
            id: 'nested-fsm',
            initial: NestedStates.dontWalk,
            transitions: [
              t(NestedStates.dontWalk, NestedEvents.toggle, NestedStates.walk),
            ],
          });
          const nestedInNested = nested<
            NestedStates,
            NestedEvents,
            NestedFSMContext
          >({
            id: 'nested-fsm',
            initial: NestedStates.dontWalk,
            transitions: [
              t(NestedStates.dontWalk, NestedEvents.toggle, NestedStates.walk),
            ],
          });
          _nested.addNestedMachine(NestedStates.walk, nestedInNested);
          _nested.inject('service', service);

          nestedInNested.on(All, (context) => {
            context.service();
            context.parentService();
          });

          return {
            [TrafficState.red]: _nested,
          };
        },
      });

      fsm.inject('parentService', parentService);

      await fsm.next();
      await fsm.next();

      expect(fsm.is(TrafficState.red)).toBe(true);
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
      const NestedStates = {
        walk: 'walk',
        dontWalk: 'dontWalk',
      } as const;
      type NestedStates = (typeof NestedStates)[keyof typeof NestedStates];

      const NestedEvents = {
        toggle: 'toggle',
      } as const;
      type NestedEvents = (typeof NestedEvents)[keyof typeof NestedEvents];

      const ParallelState = {
        green: 'green',
        yellow: 'yellow',
        red: 'red',
      } as const;
      type ParallelState = (typeof ParallelState)[keyof typeof ParallelState];

      const ParallelEvent = {
        next: 'next',
      } as const;
      type ParallelEvent = (typeof ParallelEvent)[keyof typeof ParallelEvent];

      let count = 0;

      const fsm = new StateMachine<
        ParallelState | NestedStates,
        ParallelEvent | NestedEvents,
        never
      >({
        id: 'fsm',
        initial: ParallelState.green,
        transitions: [
          t(ParallelState.green, ParallelEvent.next, ParallelState.yellow),
          t(ParallelState.yellow, ParallelEvent.next, ParallelState.red),
          t(ParallelState.red, ParallelEvent.next, ParallelState.green),
        ],
        states: () => ({
          [ParallelState.red]: parallel(
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
              initial: ParallelState.red,
              transitions: [
                t(ParallelState.red, ParallelEvent.next, ParallelState.yellow),
              ],
            }),
          ),
        }),
      });

      const nestedParallel = parallel(
        nested({
          id: 'nested-fsm3',
          initial: ParallelState.red,
          transitions: [
            t(ParallelState.red, ParallelEvent.next, ParallelState.yellow),
          ],
        }),
      );

      expect(await nestedParallel.machines[0].canNext()).toBe(true);
      expect(fsm.child?.isWalk()).toBeFalsy();

      await fsm.next();
      await fsm.next();
      expect(fsm.is(ParallelState.red)).toBe(true);

      await fsm.toggle();
      expect(fsm.is(ParallelState.red)).toBe(true);
      expect(fsm.child?.is(NestedStates.walk)).toBe(true);

      await fsm.next();
      expect(fsm.child?.is(ParallelState.yellow)).toBe(true);

      await fsm.next();
      expect(fsm.is(ParallelState.green)).toBe(true);
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
        handlerContext = this;
      });

      const callback = vi.fn().mockImplementation(function (this: unknown) {
        onExitCallbackContext = this;
      });

      const stateMachine = new StateMachine<
        State,
        Event,
        FsmContext<{ foo: string }>
      >({
        initial: 'idle',
        data: () => ({ foo: 'bar' }),
        transitions: [
          t('idle', 'fetch', 'pending'),
          t(All, 'resolve', 'idle', { onExit: callback }),
        ],
        subscribers: {
          fetch: [subscribeCallback],
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
        handlerContext = this;
      });

      const callback = vi.fn().mockImplementation(function (this: unknown) {
        onExitCallbackContext = this;
      });

      const stateMachine = new StateMachine<
        State,
        Event,
        FsmContext<{ foo: string }>
      >({
        initial: 'idle',
        data: () => ({ foo: 'bar' }),
        transitions: [t('idle', 'fetch', 'pending')],
      });

      const bound = {
        foo: 'bar',
      };

      stateMachine.bind(bound);
      stateMachine.on('fetch', subscribeCallback);

      stateMachine.addTransition('pending', 'resolve', 'idle', {
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
    it('should be able to dehydrate state machine to plain object', () => {
      const stateMachine = createFetchStateMachine();

      expect(stateMachine.dehydrate()).toEqual({ current: 'idle', data: {} });
    });

    it('should be able to hydrate state machine from plain object', () => {
      const stateMachine = new StateMachine<
        State,
        Event,
        FsmContext<{ foo: string }>
      >({
        id: 'fetch fsm',
        initial: 'idle',
        data: () => ({ foo: '' }),
        transitions: [
          t('idle', 'fetch', 'pending'),
          t('pending', 'resolve', 'idle'),
        ],
      });

      stateMachine.hydrate({ current: 'pending', data: { foo: 'bar' } });

      expect(stateMachine.current).toBe('pending');
      expect(stateMachine.data).toEqual({ foo: 'bar' });
    });

    it('should be able to hydrate and dehydrate nested FSM', async () => {
      const fsm = new StateMachine<State, Event, FsmContext<{ foo: string }>>({
        id: 'fsm',
        initial: 'idle',
        data: () => ({ foo: 'bar' }),
        transitions: [t('idle', 'fetch', 'pending')],
        states: () => ({
          pending: nested({
            id: 'nested-fsm',
            initial: 'idle' as State,
            transitions: [
              t('idle' as State, 'fetch' as Event, 'pending' as State),
            ],
          }),
        }),
      });

      await fsm.fetch();

      const dehydrated = fsm.dehydrate();

      expect(dehydrated).toEqual({
        current: 'pending',
        data: { foo: 'bar' },
        nested: {
          current: 'idle',
          data: {},
        },
      });

      fsm.hydrate({
        current: 'pending',
        data: { foo: 'bar' },
        nested: {
          current: 'idle',
          data: {},
        },
      });

      expect(fsm.current).toBe('pending');
      expect(fsm.data).toEqual({ foo: 'bar' });
      expect(fsm.child?.current).toBe('idle');
      expect(fsm.child?.data).toEqual({});
    });
  });

  describe('inspect', () => {
    it('should return object with current state and data', () => {
      expect(createFetchStateMachine().inspect()).toEqual({
        currentState: 'idle',
        transitions: [
          {
            from: 'idle',
            event: 'fetch',
            to: 'pending',
            hasGuard: false,
            hasOnEnter: false,
            hasOnExit: false,
            hasOnLeave: false,
          },
          {
            from: 'pending',
            event: 'resolve',
            to: 'idle',
            hasGuard: false,
            hasOnEnter: false,
            hasOnExit: false,
            hasOnLeave: false,
          },
        ],
        id: 'fetch fsm',
        states: ['idle', 'pending'],
        data: {},
      });
    });
  });
});

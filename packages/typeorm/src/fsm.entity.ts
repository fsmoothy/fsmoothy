import {
  AllowedNames,
  FsmContext,
  StateMachineParameters,
  IStateMachine,
  StateMachine,
} from '@fsmoothy/core';
import { BaseEntity, Column, getMetadataArgsStorage } from 'typeorm';

export interface IStateMachineEntityColumnParameters<
  State extends AllowedNames,
  Event extends AllowedNames,
  Context extends FsmContext<object> = FsmContext<object>,
> extends Omit<StateMachineParameters<State, Event, Context>, 'states'> {
  persistContext?: boolean;
  /**
   * @default true
   */
  saveAfterTransition?: boolean;
}

type ExtractState<Parameters extends object, Column extends keyof Parameters> =
  Parameters[Column] extends IStateMachineEntityColumnParameters<
    infer State,
    any,
    any
  >
    ? State extends AllowedNames
      ? State
      : never
    : never;

type ExtractEvent<Parameters extends object, Column extends keyof Parameters> =
  Parameters[Column] extends IStateMachineEntityColumnParameters<
    any,
    infer Event,
    any
  >
    ? Event extends AllowedNames
      ? Event
      : never
    : never;

type ExtractContext<
  Parameters extends object,
  Column extends keyof Parameters,
> =
  Parameters[Column] extends IStateMachineEntityColumnParameters<
    any,
    any,
    infer Context
  >
    ? Context extends object
      ? Context
      : never
    : never;

type BaseStateMachineEntity<
  State extends AllowedNames,
  Event extends AllowedNames,
  Context extends FsmContext<object> = FsmContext<object>,
  Column extends string = string,
> = BaseEntity & {
  [key in Column]: unknown;
} & {
  fsm: {
    [column in Column]: IStateMachine<State, Event, Context>;
  };
};

const buildAfterLoadMethodName = (column: string) =>
  `__${column}FSM__afterLoad` as const;

const buildContextColumnName = (column: string) =>
  `__${column}FSM__context` as const;

function initializeStateMachine<
  const State extends AllowedNames,
  const Event extends AllowedNames,
  Context extends FsmContext<object> = FsmContext<object>,
  const Column extends string = string,
>(
  this: BaseStateMachineEntity<State, Event, Context, Column>,
  column: Column,
  parameters: IStateMachineEntityColumnParameters<State, Event, Context>,
) {
  const {
    persistContext,
    saveAfterTransition = true,
    transitions,
    data,
  } = parameters;
  // @ts-expect-error - readonly property
  parameters.transitions = transitions?.map(function (transition) {
    return {
      ...transition,
      async onExit(this: any, context: Context, ...arguments_: Array<unknown>) {
        this[column] = transition.to;

        await transition.onExit?.call(this, context, ...arguments_);

        if (persistContext) {
          this[buildContextColumnName(column)] = JSON.stringify(context.data);
        }

        if (saveAfterTransition) {
          await this.save();
        }
      },
    };
  });

  let _data = typeof data === 'string' ? JSON.parse(data) : data;

  if (
    persistContext &&
    // @ts-expect-error - monkey patching
    Object.keys(this[buildContextColumnName(column)] as object).length > 0
  ) {
    // @ts-expect-error - monkey patching
    _data = this[buildContextColumnName(column)];
  }

  if (typeof _data !== 'function') {
    _data = () => _data;
  }

  this.fsm[column] = new StateMachine({
    ...parameters,
    initial: this[column] as State,
    data,
  });

  this.fsm[column].bind(this);
}

/**
 * Mixin to extend your entity with state machine. Extends BaseEntity.
 * @param parameters - state machine parameters
 * @param _BaseEntity - base entity class to extend from
 *
 * @example
 * import { StateMachineEntity, t } from 'typeorm-fsm';
 *
 * enum OrderState {
 *   draft = 'draft',
 *   pending = 'pending',
 *   paid = 'paid',
 *   completed = 'completed',
 * }
 *
 * enum OrderEvent {
 *   create = 'create',
 *   pay = 'pay',
 *   complete = 'complete',
 * }
 *
 * @Entity()
 * class Order extends StateMachineEntity({
 *   status: {
 *     id: 'orderStatus',
 *     initial: OrderState.draft,
 *   transitions: [
 *     t(OrderState.draft, OrderEvent.create, OrderState.pending),
 *     t(OrderState.pending, OrderEvent.pay, OrderState.paid),
 *     t(OrderState.paid, OrderEvent.complete, OrderState.completed),
 *   ],
 * }}) {}
 */
export const StateMachineEntity = function <
  const Parameters extends {
    [Column in Columns]: IStateMachineEntityColumnParameters<any, any, any>;
  },
  Entity extends BaseEntity = BaseEntity,
  const Columns extends keyof Parameters = keyof Parameters,
>(parameters: Parameters, _BaseEntity?: { new (): Entity }) {
  const _Entity = _BaseEntity ?? BaseEntity;

  class _StateMachineEntity extends _Entity {
    constructor() {
      super();
      Object.defineProperty(this, 'fsm', {
        value: {},
        writable: true,
        enumerable: false,
      });
    }
  }

  const metadataStorage = getMetadataArgsStorage();

  for (const [column, parameter] of Object.entries(parameters)) {
    const _parameter = parameter as IStateMachineEntityColumnParameters<
      AllowedNames,
      AllowedNames,
      FsmContext<object>
    >;
    const { persistContext, initial } = _parameter;

    const afterLoadMethodName = buildAfterLoadMethodName(column);

    Object.defineProperty(_StateMachineEntity.prototype, afterLoadMethodName, {
      value: function () {
        initializeStateMachine.call(this, column, _parameter);
      },
    });

    Object.defineProperty(_StateMachineEntity.prototype, column, {
      value: undefined,
      writable: true,
    });

    Reflect.decorate(
      [
        Column('text', {
          default: initial,
        }),
      ],
      _StateMachineEntity.prototype,
      column,
    );
    Reflect.metadata('design:type', String)(
      _StateMachineEntity.prototype,
      column,
    );

    if (persistContext) {
      const contextColumnName = buildContextColumnName(column);
      Object.defineProperty(_StateMachineEntity.prototype, contextColumnName, {
        value: {},
        writable: true,
      });

      Reflect.decorate(
        [
          Column({
            type: 'text',
            default: '{}',
            transformer: {
              from(value) {
                return value;
              },
              to(value) {
                return JSON.stringify(value);
              },
            },
          }),
        ],
        _StateMachineEntity.prototype,
        contextColumnName,
      );
    }

    metadataStorage.entityListeners.push(
      {
        target: _StateMachineEntity,
        propertyName: afterLoadMethodName,
        type: 'after-load',
      },
      {
        target: _StateMachineEntity,
        propertyName: afterLoadMethodName,
        type: 'after-insert',
      },
    );
  }

  return _StateMachineEntity as unknown as {
    new (): Entity & {
      params: Parameters;
      fsm: {
        [Column in keyof Parameters]: IStateMachine<
          ExtractState<Parameters, Column>,
          ExtractEvent<Parameters, Column>,
          ExtractContext<Parameters, Column>
        >;
      };
    } & {
      [Column in keyof Parameters]: ExtractState<Parameters, Column>;
    };
  };
};

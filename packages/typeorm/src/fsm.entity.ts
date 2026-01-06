import { BaseEntity, Column, getMetadataArgsStorage } from 'typeorm';

import { StateMachine } from '@fsmoothy/core';

import type {
  AllowedNames,
  FsmContext,
  IStateMachine,
  StateMachineParameters,
  Transition,
} from '@fsmoothy/core';

export interface IStateMachineEntityColumnParameters<
  State extends AllowedNames,
  Event extends AllowedNames,
  Context extends FsmContext<unknown> = FsmContext<unknown>,
> extends Omit<StateMachineParameters<State, Event, Context>, 'states'> {
  /**
   * @default true
   */
  saveAfterTransition?: boolean;
}

type ExtractState<
  Parameters extends object,
  Column extends keyof Parameters,
> = Parameters[Column] extends IStateMachineEntityColumnParameters<
  infer State,
  any,
  any
>
  ? State extends AllowedNames
    ? State
    : never
  : never;

type ExtractEvent<
  Parameters extends object,
  Column extends keyof Parameters,
> = Parameters[Column] extends IStateMachineEntityColumnParameters<
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
> = Parameters[Column] extends IStateMachineEntityColumnParameters<
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
  Context extends FsmContext<unknown> = FsmContext<unknown>,
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

const buildDehydratedColumnName = (column: string) =>
  `__${column}FSM__dehydrated` as const;

function initializeStateMachine<
  const State extends AllowedNames,
  const Event extends AllowedNames,
  Context extends FsmContext<unknown> = FsmContext<unknown>,
  const Column extends string = string,
>(
  this: BaseStateMachineEntity<State, Event, Context, Column>,
  column: Column,
  parameters: IStateMachineEntityColumnParameters<State, Event, Context>,
) {
  const dehydratedColumnName = buildDehydratedColumnName(column);
  // @ts-expect-error - monkey patching
  const dehydrated = JSON.parse(this[dehydratedColumnName]);
  dehydrated.current = this[column];
  this.fsm[column] = new StateMachine(parameters).hydrate(dehydrated);
  this.fsm[column].bind(this);
}

function wrapOnExit(
  transition: Transition<AllowedNames, AllowedNames, FsmContext<unknown>>,
  column: string,
  saveAfterTransition: boolean,
) {
  const dehydratedColumnName = buildDehydratedColumnName(column);

  return async function onExit(
    this: any,
    context: any,
    ...arguments_: Array<unknown>
  ) {
    this[column] = transition.to;
    this[dehydratedColumnName] = JSON.stringify(this.fsm[column].dehydrate());

    await transition.onExit?.call(this, context, ...arguments_);

    if (saveAfterTransition) {
      await this.save();
    }
  };
}

/**
 * Mixin to extend your entity with state machine. Extends BaseEntity.
 * @param parameters - state machine parameters
 * @param _BaseEntity - base entity class to extend from
 *
 * @example
 * import { StateMachineEntity, t } from '@fsmoothy/typeorm';
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
export const StateMachineEntity = <
  const Parameters extends {
    [Column in Columns]: IStateMachineEntityColumnParameters<any, any, any>;
  },
  Entity extends BaseEntity = BaseEntity,
  const Columns extends keyof Parameters = keyof Parameters,
>(
  parameters: Parameters,
  _BaseEntity?: { new (): Entity },
) => {
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

  for (const [column, _parameter] of Object.entries(parameters)) {
    const parameter = _parameter as IStateMachineEntityColumnParameters<
      AllowedNames,
      AllowedNames,
      FsmContext<unknown>
    >;
    const { initial, transitions, saveAfterTransition = true } = parameter;

    // @ts-expect-error - change readonly property
    parameter.transitions = transitions?.map((transition) => ({
      ...transition,
      onExit: wrapOnExit(transition, column, saveAfterTransition),
    }));

    const afterLoadMethodName = buildAfterLoadMethodName(column);

    Object.defineProperty(_StateMachineEntity.prototype, afterLoadMethodName, {
      value: function () {
        initializeStateMachine.call(this, column, parameter);
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

    const dehydratedString = JSON.stringify(
      new StateMachine(parameter).dehydrate(),
    );
    const dehydratedColumnName = buildDehydratedColumnName(column);
    Object.defineProperty(_StateMachineEntity.prototype, dehydratedColumnName, {
      value: dehydratedString,
      writable: true,
    });

    Reflect.decorate(
      [
        Column({
          type: 'text',
          default: dehydratedString,
        }),
      ],
      _StateMachineEntity.prototype,
      dehydratedColumnName,
    );

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

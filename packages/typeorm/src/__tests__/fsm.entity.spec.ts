import { defineEvents, defineStates, type FsmContext } from '@fsmoothy/core';
import {
  Column,
  DataSource,
  Entity,
  PrimaryGeneratedColumn,
  BaseEntity as TypeOrmBaseEntity,
} from 'typeorm';
import { PGliteDriver } from 'typeorm-pglite';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { StateMachineEntity, state, t } from '../';

const OrderState = defineStates(
  'draft',
  'pending',
  'paid',
  'shipped',
  'completed',
);
type OrderState = typeof OrderState.type;

const OrderEvent = defineEvents('create', 'pay', 'ship', 'complete');
type OrderEvent = typeof OrderEvent.type;

const OrderItemState = defineStates(
  'draft',
  'assembly',
  'warehouse',
  'shipping',
  'delivered',
);
type OrderItemState = typeof OrderItemState.type;

const OrderItemEvent = defineEvents(
  'create',
  'assemble',
  'transfer',
  'ship',
  'deliver',
);
type OrderItemEvent = typeof OrderItemEvent.type;

interface IOrderItemContext {
  place: string;
}

class BaseEntity extends TypeOrmBaseEntity {
  @PrimaryGeneratedColumn()
  id: string;
}

const OrderStateMachineEntity = StateMachineEntity(
  {
    status: state<OrderState, OrderEvent>({
      id: 'orderStatus',
      initial: OrderState.draft,
      transitions: [
        t(OrderState.draft, OrderEvent.create, OrderState.pending),
        t(OrderState.pending, OrderEvent.pay, OrderState.paid),
        t(OrderState.paid, OrderEvent.ship, OrderState.shipped),
        t(OrderState.shipped, OrderEvent.complete, OrderState.completed),
      ],
    }),
    itemsStatus: state<
      OrderItemState,
      OrderItemEvent,
      FsmContext<IOrderItemContext>
    >({
      id: 'orderItemsStatus',
      initial: OrderItemState.draft,
      data() {
        return {
          place: 'My warehouse',
        };
      },
      transitions: [
        t(OrderItemState.draft, OrderItemEvent.create, OrderItemState.assembly),
        t(
          OrderItemState.assembly,
          OrderItemEvent.assemble,
          OrderItemState.warehouse,
        ),
        t(
          OrderItemState.warehouse,
          OrderItemEvent.transfer,
          OrderItemState.warehouse,
          {
            guard(context, place: string) {
              return context.data.place !== place;
            },
            onExit(context, place: string) {
              context.data.place = place;
            },
          },
        ),
        t(
          [OrderItemState.assembly, OrderItemState.warehouse],
          OrderItemEvent.ship,
          OrderItemState.shipping,
        ),
        t(
          OrderItemState.shipping,
          OrderItemEvent.deliver,
          OrderItemState.delivered,
        ),
      ],
    }),
  },
  BaseEntity,
);

@Entity('order')
class Order extends OrderStateMachineEntity {
  @Column({
    default: 0,
  })
  price: number;
}

describe('StateMachineEntity', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      name: (Date.now() * Math.random()).toString(16),
      database: ':memory:',
      dropSchema: true,
      entities: [Order],
      logging: ['error', 'warn'],
      synchronize: true,
      type: 'postgres',
      driver: new PGliteDriver().driver,
    });

    await dataSource.initialize();
    await dataSource.synchronize();
  });

  afterAll(async () => {
    await dataSource.dropDatabase();
    await dataSource.destroy();
  });

  afterEach(async () => {
    await dataSource.manager.clear(Order);
  });

  it('should be able to create a new entity with default state', async () => {
    const order = new Order();

    await order.save();

    expect(order).toBeDefined();
    expect(order.fsm.status.isDraft()).toBe(true);
    expect(order.fsm.itemsStatus.isDraft()).toBe(true);
    expect(order.status).toBe(OrderState.draft);
    expect(order.itemsStatus).toBe(OrderItemState.draft);
  });

  it('state should change after event', async () => {
    const order = new Order();
    await order.save();

    await order.fsm.status.create();

    expect(order.fsm.status.isPending()).toBe(true);

    const orderFromDatabase = await dataSource.manager.findOneOrFail(Order, {
      where: {
        id: order.id,
      },
    });

    expect(orderFromDatabase.fsm.status.current).toBe(OrderState.pending);
  });

  it('should be able to pass correct contexts (this and ctx) to subscribers', async () => {
    const order = new Order();
    await order.save();

    let handlerContext!: Order;
    const handler = vi.fn().mockImplementation(function (
      this: Order,
      _context: IOrderItemContext,
    ) {
      handlerContext = this;
    });

    order.fsm.itemsStatus.on(OrderItemEvent.create, handler);

    await order.fsm.itemsStatus.create();

    expect(handlerContext).toBeInstanceOf(Order);
    expect(handler).toBeCalledTimes(1);
    expect(handler).toBeCalledWith({ data: { place: 'My warehouse' } });
  });

  it('should throw error when transition is not possible', async () => {
    const order = new Order();
    await order.save();

    await expect(order.fsm.status.pay()).rejects.toThrowError();
  });

  it('should throw error when transition guard is not passed', async () => {
    const order = new Order();
    await order.save();

    await order.fsm.itemsStatus.create();
    await order.fsm.itemsStatus.assemble();

    await order.fsm.itemsStatus.transfer('John warehouse');

    await expect(
      order.fsm.itemsStatus.transfer('John warehouse'),
    ).rejects.toThrowError();
  });

  it('should work with repositories', async () => {
    const orderRepository = dataSource.manager.getRepository(Order);
    const order = orderRepository.create();
    await orderRepository.save(order);

    await order.fsm.status.create();
    const orderFromDatabase = await orderRepository.findOneOrFail({
      where: {
        id: order.id,
      },
    });

    expect(orderFromDatabase.fsm.status.current).toBe(OrderState.pending);
  });
});

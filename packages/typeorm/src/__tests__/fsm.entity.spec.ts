import { FsmContext } from '@fsmoothy/core';
import {
  Column,
  DataSource,
  Entity,
  PrimaryGeneratedColumn,
  BaseEntity as TypeOrmBaseEntity,
} from 'typeorm';
import {
  describe,
  expect,
  it,
  vi,
  afterEach,
  beforeAll,
  afterAll,
} from 'vitest';

import { StateMachineEntity, state, t } from '../';

enum OrderState {
  Draft = 'draft',
  Pending = 'pending',
  Paid = 'paid',
  Shipped = 'shipped',
  Completed = 'completed',
}
enum OrderEvent {
  Create = 'create',
  Pay = 'pay',
  Ship = 'ship',
  Complete = 'complete',
}

enum OrderItemState {
  Draft = 'draft',
  Assembly = 'assembly',
  Warehouse = 'warehouse',
  Shipping = 'shipping',
  Delivered = 'delivered',
}
enum OrderItemEvent {
  Create = 'create',
  Assemble = 'assemble',
  Transfer = 'transfer',
  Ship = 'ship',
  Deliver = 'deliver',
}

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
      initial: OrderState.Draft,
      transitions: [
        t(OrderState.Draft, OrderEvent.Create, OrderState.Pending),
        t(OrderState.Pending, OrderEvent.Pay, OrderState.Paid),
        t(OrderState.Paid, OrderEvent.Ship, OrderState.Shipped),
        t(OrderState.Shipped, OrderEvent.Complete, OrderState.Completed),
      ],
    }),
    itemsStatus: state<
      OrderItemState,
      OrderItemEvent,
      FsmContext<IOrderItemContext>
    >({
      id: 'orderItemsStatus',
      initial: OrderItemState.Draft,
      data() {
        return {
          place: 'My warehouse',
        };
      },
      transitions: [
        t(OrderItemState.Draft, OrderItemEvent.Create, OrderItemState.Assembly),
        t(
          OrderItemState.Assembly,
          OrderItemEvent.Assemble,
          OrderItemState.Warehouse,
        ),
        t(
          OrderItemState.Warehouse,
          OrderItemEvent.Transfer,
          OrderItemState.Warehouse,
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
          [OrderItemState.Assembly, OrderItemState.Warehouse],
          OrderItemEvent.Ship,
          OrderItemState.Shipping,
        ),
        t(
          OrderItemState.Shipping,
          OrderItemEvent.Deliver,
          OrderItemState.Delivered,
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
      type: 'better-sqlite3',
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
    expect(order.status).toBe(OrderState.Draft);
    expect(order.itemsStatus).toBe(OrderItemState.Draft);
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

    expect(orderFromDatabase.fsm.status.current).toBe(OrderState.Pending);
  });

  it('should be able to pass correct contexts (this and ctx) to subscribers', async () => {
    const order = new Order();
    await order.save();

    let handlerContext!: Order;
    const handler = vi.fn().mockImplementation(function (
      this: Order,
      _context: IOrderItemContext,
    ) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias, unicorn/no-this-assignment
      handlerContext = this;
    });

    order.fsm.itemsStatus.on(OrderItemEvent.Create, handler);

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

    expect(orderFromDatabase.fsm.status.current).toBe(OrderState.Pending);
  });
});

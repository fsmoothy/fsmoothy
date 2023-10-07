import { describe, expect, it } from 'vitest';

import { StateMachine, t, FsmContext } from '../..';

enum OrderItemState {
  draft = 'draft',
  assembly = 'assembly',
  warehouse = 'warehouse',
  shipping = 'shipping',
  delivered = 'delivered',
}

enum OrderItemEvent {
  create = 'create',
  assemble = 'assemble',
  transfer = 'transfer',
  ship = 'ship',
  deliver = 'deliver',
}

interface IOrderItemContext {
  place: string;
}

class OrderItemStatus extends StateMachine<
  OrderItemState,
  OrderItemEvent,
  FsmContext<IOrderItemContext>
> {
  constructor() {
    super({
      initial: OrderItemState.draft,
      data: () => ({
        place: 'My warehouse',
      }),
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
    });
  }
}

describe('Order item FSM', () => {
  it('should be able to pass all transitions', async () => {
    const orderItemFSM = new OrderItemStatus();

    expect(orderItemFSM.current).toBe(OrderItemState.draft);

    await orderItemFSM.transition(OrderItemEvent.create);
    expect(orderItemFSM.current).toBe(OrderItemState.assembly);

    await orderItemFSM.transition(OrderItemEvent.assemble);
    expect(orderItemFSM.current).toBe(OrderItemState.warehouse);

    await orderItemFSM.transition(OrderItemEvent.transfer, 'Another warehouse');
    expect(orderItemFSM.current).toBe(OrderItemState.warehouse);

    await orderItemFSM.transition(OrderItemEvent.ship);
    expect(orderItemFSM.current).toBe(OrderItemState.shipping);

    await orderItemFSM.transition(OrderItemEvent.deliver);
    expect(orderItemFSM.current).toBe(OrderItemState.delivered);
  });
});

import { describe, expect, it } from 'vitest';
import type { FsmContext } from '../..';
import { defineEvents, defineStates, StateMachine, t } from '../..';

// Using defineStates/defineEvents helpers instead of enum
const State = defineStates('idle', 'dispensing', 'productSelected');
type State = typeof State.type;

const Event = defineEvents(
  'selectProduct',
  'depositCoin',
  'confirmPurchase',
  'reset',
);
type Event = typeof Event.type;

interface IProduct {
  name: string;
  price: number;
}

interface IVendingMachineContext {
  products: Map<number, IProduct>;
  selectedProductId: number | null;
  depositedCoins: number;
}

class VendingMachine extends StateMachine<
  State,
  Event,
  FsmContext<IVendingMachineContext>
> {
  constructor() {
    super({
      initial: State.idle,
      data: () => ({
        products: new Map([
          [1, { name: 'Coke', price: 100 }],
          [2, { name: 'Pepsi', price: 100 }],
          [3, { name: 'Fanta', price: 100 }],
        ]),
        selectedProductId: null,
        depositedCoins: 0,
      }),
      transitions: [
        t(State.idle, Event.selectProduct, State.productSelected, {
          onEnter(context, productId: number) {
            context.data.selectedProductId = productId;
          },
        }),
        t(State.idle, Event.depositCoin, State.idle, {
          onEnter(context, coin: number) {
            context.data.depositedCoins += coin;
          },
        }),
        t(State.productSelected, Event.depositCoin, State.productSelected, {
          onEnter(context, coin: number) {
            context.data.depositedCoins += coin;
          },
        }),
        t(State.productSelected, Event.confirmPurchase, State.dispensing, {
          onExit(context) {
            context.data.depositedCoins -=
              context.data.products.get(context.data.selectedProductId!)
                ?.price ?? 0;
          },
          guard(context) {
            if (!context.data.selectedProductId) {
              return false;
            }

            const productPrice =
              context.data.products.get(context.data.selectedProductId)
                ?.price ?? 0;

            return context.data.depositedCoins >= productPrice;
          },
        }),
        t(State.dispensing, Event.reset, State.idle),
      ],
    });
  }
}

describe('Vending Machine', () => {
  it('should dispense product when enough coins are deposited', async () => {
    const vendingMachineStateMachine = new VendingMachine();

    expect(vendingMachineStateMachine.isIdle()).toBeTruthy();

    await vendingMachineStateMachine.selectProduct(1);
    expect(vendingMachineStateMachine.current).toBe(State.productSelected);

    await vendingMachineStateMachine.depositCoin(100);
    expect(vendingMachineStateMachine.current).toBe(State.productSelected);

    await vendingMachineStateMachine.depositCoin(100);
    expect(vendingMachineStateMachine.current).toBe(State.productSelected);

    await vendingMachineStateMachine.confirmPurchase();
    expect(vendingMachineStateMachine.current).toBe(State.dispensing);

    await vendingMachineStateMachine.reset();
    expect(vendingMachineStateMachine.current).toBe(State.idle);
  });
});

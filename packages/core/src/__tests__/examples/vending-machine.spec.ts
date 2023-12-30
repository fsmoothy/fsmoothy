import { describe, expect, it } from 'vitest';

import { FsmContext, StateMachine, t } from '../..';

enum State {
  Idle = 'idle',
  Dispensing = 'dispensing',
  ProductSelected = 'productSelected',
}

enum Event {
  SelectProduct = 'selectProduct',
  DepositCoin = 'depositCoin',
  ConfirmPurchase = 'confirmPurchase',
  Reset = 'reset',
}

interface IVendingMachineContext {
  products: Map<number, { name: string; price: number }>;
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
      initial: State.Idle,
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
        t(State.Idle, Event.SelectProduct, State.ProductSelected, {
          onEnter(context, productId: number) {
            context.data.selectedProductId = productId;
          },
        }),
        t(State.Idle, Event.DepositCoin, State.Idle, {
          onEnter(context, coin: number) {
            context.data.depositedCoins += coin;
          },
        }),
        t(State.ProductSelected, Event.DepositCoin, State.ProductSelected, {
          onEnter(context, coin: number) {
            context.data.depositedCoins += coin;
          },
        }),
        t(State.ProductSelected, Event.ConfirmPurchase, State.Dispensing, {
          onExit(context) {
            context.data.depositedCoins -=
              context.data.products.get(context.data.selectedProductId!)
                ?.price ?? 0;
          },
          guard(context) {
            return Boolean(
              context.data.selectedProductId &&
                context.data.depositedCoins >=
                  (context.data.products.get(context.data.selectedProductId)
                    ?.price ?? 0),
            );
          },
        }),
        t(State.Dispensing, Event.Reset, State.Idle),
      ],
    });
  }
}

describe('Vending Machine', () => {
  it('should dispense product when enough coins are deposited', async () => {
    const vendingMachineStateMachine = new VendingMachine();

    expect(vendingMachineStateMachine.isIdle()).toBeTruthy();

    await vendingMachineStateMachine.selectProduct(1);
    expect(vendingMachineStateMachine.current).toBe(State.ProductSelected);

    await vendingMachineStateMachine.depositCoin(100);
    expect(vendingMachineStateMachine.current).toBe(State.ProductSelected);

    await vendingMachineStateMachine.depositCoin(100);
    expect(vendingMachineStateMachine.current).toBe(State.ProductSelected);

    await vendingMachineStateMachine.confirmPurchase();
    expect(vendingMachineStateMachine.current).toBe(State.Dispensing);

    await vendingMachineStateMachine.reset();
    expect(vendingMachineStateMachine.current).toBe(State.Idle);
  });
});

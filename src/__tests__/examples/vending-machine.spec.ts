import { StateMachine, IStateMachineParameters, t } from '../..';

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

const vendingMachineStateMachineParameters: IStateMachineParameters<
  State,
  Event,
  IVendingMachineContext
> = {
  initial: State.Idle,
  ctx: () => ({
    products: new Map([
      [1, { name: 'Coke', price: 100 }],
      [2, { name: 'Pepsi', price: 100 }],
      [3, { name: 'Fanta', price: 100 }],
    ]),
    selectedProductId: null,
    depositedCoins: 0,
  }),
  transitions: [
    {
      from: State.Idle,
      event: Event.SelectProduct,
      to: State.ProductSelected,
      onEnter(context, productId: number) {
        context.selectedProductId = productId;
      },
    },
    {
      from: State.Idle,
      event: Event.DepositCoin,
      to: State.Idle,
      onEnter(context, coin: number) {
        context.depositedCoins += coin;
      },
    },
    {
      from: State.ProductSelected,
      event: Event.DepositCoin,
      to: State.ProductSelected,
      onEnter(context, coin: number) {
        context.depositedCoins += coin;
      },
    },
    {
      from: State.ProductSelected,
      event: Event.ConfirmPurchase,
      to: State.Dispensing,
      onExit(context) {
        context.depositedCoins -=
          context.products.get(context.selectedProductId!)?.price ?? 0;
      },
      guard(context) {
        return Boolean(
          context.selectedProductId &&
            context.depositedCoins >=
              (context.products.get(context.selectedProductId)?.price ?? 0),
        );
      },
    },
    t(State.Dispensing, Event.Reset, State.Idle),
  ],
};

const createVendingMachineStateMachine = () =>
  new StateMachine(vendingMachineStateMachineParameters);

describe('Vending Machine', () => {
  it('should dispense product when enough coins are deposited', async () => {
    const vendingMachineStateMachine = createVendingMachineStateMachine();

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

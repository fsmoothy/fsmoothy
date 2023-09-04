[<img src="logo/fsmoothy-logo.svg" alt="FSMoothy" width="233px">](https://github.com/fsmoothy/fsmoothy)

[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/) [![Maintainability](https://api.codeclimate.com/v1/badges/e8f2724e27b28e3afc6b/maintainability)](https://codeclimate.com/github/fsmoothy/fsmoothy/maintainability) [![Test Coverage](https://api.codeclimate.com/v1/badges/e8f2724e27b28e3afc6b/test_coverage)](https://codeclimate.com/github/fsmoothy/fsmoothy/test_coverage)

`fsmoothy` is a TypeScript library for building functional state machines. It's inspired by [aasm](https://github.com/aasm/aasm) and provide magic methods for transitions.

## Index

- [Usage](#usage)
  - [Events and States](#events-and-states)
  - [StateMachineEntity](#statemachineentity)
  - [Transitions](#transitions)
  - [Make transition](#make-transition)
  - [Current state](#current-state)
  - [Transition availability](#transition-availability)
  - [Subscribers](#subscribers)
  - [Lifecycle](#lifecycle)
  - [Bound lifecycle methods](#bound-lifecycle-methods)
  - [Error handling](#error-handling)
- [Installation](#installation)
- [Examples](#examples)
- [Latest Changes](#latest-changes)

## Usage

Let's create a basic order state machine to showcase the features of the library. The diagram below illustrates the states and transitions of the state machine.

```mermaid
stateDiagram-v2
  draft --> assembly: create
  assembly --> warehouse: assemble
  assembly --> shipping: ship
  warehouse --> warehouse: transfer
  warehouse --> shipping: ship
  shipping --> delivered: deliver
```

### Events and States

The library was initially designed to use `enums` for events and states. However, using string enums would provide more convenient method names. It is also possible to use `string` or `number` as event or state types, but this approach is not recommended.

```typescript
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
```

### State Machine

To create state machine, we need to instantiate `StateMachine` class and pass the initial state and the state transition table to the constructor.

```typescript
import { StateMachine, t } from 'fsmoothy';

const orderItemFSM = new StateMachine({
  id: 'orderItemsStatus',
  initial: OrderItemState.draft,
  ctx: {
    place: 'My warehouse',
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
        guard(context: IOrderItemContext, place: string) {
          return context.place !== place;
        },
        onExit(context: IOrderItemContext, place: string) {
          context.place = place;
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
```

### StateMachineEntity

Let's take a look at the `StateMachineEntity` function. It accepts an object with the following properties:

- `id` - a unique identifier for the state machine (used for debugging purposes)
- `initial` - the initial state of the state machine
- `persistContext` - if set to `true`, the state machine context will be saved to the database. Default value is `false`
- `saveAfterTransition` - if `true`, the state machine will be saved to the database after each transition. Default value is `true`
- `ctx` - initial context of the state machine
- `transitions` - an array of transitions

### Transitions

The most common way to define a transition is by using the `t` function, which requires three arguments (guard is optional).

```typescript
t(from: State | State[], event: Event, to: State, guard?: (context: Context) => boolean);
```

We also able to pass optional `onEnter` and `onExit` functions to the transition as options:

```typescript
t(
  from: State | State[],
  event: Event,
  to: State,
  options?: {
    guard?: (context: Context) => boolean;
    onEnter?: (context: Context) => void;
    onExit?: (context: Context) => void;
  },
);
```

In such cases, we're using next options:

- `from` - represents the state from which the transition is permitted
- `event` - denotes the event that triggers the transition
- `to` - indicates the state to which the transition leads
- `guard` - a function that verifies if the transition is permissible
- `onEnter` - a function that executes when the transition is triggered
- `onExit` - a function that executes when the transition is completed

### Make transition

To make a transition, we need to call the `transition` method of the entity or use methods with the same name as the event. State changes will persist to the database by default.

```typescript
await orderItemFSM.create();
await orderItemFSM.assemble();
await orderItemFSM.transfer('Another warehouse');
await orderItemFSM.ship();
```

We're passing the `place` argument to the `transfer` method. It will be passed to the `guard` and `onExit` functions.

### Dynamic add transitions

We can add transition dynamically using the `addTransition` method.

```typescript
const newOrderItemFSM = orderItemFSM.addTransition([
  t(
    OrderItemState.shipping,
    OrderItemEvent.transfer,
    OrderItemState.shipping,
    {
      guard(context: IOrderItemContext, place: string) {
        return context.place !== place;
      },
      onExit(context: IOrderItemContext, place: string) {
        context.place = place;
      },
    },
  ),
]);
```

It returns a new instance of the state machine with the added transition. Context and current state will be copied to the new instance.

### Current state

You can get the current state of the state machine using the `current` property.

```typescript
console.log(orderItemFSM.current); // draft
```

Also you can use `is` + `state name` method to check the current state.

```typescript
console.log(orderItemFSM.isDraft()); // true
```

Also `is(state: State)` method is available.

### Transition availability

You can check if the transition is available using the `can` + `event name` method.

```typescript
console.log(orderItemFSM.canCreate()); // true
await orderItemFSM.create();
console.log(orderItemFSM.canCreate()); // false
await orderItemFSM.assemble();
```

Arguments are passed to the `guard` function.

``` typescript
await orderItemFSM.transfer('Another warehouse');
console.log(orderItemFSM.canTransfer('Another warehouse')); // false
```

Also `can(event: Event, ...args)` method is available.

### Subscribers

You can subscribe to transition using the `on` method. And unsubscribe using the `off` method.

```typescript
const subscriber = (state: OrderItemState) => {
  console.log(state);
};
orderItemFSM.on(OrderItemEvent.create, subscriber);

await orderItemFSM.create();

orderItemFSM.off(OrderItemEvent.create, subscriber);
```

Also you're able to subscribe to transaction on initialization.

```typescript
const orderItemFSM = new StateMachine({
  initial: OrderItemState.draft,
  transitions: [
    t(OrderItemState.draft, OrderItemEvent.create, OrderItemState.assembly),
    t(
      OrderItemState.assembly,
      OrderItemEvent.assemble,
      OrderItemState.warehouse,
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
  subscribers: {
    [OrderItemEvent.create]: [(state: OrderItemState) => {
      console.log(state);
    }]
  }
});
```

### Lifecycle

The state machine has the following lifecycle methods in the order of execution:

```
- guard
- onEnter
- transition
- subscribers
- onExit
```

### Bound lifecycle methods

You can access the fsm instance using `this` keyword.

```typescript
orderItemFSM.onEnter(function () {
  console.log(this.current);
});
orderItemFSM.on(OrderItemEvent.create, function () {
  console.log(this.current);
});

await orderItemFSM.create();
```

### Error handling

Library throws `StateMachineError` if transition is not available. It can be caught using `try/catch` and checked using `isStateMachineError` function.

```typescript
import { isStateMachineError } from 'typeorm-fsm';

try {
  await orderItemFSM.create();
} catch (error) {
  if (isStateMachineError(error)) {
    console.log(error.message);
  }
}
```

## Installation

```bash
npm install fsmoothy
```

## Examples

Check out the [examples](./src/__tests__/examples) directory for more examples.

## Latest Changes

Take a look at the [CHANGELOG](CHANGELOG.md) for details about recent changes to the current version.

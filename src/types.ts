export type AllowedNames = string | number;

export type FsmContext<D extends object = never> = {
  data: D;
};

export interface Callback<
  Context extends FsmContext<object>,
  T extends Array<any> = Array<any>,
> {
  (context: Context, ...arguments_: T): Promise<void> | void;
}

export interface Guard<
  Context extends FsmContext<object>,
  T extends Array<any> = Array<any>,
> {
  (context: Context, ...arguments_: T): Promise<boolean> | boolean;
}

export interface Transition<
  State extends AllowedNames | Array<AllowedNames>,
  Event extends AllowedNames,
  Context extends FsmContext<object>,
> {
  from: Array<State> | State;
  event: Event;
  to: State;
  onEnter?: Callback<Context>;
  onExit?: Callback<Context>;
  onLeave?: Callback<Context>;
  guard?: Guard<Context>;
}

export type Subscribers<
  Event extends AllowedNames,
  Context extends FsmContext<object>,
> = {
  [key in Event]?: Array<Callback<Context>>;
};

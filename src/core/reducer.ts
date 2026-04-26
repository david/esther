import type { z } from "zod";

const reducerBrand: unique symbol = Symbol("esther.reducer");

export type ReducerEvent<TSchemas extends ReadonlyArray<z.ZodType>> = z.infer<TSchemas[number]>;

export type ReducerDefinition<
  TName extends string,
  TState,
  TSchemas extends ReadonlyArray<z.ZodType>,
> = {
  readonly [reducerBrand]: true;
  readonly name: TName;
  readonly schemas: TSchemas;
  readonly initial: TState;
  readonly reduce: (state: TState, event: ReducerEvent<TSchemas>) => TState;
  readonly fold: (events: ReadonlyArray<ReducerEvent<TSchemas>>) => TState;
};

export function defineReducer<
  const TName extends string,
  TState,
  const TSchemas extends ReadonlyArray<z.ZodType>,
>(descriptor: {
  readonly name: TName;
  readonly schemas: TSchemas;
  readonly initial: TState;
  readonly reduce: (state: TState, event: ReducerEvent<TSchemas>) => TState;
}): ReducerDefinition<TName, TState, TSchemas> {
  return {
    [reducerBrand]: true,
    name: descriptor.name,
    schemas: descriptor.schemas,
    initial: descriptor.initial,
    reduce: descriptor.reduce,
    fold: (events) => events.reduce(descriptor.reduce, descriptor.initial),
  };
}

export type SqlJsonPrimitive = string | number | boolean | null;

export type SqlJsonInput =
  | SqlJsonPrimitive
  | { readonly [key: string]: SqlJsonInput }
  | ReadonlyArray<SqlJsonInput>;

export type SqlScalarValue = string | number | boolean | bigint | Date | Uint8Array;

export type SqlJsonValue = {
  readonly __sqlJsonBrand?: unique symbol;
};

export type SqlParameter = SqlScalarValue | SqlJsonInput | SqlJsonValue;

export type SqlValueMap = {
  readonly [key: string]: SqlParameter;
};

type SqlHelperFragment = {
  readonly first: unknown;
  readonly rest: ReadonlyArray<unknown>;
};

type SqlIdentifierFragment = {
  readonly sql: string;
};

type SqlObjectHelperFragment = {
  readonly obj: SqlValueMap;
  readonly keys: ReadonlyArray<string>;
};

export type SqlFragment =
  | PromiseLike<SqlQueryRows>
  | SqlHelperFragment
  | SqlIdentifierFragment
  | SqlObjectHelperFragment;

export type SqlQueryRows = ReadonlyArray<unknown>;

export async function executeSqlQuery(query: SqlFragment): Promise<SqlQueryRows> {
  return (await (query as unknown as Promise<SqlQueryRows>)) satisfies SqlQueryRows;
}

export type SqlJsonFn = ((value: SqlJsonInput) => SqlJsonValue) & {
  readonly calls?: ReadonlyArray<unknown>;
};

export type PostgresTransactionClient = {
  (template: TemplateStringsArray, ...values: unknown[]): SqlFragment;
  (first: string | readonly string[] | SqlValueMap, ...rest: string[]): SqlFragment;
  readonly json: SqlJsonFn;
};

export type PostgresClient = PostgresTransactionClient & {
  readonly begin: <T>(fn: (sql: PostgresTransactionClient) => Promise<T>) => Promise<T>;
};

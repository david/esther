export type SqlValueMap = {
  readonly [key: string]: unknown;
};

export type SqlFragment = {
  readonly __sqlFragmentBrand?: unique symbol;
};

export type SqlQueryRows = ReadonlyArray<unknown>;

export type SqlPendingQuery = PromiseLike<SqlQueryRows> & SqlFragment;

export type SqlJsonValue = {
  readonly __sqlJsonBrand?: unique symbol;
};

export type SqlJsonFn = ((value: unknown) => SqlJsonValue) & {
  readonly calls?: ReadonlyArray<unknown>;
};

export type PostgresTransactionClient = {
  (template: TemplateStringsArray, ...values: unknown[]): SqlPendingQuery;
  (first: string | readonly string[] | SqlValueMap, ...rest: string[]): SqlFragment;
  readonly json: SqlJsonFn;
};

export type PostgresClient = PostgresTransactionClient & {
  readonly begin: <T>(fn: (sql: PostgresTransactionClient) => Promise<T>) => Promise<T>;
};

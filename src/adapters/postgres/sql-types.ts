export type SqlValueMap = {
  readonly [key: string]: unknown;
};

export type SqlFragment = {
  readonly __sqlFragmentBrand?: unique symbol;
};

export type SqlQueryRows = ReadonlyArray<unknown>;

export type SqlPendingQuery = PromiseLike<SqlQueryRows> & SqlFragment;

export type PostgresTransactionClient = {
  (template: TemplateStringsArray, ...values: unknown[]): SqlPendingQuery;
  (first: string | readonly string[] | SqlValueMap, ...rest: string[]): SqlFragment;
};

export type PostgresClient = PostgresTransactionClient & {
  readonly begin: <T>(fn: (sql: PostgresTransactionClient) => Promise<T>) => Promise<T>;
};

import type {
  PostgresClient,
  SqlJsonFn,
  SqlPendingQuery,
  SqlQueryRows,
  SqlValueMap,
} from "./sql-types.js";

// Tagged-template mock for postgres adapter tests.
//
// Wraps an `unsafe(query, params)` handler (the existing test harness
// interface) and returns a callable that supports:
//   - Tagged templates: sql`SELECT ... WHERE ${sql(col)} = ${val}`
//   - Identifier helpers: sql('table'), sql(['col1', 'col2'])
//   - Object helpers: sql(obj, ...keys) for INSERT/UPDATE SET

type MockQueryExecutor = (query: string, params: ReadonlyArray<unknown>) => Promise<SqlQueryRows>;

type MockFragment = {
  readonly __mock: "fragment";
  readonly strings: readonly string[];
  readonly values: readonly unknown[];
};

type MockIdent = {
  readonly __mock: "ident";
  readonly sql: string;
};

type MockHelper = {
  readonly __mock: "helper";
  readonly obj: SqlValueMap;
  readonly keys: readonly string[];
};

type MockJson = {
  readonly __mock: "json";
  readonly value: unknown;
};

type MockQuery = MockFragment & SqlPendingQuery;

function isMockFragment(v: unknown): v is MockFragment {
  return typeof v === "object" && v !== null && (v as MockFragment).__mock === "fragment";
}

function isMockIdent(v: unknown): v is MockIdent {
  return typeof v === "object" && v !== null && (v as MockIdent).__mock === "ident";
}

function isMockHelper(v: unknown): v is MockHelper {
  return typeof v === "object" && v !== null && (v as MockHelper).__mock === "helper";
}

function isMockJson(v: unknown): v is MockJson {
  return typeof v === "object" && v !== null && (v as MockJson).__mock === "json";
}

function unwrapJson(v: unknown): unknown {
  return isMockJson(v) ? v.value : v;
}

function flatten(fragment: MockFragment): { sql: string; params: unknown[] } {
  const params: unknown[] = [];

  function emitHelper(helper: MockHelper, precedingSql: string): string {
    const preceding = precedingSql.trimEnd().toUpperCase();
    if (/INTO\s+"?\w+"?\s*$/.test(preceding)) {
      const cols = helper.keys.map((k) => `"${k}"`).join(", ");
      const phs = helper.keys
        .map((k) => {
          params.push(unwrapJson(helper.obj[k]));
          return `$${params.length}`;
        })
        .join(", ");
      return `(${cols}) VALUES (${phs})`;
    }
    return helper.keys
      .map((k) => {
        params.push(unwrapJson(helper.obj[k]));
        return `"${k}" = $${params.length}`;
      })
      .join(", ");
  }

  function emit(frag: MockFragment): string {
    let sql = "";
    for (let i = 0; i < frag.strings.length; i++) {
      sql += frag.strings[i];
      if (i < frag.values.length) {
        const val = frag.values[i];
        if (isMockFragment(val)) {
          sql += emit(val);
        } else if (isMockIdent(val)) {
          sql += val.sql;
        } else if (isMockHelper(val)) {
          sql += emitHelper(val, sql);
        } else {
          params.push(unwrapJson(val));
          sql += `$${params.length}`;
        }
      }
    }
    return sql;
  }

  return { sql: emit(fragment), params };
}

function isTemplateStringsArray(
  value: TemplateStringsArray | string | readonly string[] | SqlValueMap,
): value is TemplateStringsArray {
  return Array.isArray(value) && "raw" in value;
}

function isSqlValueMap(
  value: TemplateStringsArray | string | readonly string[] | SqlValueMap,
): value is SqlValueMap {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !("raw" in value);
}

export function createMockSql(executeQuery: MockQueryExecutor): PostgresClient {
  function sql(template: TemplateStringsArray, ...values: unknown[]): MockQuery;
  function sql(
    first: string | readonly string[] | SqlValueMap,
    ...rest: string[]
  ): MockIdent | MockHelper;
  function sql(
    first: TemplateStringsArray | string | readonly string[] | SqlValueMap,
    ...rest: unknown[]
  ): MockQuery | MockIdent | MockHelper {
    if (isTemplateStringsArray(first)) {
      const fragment: MockFragment = {
        __mock: "fragment",
        strings: first,
        values: rest,
      };

      const query: MockQuery = {
        ...fragment,
        then(onfulfilled, onrejected) {
          return Promise.resolve()
            .then(() => {
              const { sql: text, params } = flatten(fragment);
              return executeQuery(text, params);
            })
            .then(onfulfilled, onrejected);
        },
      };

      return query;
    }

    if (typeof first === "string" && rest.length === 0) {
      return { __mock: "ident", sql: `"${first}"` } satisfies MockIdent;
    }

    if (Array.isArray(first) && rest.length === 0) {
      return {
        __mock: "ident",
        sql: first.map((column) => `"${column}"`).join(", "),
      } satisfies MockIdent;
    }

    if (isSqlValueMap(first)) {
      return {
        __mock: "helper",
        obj: first,
        keys: rest.filter((value): value is string => typeof value === "string"),
      } satisfies MockHelper;
    }

    throw new Error("mock-sql: unexpected call pattern");
  }

  const jsonCalls: unknown[] = [];
  const json: SqlJsonFn = Object.assign(
    (value: unknown): MockJson => {
      jsonCalls.push(value);
      return { __mock: "json", value };
    },
    { calls: jsonCalls },
  );

  const sqlWithBegin: PostgresClient = Object.assign(sql, {
    json,
    async begin<T>(fn: (tx: PostgresClient) => Promise<T>): Promise<T> {
      return fn(sqlWithBegin);
    },
  });

  return sqlWithBegin;
}

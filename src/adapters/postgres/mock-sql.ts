// Tagged-template mock for postgres adapter tests.
//
// Wraps an `unsafe(query, params)` handler (the existing test harness
// interface) and returns a callable that supports:
//   - Tagged templates: sql`SELECT ... WHERE ${sql(col)} = ${val}`
//   - Identifier helpers: sql('table'), sql(['col1', 'col2'])
//   - Object helpers: sql(obj, ...keys) for INSERT/UPDATE SET

type UnsafeFn = (query: string, params: ReadonlyArray<unknown>) => Promise<unknown[]>;

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
  readonly obj: Record<string, unknown>;
  readonly keys: readonly string[];
};

function isMockFragment(v: unknown): v is MockFragment {
  return typeof v === "object" && v !== null && (v as MockFragment).__mock === "fragment";
}

function isMockIdent(v: unknown): v is MockIdent {
  return typeof v === "object" && v !== null && (v as MockIdent).__mock === "ident";
}

function isMockHelper(v: unknown): v is MockHelper {
  return typeof v === "object" && v !== null && (v as MockHelper).__mock === "helper";
}

function flatten(fragment: MockFragment): { sql: string; params: unknown[] } {
  const params: unknown[] = [];

  function emitHelper(helper: MockHelper, precedingSql: string): string {
    const preceding = precedingSql.trimEnd().toUpperCase();
    if (/INTO\s+"?\w+"?\s*$/.test(preceding)) {
      const cols = helper.keys.map((k) => `"${k}"`).join(", ");
      const phs = helper.keys
        .map((k) => {
          params.push(helper.obj[k]);
          return `$${params.length}`;
        })
        .join(", ");
      return `(${cols}) VALUES (${phs})`;
    }
    return helper.keys
      .map((k) => {
        params.push(helper.obj[k]);
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
          params.push(val);
          sql += `$${params.length}`;
        }
      }
    }
    return sql;
  }

  return { sql: emit(fragment), params };
}

// biome-ignore lint/suspicious/noExplicitAny: mock returns any to match PostgresClient structural type
export function createMockSql(unsafeFn: UnsafeFn): any {
  // biome-ignore lint/suspicious/noExplicitAny: must match both tagged-template and helper call signatures
  function sql(first: any, ...rest: any[]): any {
    // Tagged template call — first arg has `raw` property
    if (first?.raw !== undefined) {
      const fragment: MockFragment = {
        __mock: "fragment",
        strings: first,
        values: rest,
      };
      // Return a thenable fragment: embeddable in other templates, executable when awaited.
      return {
        ...fragment,
        // biome-ignore lint/suspicious/noThenProperty: intentional — mimics postgres PendingQuery (thenable + embeddable fragment)
        then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
          try {
            const { sql: query, params } = flatten(fragment);
            return unsafeFn(query, params).then(resolve, reject);
          } catch (e) {
            if (reject) return reject(e);
            throw e;
          }
        },
      };
    }

    // Identifier: sql('table') or sql(['col1', 'col2'])
    if (typeof first === "string" && rest.length === 0) {
      return { __mock: "ident", sql: `"${first}"` } satisfies MockIdent;
    }
    if (Array.isArray(first) && rest.length === 0) {
      return {
        __mock: "ident",
        sql: (first as string[]).map((c) => `"${c}"`).join(", "),
      } satisfies MockIdent;
    }

    // Object helper: sql(obj, ...keys)
    if (typeof first === "object" && first !== null) {
      return { __mock: "helper", obj: first, keys: rest } satisfies MockHelper;
    }

    throw new Error(`mock-sql: unexpected call pattern`);
  }

  return sql;
}

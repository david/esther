import { err, ok, type Result } from "neverthrow";
import type { z } from "zod";
import type { ReadModelHandle, ReadModelSchemaHandle } from "./read-model";
import { ReadModelSchemaError as mkReadModelSchemaError, type ReadModelSchemaError } from "./types";

function formatReadModelIssues(issues: ReadonlyArray<z.ZodIssue>): ReadonlyArray<string> {
  return issues.map((issue) => {
    const path = issue.path.map(String).join(".");
    return path.length === 0 ? issue.message : `${path}: ${issue.message}`;
  });
}

export function validateReadModelRow<T>(input: {
  readonly model: ReadModelSchemaHandle<T>;
  readonly row: unknown;
  readonly queryName?: string | undefined;
}): Result<T, ReadModelSchemaError> {
  const parseResult = input.model.schema.safeParse(input.row);
  if (!parseResult.success) {
    return err(
      mkReadModelSchemaError(
        input.model.name,
        formatReadModelIssues(parseResult.error.issues),
        input.queryName,
      ),
    );
  }

  // ReadModelHandle<T> is created by defineReadModel from this schema, so schema output and T match.
  return ok(parseResult.data as T);
}

export function validateReadModelRows<T>(input: {
  readonly model: ReadModelSchemaHandle<T>;
  readonly rows: ReadonlyArray<unknown>;
  readonly queryName?: string | undefined;
}): Result<ReadonlyArray<T>, ReadModelSchemaError> {
  const validatedRows: T[] = [];
  for (const row of input.rows) {
    const result = validateReadModelRow({
      model: input.model,
      row,
      queryName: input.queryName,
    });
    if (result.isErr()) {
      return err(result.error);
    }
    validatedRows.push(result.value);
  }
  return ok(validatedRows);
}

type ArrayElement<T extends ReadonlyArray<unknown>> =
  T extends ReadonlyArray<infer TRow> ? TRow : never;

export function validateReadModelGetResult<T>(input: {
  readonly model: ReadModelHandle<Exclude<T, undefined>>;
  readonly row: unknown | undefined;
}): Result<T, ReadModelSchemaError> {
  if (input.row === undefined) {
    // getDescriptor<T> encodes missing rows as undefined in T; keep cast local to descriptor boundary.
    return ok(undefined as T);
  }

  const result = validateReadModelRow({ model: input.model, row: input.row });
  if (result.isErr()) {
    return err(result.error);
  }
  // Descriptor model row type is Exclude<T, undefined>; present row satisfies T.
  return ok(result.value as T);
}

export function validateReadModelQueryResult<T extends ReadonlyArray<unknown>>(input: {
  readonly model: ReadModelHandle<ArrayElement<T>>;
  readonly rows: ReadonlyArray<unknown>;
}): Result<T, ReadModelSchemaError> {
  const result = validateReadModelRows({ model: input.model, rows: input.rows });
  if (result.isErr()) {
    return err(result.error);
  }
  // QueryDescriptor<T> is constructed as ReadonlyArray<row>; validated rows preserve that descriptor result type.
  return ok(result.value as T);
}

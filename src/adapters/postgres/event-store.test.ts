import { describe, expect, test } from "bun:test";
import { ConstraintError } from "../../core/types.js";
import { isConstraintViolation, mapConstraintError } from "./index.js";

describe("isConstraintViolation", () => {
  test("returns true for unique violation (23505)", () => {
    const error = {
      code: "23505",
      constraint_name: "uq_email",
      table_name: "users",
      message: "duplicate",
    };
    expect(isConstraintViolation(error)).toBe(true);
  });

  test("returns true for foreign key violation (23503)", () => {
    const error = {
      code: "23503",
      constraint_name: "fk_user",
      table_name: "orders",
      message: "fk fail",
    };
    expect(isConstraintViolation(error)).toBe(true);
  });

  test("returns true for check violation (23514)", () => {
    const error = {
      code: "23514",
      constraint_name: "ck_age",
      table_name: "users",
      message: "check fail",
    };
    expect(isConstraintViolation(error)).toBe(true);
  });

  test("returns false for other postgres error codes", () => {
    const error = {
      code: "42P01",
      constraint_name: "",
      table_name: "users",
      message: "table not found",
    };
    expect(isConstraintViolation(error)).toBe(false);
  });

  test("returns false for non-object errors", () => {
    expect(isConstraintViolation("string error")).toBe(false);
    expect(isConstraintViolation(null)).toBe(false);
    expect(isConstraintViolation(undefined)).toBe(false);
    expect(isConstraintViolation(42)).toBe(false);
  });

  test("returns false for objects without code property", () => {
    expect(isConstraintViolation({ message: "some error" })).toBe(false);
  });
});

describe("mapConstraintError", () => {
  test("returns full ConstraintError when metadata is registered", () => {
    const metadata = new Map<string, { columns: string[]; table: string }>();
    metadata.set("uq_users_email", { columns: ["email"], table: "users" });

    const pgError = {
      code: "23505",
      constraint_name: "uq_users_email",
      table_name: "users",
      message: "duplicate key value violates unique constraint",
    };

    const result = mapConstraintError(pgError, metadata);

    expect(result).toEqual(
      ConstraintError(
        "uq_users_email",
        ["email"],
        "users",
        "duplicate key value violates unique constraint",
      ),
    );
  });

  test("returns partial ConstraintError when metadata is not registered", () => {
    const metadata = new Map<string, { columns: string[]; table: string }>();

    const pgError = {
      code: "23505",
      constraint_name: "uq_unknown",
      table_name: "some_table",
      message: "duplicate key violation",
    };

    const result = mapConstraintError(pgError, metadata);

    expect(result).toEqual(
      ConstraintError("uq_unknown", [], "some_table", "duplicate key violation"),
    );
  });

  test("uses table from metadata when available over raw error", () => {
    const metadata = new Map<string, { columns: string[]; table: string }>();
    metadata.set("fk_orders_user", { columns: ["user_id"], table: "orders" });

    const pgError = {
      code: "23503",
      constraint_name: "fk_orders_user",
      table_name: "raw_table",
      message: "foreign key violation",
    };

    const result = mapConstraintError(pgError, metadata);

    expect(result.table).toBe("orders");
    expect(result.columns).toEqual(["user_id"]);
  });
});

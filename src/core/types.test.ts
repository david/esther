import { describe, expect, test } from "bun:test";
import { ConstraintError, type SliceError } from "./types.ts";

describe("ConstraintError", () => {
  test("constructor creates correct discriminated union", () => {
    const error = ConstraintError("users_email_unique", ["email"], "users", "Email already exists");

    expect(error._tag).toBe("ConstraintError");
    expect(error.constraint).toBe("users_email_unique");
    expect(error.columns).toEqual(["email"]);
    expect(error.table).toBe("users");
    expect(error.message).toBe("Email already exists");
  });

  test("is assignable to SliceError", () => {
    const error = ConstraintError("users_email_unique", ["email"], "users", "Email already exists");
    const sliceError: SliceError = error;
    expect(sliceError._tag).toBe("ConstraintError");
  });
});

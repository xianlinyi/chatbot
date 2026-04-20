import { describe, expect, it } from "vitest";
import { redactSecrets } from "../src/utils/redact.js";

describe("redactSecrets", () => {
  it("redacts secret-like keys recursively", () => {
    expect(
      redactSecrets({
        token: "abc",
        nested: {
          Authorization: "Bearer abc",
          safe: "visible"
        },
        list: [{ apiKey: "hidden" }]
      })
    ).toEqual({
      token: "[REDACTED]",
      nested: {
        Authorization: "[REDACTED]",
        safe: "visible"
      },
      list: [{ apiKey: "[REDACTED]" }]
    });
  });
});

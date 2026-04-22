import { describe, expect, it } from "vitest";
import { redactSecrets } from "../src/utils/redact.js";

describe("redactSecrets", () => {
  it("redacts secret-like keys recursively", () => {
    expect(
      redactSecrets({
        token: "abc",
        tokenType: "fine-grained-pat",
        nested: {
          Authorization: "Bearer abc",
          safe: "visible"
        },
        list: [{ apiKey: "hidden" }]
      })
    ).toEqual({
      token: "[REDACTED]",
      tokenType: "fine-grained-pat",
      nested: {
        Authorization: "[REDACTED]",
        safe: "visible"
      },
      list: [{ apiKey: "[REDACTED]" }]
    });
  });
});

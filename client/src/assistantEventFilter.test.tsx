import { describe, expect, it } from "vitest";
import { formatAssistantEventForDisplay } from "./assistantEventFilter.js";

describe("assistantEventFilter", () => {
  it("formats plain assistant message content directly", () => {
    expect(
      formatAssistantEventForDisplay("assistant.message", {
        messageId: "msg-1",
        content: "hello",
        toolRequests: [
          {
            name: "bash",
            arguments: {
              cmd: "git status"
            },
            ignored: true
          }
        ],
        outputTokens: 12,
        ignoredTopLevel: "hidden"
      })
    ).toBe("hello");
  });

  it("returns empty text when the event has no enabled fields with values", () => {
    expect(formatAssistantEventForDisplay("assistant.message", { unknown: "hidden" })).toBe("");
    expect(formatAssistantEventForDisplay("tool.execution_start", { toolName: "bash" })).toBe("");
  });

  it("keeps turn end events so the renderer can complete a turn", () => {
    expect(formatAssistantEventForDisplay("assistant.turn_end", { turnId: 1 })).toBe(
      [
        "assistant.turn_end",
        "turnId: 1",
        "",
        ""
      ].join("\n")
    );
  });

  it("formats configured session lifecycle event fields", () => {
    expect(
      formatAssistantEventForDisplay("session.context_changed", {
        cwd: "/repo",
        gitRoot: "/repo",
        repository: "owner/repo",
        branch: "main",
        ignored: "hidden"
      })
    ).toBe(
      [
        "session.context_changed",
        "cwd: /repo",
        "gitRoot: /repo",
        "repository: owner/repo",
        "branch: main",
        "",
        ""
      ].join("\n")
    );
  });

  it("keeps disabled session lifecycle fields hidden", () => {
    expect(
      formatAssistantEventForDisplay("session.usage_info", {
        tokenLimit: 1000,
        currentTokens: 100,
        messagesLength: 5
      })
    ).toBe("");
  });
});

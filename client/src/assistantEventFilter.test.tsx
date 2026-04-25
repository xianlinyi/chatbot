import { describe, expect, it } from "vitest";
import { formatAssistantEventForDisplay } from "./assistantEventFilter.js";

describe("assistantEventFilter", () => {
  it("formats only configured fields for assistant message events", () => {
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
    ).toBe(
      [
        "assistant.message",
        "content: hello",
        "toolRequests[0].name: bash",
        "toolRequests[0].arguments.cmd: git status",
        "",
        ""
      ].join("\n")
    );
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

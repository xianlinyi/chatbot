import { describe, expect, it } from "vitest";
import {
  extractAssistantDelta,
  extractAssistantMessageContent,
  formatAssistantEventText,
  isCopilotSessionLifecycleEvent
} from "../src/providers/copilotResponseParser.js";

describe("copilotResponseParser", () => {
  it("extracts streamed and final assistant text from SDK message events", () => {
    expect(
      extractAssistantDelta({
        type: "assistant.message_delta",
        data: { messageId: "msg-1", deltaContent: "hello" }
      })
    ).toBe("hello");

    expect(
      extractAssistantMessageContent({
        type: "assistant.message",
        data: { messageId: "msg-1", content: "hello world" }
      })
    ).toBe("hello world");
  });

  it("preserves assistant whitespace-only content without filtering", () => {
    expect(
      extractAssistantDelta({
        type: "assistant.message_delta",
        data: { messageId: "msg-2", deltaContent: "\n  " }
      })
    ).toBe("\n  ");

    expect(
      extractAssistantMessageContent({
        type: "assistant.message",
        data: { messageId: "msg-2", content: "  \n" }
      })
    ).toBe("  \n");
  });

  it("formats assistant message fields as plain text", () => {
    expect(
      formatAssistantEventText({
        type: "assistant.message",
        data: {
          messageId: "msg-1",
          content: "hello world",
          toolRequests: [
            {
              toolCallId: "tool-1",
              name: "bash",
              arguments: { cmd: "git status" },
              type: "function"
            }
          ],
          reasoningText: "short reason",
          outputTokens: 12
        }
      })
    ).toBe(
      [
        "assistant.message",
        "messageId: msg-1",
        "content: hello world",
        "toolRequests[0].toolCallId: tool-1",
        "toolRequests[0].name: bash",
        "toolRequests[0].arguments.cmd: git status",
        "toolRequests[0].type: function",
        "reasoningText: short reason",
        "outputTokens: 12",
        "",
        ""
      ].join("\n")
    );
  });

  it("formats assistant usage and streaming events as plain text", () => {
    expect(
      formatAssistantEventText({
        type: "assistant.usage",
        data: {
          model: "gpt-4.1",
          inputTokens: 10,
          quotaSnapshots: { premium: { remaining: 3 } }
        }
      })
    ).toBe(
      [
        "assistant.usage",
        "model: gpt-4.1",
        "inputTokens: 10",
        "quotaSnapshots.premium.remaining: 3",
        "",
        ""
      ].join("\n")
    );

    expect(
      formatAssistantEventText({
        type: "assistant.streaming_delta",
        data: { totalResponseSizeBytes: 256 }
      })
    ).toBe("assistant.streaming_delta\ntotalResponseSizeBytes: 256\n\n");
  });

  it("identifies Copilot session lifecycle events", () => {
    expect(isCopilotSessionLifecycleEvent({ type: "session.context_changed", data: { cwd: "/repo" } })).toBe(true);
    expect(isCopilotSessionLifecycleEvent({ type: "session.compaction_complete", data: { success: true } })).toBe(true);
    expect(isCopilotSessionLifecycleEvent({ type: "session", data: {} })).toBe(false);
    expect(isCopilotSessionLifecycleEvent({ type: "user.message", data: { content: "hello" } })).toBe(false);
  });
});

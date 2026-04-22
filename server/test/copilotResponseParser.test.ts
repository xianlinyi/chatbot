import { describe, expect, it } from "vitest";
import {
  extractAssistantDelta,
  extractAssistantMessageContent,
  parseCopilotActivity
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

  it("wraps raw SDK events without display text", () => {
    const event = {
      type: "tool.execution_start",
      data: {
        toolCallId: "tool-1",
        toolName: "bash",
        arguments: { cmd: "npm test" }
      }
    };

    expect(parseCopilotActivity(event)).toEqual({
      type: "activity",
      event
    });
  });
});

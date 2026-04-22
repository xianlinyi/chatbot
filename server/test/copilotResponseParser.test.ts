import { describe, expect, it } from "vitest";
import {
  extractAssistantDelta,
  extractAssistantMessageContent
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
});

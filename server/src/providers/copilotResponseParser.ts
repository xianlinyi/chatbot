import type { AgentStreamEvent } from "./types.js";

export type CopilotEvent = {
  type?: string;
  data?: Record<string, unknown> & {
    deltaContent?: string;
    content?: string;
    message?: string;
  };
};

export function extractAssistantDelta(event: CopilotEvent): string | undefined {
  if (event.type !== "assistant.message_delta") {
    return undefined;
  }

  return nonEmptyString(event.data?.deltaContent ?? event.data?.content);
}

export function extractAssistantMessageContent(event: CopilotEvent): string {
  if (event.type !== "assistant.message") {
    return "";
  }

  return nonEmptyString(event.data?.content) ?? "";
}

export function isCopilotToolEvent(event: CopilotEvent): boolean {
  return Boolean(event.type?.startsWith("tool."));
}

export function parseCopilotActivity(event: CopilotEvent): AgentStreamEvent | undefined {
  if (!event.type) {
    return undefined;
  }

  return {
    type: "activity",
    event
  };
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

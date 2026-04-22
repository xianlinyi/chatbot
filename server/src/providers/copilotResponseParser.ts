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

  return stringOrUndefined(event.data?.deltaContent ?? event.data?.content);
}

export function extractAssistantMessageContent(event: CopilotEvent): string {
  if (event.type !== "assistant.message") {
    return "";
  }

  return stringOrUndefined(event.data?.content) ?? "";
}

export function isCopilotToolEvent(event: CopilotEvent): boolean {
  return Boolean(event.type?.startsWith("tool."));
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

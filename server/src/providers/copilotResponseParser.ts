export type CopilotEvent = {
  type?: string;
  data?: Record<string, unknown> & {
    deltaContent?: string;
    content?: string;
    message?: string;
  };
};

const ASSISTANT_FIELD_ORDER: Record<string, string[]> = {
  "assistant.turn_start": ["turnId", "interactionId"],
  "assistant.intent": ["intent"],
  "assistant.reasoning": ["reasoningId", "content"],
  "assistant.reasoning_delta": ["reasoningId", "deltaContent"],
  "assistant.message": [
    "messageId",
    "content",
    "toolRequests",
    "reasoningOpaque",
    "reasoningText",
    "encryptedContent",
    "phase",
    "outputTokens",
    "interactionId",
    "parentToolCallId"
  ],
  "assistant.message_delta": ["messageId", "deltaContent", "parentToolCallId"],
  "assistant.turn_end": ["turnId"],
  "assistant.usage": [
    "model",
    "inputTokens",
    "outputTokens",
    "cacheReadTokens",
    "cacheWriteTokens",
    "cost",
    "duration",
    "initiator",
    "apiCallId",
    "providerCallId",
    "parentToolCallId",
    "quotaSnapshots",
    "copilotUsage"
  ],
  "assistant.streaming_delta": ["totalResponseSizeBytes"]
};

const SESSION_LIFECYCLE_EVENT_TYPES = new Set([
  "session.idle",
  "session.error",
  "session.compaction_start",
  "session.compaction_complete",
  "session.title_changed",
  "session.context_changed",
  "session.usage_info",
  "session.task_complete",
  "session.shutdown"
]);

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

export function formatAssistantEventText(event: CopilotEvent): string | undefined {
  if (!event.type?.startsWith("assistant.")) {
    return undefined;
  }

  const data = event.data ?? {};
  const fieldOrder = ASSISTANT_FIELD_ORDER[event.type] ?? [];
  const fields = [
    ...fieldOrder,
    ...Object.keys(data).filter((field) => !fieldOrder.includes(field))
  ];
  const lines = [`${event.type}`];

  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(data, field)) {
      continue;
    }

    lines.push(...formatField(field, data[field]));
  }

  return `${lines.join("\n")}\n\n`;
}

export function isCopilotToolEvent(event: CopilotEvent): boolean {
  return Boolean(event.type?.startsWith("tool."));
}

export function isCopilotSessionLifecycleEvent(event: CopilotEvent): boolean {
  return Boolean(event.type && SESSION_LIFECYCLE_EVENT_TYPES.has(event.type));
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function formatField(name: string, value: unknown): string[] {
  if (value === undefined) {
    return [];
  }

  if (value === null || typeof value !== "object") {
    return [`${name}: ${String(value)}`];
  }

  const nested = formatNestedValue(value, name);
  return nested.length ? nested : [`${name}:`];
}

function formatNestedValue(value: unknown, prefix: string): string[] {
  if (value === undefined) {
    return [];
  }

  if (value === null || typeof value !== "object") {
    return [`${prefix}: ${String(value)}`];
  }

  if (Array.isArray(value)) {
    if (!value.length) {
      return [`${prefix}: empty`];
    }

    return value.flatMap((item, index) => formatNestedValue(item, `${prefix}[${index}]`));
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) {
    return [`${prefix}: empty`];
  }

  return entries.flatMap(([key, nestedValue]) => formatNestedValue(nestedValue, `${prefix}.${key}`));
}

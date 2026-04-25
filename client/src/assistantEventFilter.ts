type AssistantEventFilterItem = {
  eventType: string;
  fieldPath: string;
  enabled: boolean;
};

export const assistantEventFilter: AssistantEventFilterItem[] = [
  { eventType: "assistant.intent", fieldPath: "intent", enabled: true },
  { eventType: "assistant.reasoning_delta", fieldPath: "deltaContent", enabled: false },
  { eventType: "assistant.reasoning", fieldPath: "content", enabled: true },
  { eventType: "assistant.message_delta", fieldPath: "deltaContent", enabled: false },
  { eventType: "assistant.message", fieldPath: "content", enabled: true },
  { eventType: "assistant.message", fieldPath: "reasoningText", enabled: false },
  { eventType: "assistant.message", fieldPath: "reasoningOpaque", enabled: false },
  { eventType: "assistant.message", fieldPath: "encryptedContent", enabled: false },
  { eventType: "assistant.message", fieldPath: "toolRequests.name", enabled: true },
  { eventType: "assistant.message", fieldPath: "toolRequests.arguments", enabled: true },
  { eventType: "assistant.turn_start", fieldPath: "turnId", enabled: true },
  { eventType: "assistant.turn_start", fieldPath: "interactionId", enabled: true },
  { eventType: "assistant.message", fieldPath: "messageId", enabled: false },
  { eventType: "assistant.message", fieldPath: "phase", enabled: false },
  { eventType: "assistant.message", fieldPath: "outputTokens", enabled: false },
  { eventType: "assistant.message", fieldPath: "interactionId", enabled: false },
  { eventType: "assistant.message", fieldPath: "parentToolCallId", enabled: false },
  { eventType: "assistant.message_delta", fieldPath: "messageId", enabled: false },
  { eventType: "assistant.message_delta", fieldPath: "parentToolCallId", enabled: false },
  { eventType: "assistant.reasoning", fieldPath: "reasoningId", enabled: true },
  { eventType: "assistant.reasoning_delta", fieldPath: "reasoningId", enabled: false },
  { eventType: "assistant.turn_end", fieldPath: "turnId", enabled: true },
  { eventType: "assistant.usage", fieldPath: "model", enabled: false },
  { eventType: "assistant.usage", fieldPath: "inputTokens", enabled: false },
  { eventType: "assistant.usage", fieldPath: "outputTokens", enabled: false },
  { eventType: "assistant.usage", fieldPath: "cacheReadTokens", enabled: false },
  { eventType: "assistant.usage", fieldPath: "cacheWriteTokens", enabled: false },
  { eventType: "assistant.usage", fieldPath: "cost", enabled: false },
  { eventType: "assistant.usage", fieldPath: "duration", enabled: false },
  { eventType: "assistant.usage", fieldPath: "initiator", enabled: false },
  { eventType: "assistant.usage", fieldPath: "apiCallId", enabled: false },
  { eventType: "assistant.usage", fieldPath: "providerCallId", enabled: false },
  { eventType: "assistant.usage", fieldPath: "parentToolCallId", enabled: false },
  { eventType: "assistant.usage", fieldPath: "quotaSnapshots", enabled: false },
  { eventType: "assistant.usage", fieldPath: "copilotUsage", enabled: false },
  { eventType: "assistant.streaming_delta", fieldPath: "totalResponseSizeBytes", enabled: false },
  { eventType: "session.idle", fieldPath: "backgroundTasks", enabled: false },
  { eventType: "session.error", fieldPath: "errorType", enabled: true },
  { eventType: "session.error", fieldPath: "message", enabled: true },
  { eventType: "session.error", fieldPath: "stack", enabled: false },
  { eventType: "session.error", fieldPath: "statusCode", enabled: true },
  { eventType: "session.error", fieldPath: "providerCallId", enabled: false },
  { eventType: "session.compaction_complete", fieldPath: "success", enabled: true },
  { eventType: "session.compaction_complete", fieldPath: "error", enabled: true },
  { eventType: "session.compaction_complete", fieldPath: "preCompactionTokens", enabled: true },
  { eventType: "session.compaction_complete", fieldPath: "postCompactionTokens", enabled: true },
  { eventType: "session.compaction_complete", fieldPath: "preCompactionMessagesLength", enabled: true },
  { eventType: "session.compaction_complete", fieldPath: "messagesRemoved", enabled: true },
  { eventType: "session.compaction_complete", fieldPath: "tokensRemoved", enabled: true },
  { eventType: "session.compaction_complete", fieldPath: "summaryContent", enabled: true },
  { eventType: "session.compaction_complete", fieldPath: "checkpointNumber", enabled: false },
  { eventType: "session.compaction_complete", fieldPath: "checkpointPath", enabled: false },
  { eventType: "session.compaction_complete", fieldPath: "compactionTokensUsed", enabled: false },
  { eventType: "session.compaction_complete", fieldPath: "requestId", enabled: false },
  { eventType: "session.title_changed", fieldPath: "title", enabled: true },
  { eventType: "session.context_changed", fieldPath: "cwd", enabled: true },
  { eventType: "session.context_changed", fieldPath: "gitRoot", enabled: true },
  { eventType: "session.context_changed", fieldPath: "repository", enabled: true },
  { eventType: "session.context_changed", fieldPath: "branch", enabled: true },
  { eventType: "session.usage_info", fieldPath: "tokenLimit", enabled: false },
  { eventType: "session.usage_info", fieldPath: "currentTokens", enabled: false },
  { eventType: "session.usage_info", fieldPath: "messagesLength", enabled: false },
  { eventType: "session.task_complete", fieldPath: "summary", enabled: true },
  { eventType: "session.shutdown", fieldPath: "shutdownType", enabled: true },
  { eventType: "session.shutdown", fieldPath: "errorReason", enabled: true },
  { eventType: "session.shutdown", fieldPath: "totalPremiumRequests", enabled: true },
  { eventType: "session.shutdown", fieldPath: "totalApiDurationMs", enabled: true },
  { eventType: "session.shutdown", fieldPath: "sessionStartTime", enabled: true },
  { eventType: "session.shutdown", fieldPath: "codeChanges", enabled: true },
  { eventType: "session.shutdown", fieldPath: "modelMetrics", enabled: false },
  { eventType: "session.shutdown", fieldPath: "currentModel", enabled: true }
];

export function formatAssistantEventForDisplay(eventType: string, data: Record<string, unknown>): string {
  const enabledItems = assistantEventFilter.filter((item) => item.enabled && item.eventType === eventType);
  if (!enabledItems.length) {
    return "";
  }

  // Special logic: If eventType is "assistant.message" and it only contains "content", just return the content directly
  if (eventType === "assistant.message") {
    const hasOnlyContent = enabledItems.length === 1 && enabledItems[0].fieldPath === "content";
    if (hasOnlyContent) {
      const values = getValuesAtPath(data, "content");
      if (values.length > 0 && values[0].value !== undefined) {
        return String(values[0].value);
      }
    }
  }

  const lines = [eventType];
  for (const item of enabledItems) {
    const values = getValuesAtPath(data, item.fieldPath);
    for (const value of values) {
      lines.push(...formatPlainTextField(value.path, value.value));
    }
  }

  return lines.length > 1 ? `${lines.join("\n")}\n\n` : "";
}

export function formatPlainTextField(name: string, value: unknown): string[] {
  if (value === undefined) {
    return [];
  }

  if (value === null || typeof value !== "object") {
    return [`${name}: ${String(value)}`];
  }

  if (Array.isArray(value)) {
    if (!value.length) {
      return [`${name}: empty`];
    }

    return value.flatMap((item, index) => formatPlainTextField(`${name}[${index}]`, item));
  }

  const entries = Object.entries(value);
  if (!entries.length) {
    return [`${name}: empty`];
  }

  return entries.flatMap(([key, nestedValue]) => formatPlainTextField(`${name}.${key}`, nestedValue));
}

function getValuesAtPath(data: Record<string, unknown>, fieldPath: string) {
  const segments = fieldPath.split(".");
  return collectPathValues(data, segments, "");
}

function collectPathValues(value: unknown, segments: string[], outputPath: string): Array<{ path: string; value: unknown }> {
  if (!segments.length) {
    return [{ path: outputPath, value }];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectPathValues(item, segments, `${outputPath}[${index}]`));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const [segment, ...rest] = segments;
  if (!Object.prototype.hasOwnProperty.call(value, segment)) {
    return [];
  }

  const nextValue = (value as Record<string, unknown>)[segment];
  const nextPath = outputPath ? `${outputPath}.${segment}` : segment;
  return collectPathValues(nextValue, rest, nextPath);
}

import type { ActivityItem, SkillSummary, StreamEvent, UsageStats } from "../types.js";

type ActivityEvent = Extract<StreamEvent, { type: "activity" }>;

type CopilotEventType =
  | "assistant.turn_start"
  | "assistant.intent"
  | "assistant.reasoning"
  | "assistant.reasoning_delta"
  | "assistant.streaming_delta"
  | "assistant.message"
  | "assistant.message_delta"
  | "assistant.turn_end"
  | "assistant.usage"
  | "tool.user_requested"
  | "tool.execution_start"
  | "tool.execution_partial_result"
  | "tool.execution_progress"
  | "tool.execution_complete"
  | "session.idle"
  | "session.error"
  | "session.compaction_start"
  | "session.compaction_complete"
  | "session.title_changed"
  | "session.context_changed"
  | "session.usage_info"
  | "session.task_complete"
  | "session.shutdown"
  | "permission.requested"
  | "permission.completed"
  | "user_input.requested"
  | "user_input.completed"
  | "elicitation.requested"
  | "elicitation.completed"
  | "subagent.started"
  | "subagent.completed"
  | "subagent.failed"
  | "subagent.selected"
  | "subagent.deselected"
  | "skill.invoked"
  | "abort"
  | "user.message"
  | "system.message"
  | "external_tool.requested"
  | "external_tool.completed"
  | "command.queued"
  | "command.completed"
  | "exit_plan_mode.requested"
  | "exit_plan_mode.completed";

type EventData = Record<string, unknown> | undefined;

abstract class CopilotOutputHandler {
  abstract readonly eventType: CopilotEventType;

  parseUsage(_data: EventData): UsageStats | undefined {
    return undefined;
  }

  completedKey(_data: EventData): string | undefined {
    return undefined;
  }

  format(_data: EventData, _createId: () => string): ActivityItem | undefined {
    return undefined;
  }
}

abstract class AssistantNoopOutputHandler extends CopilotOutputHandler {
  format(data: EventData, createId: () => string): ActivityItem | undefined {
    const intent = stringValue(data?.intent);
    if (!intent) {
      return undefined;
    }

    return {
      id: createId(),
      title: `正在处理 · ${intent}`,
      category: "assistant",
      level: "info",
      status: "running"
    };
  }
}

class AssistantTurnStartHandler extends AssistantNoopOutputHandler {
  readonly eventType = "assistant.turn_start" as const;
}

class AssistantIntentHandler extends AssistantNoopOutputHandler {
  readonly eventType = "assistant.intent" as const;
}

class AssistantReasoningHandler extends AssistantNoopOutputHandler {
  readonly eventType = "assistant.reasoning" as const;
}

class AssistantReasoningDeltaHandler extends AssistantNoopOutputHandler {
  readonly eventType = "assistant.reasoning_delta" as const;
}

class AssistantStreamingDeltaHandler extends AssistantNoopOutputHandler {
  readonly eventType = "assistant.streaming_delta" as const;
}

class AssistantMessageHandler extends AssistantNoopOutputHandler {
  readonly eventType = "assistant.message" as const;
}

class AssistantMessageDeltaHandler extends AssistantNoopOutputHandler {
  readonly eventType = "assistant.message_delta" as const;
}

class AssistantTurnEndHandler extends AssistantNoopOutputHandler {
  readonly eventType = "assistant.turn_end" as const;
}

class AssistantUsageHandler extends CopilotOutputHandler {
  readonly eventType = "assistant.usage" as const;

  parseUsage(data: EventData): UsageStats {
    return {
      inputTokens: numericValue(data?.inputTokens),
      outputTokens: numericValue(data?.outputTokens),
      duration: numericValue(data?.duration)
    };
  }
}

class ToolUserRequestedHandler extends CopilotOutputHandler {
  readonly eventType = "tool.user_requested" as const;

  format(data: EventData, createId: () => string): ActivityItem {
    const key = stringValue(data?.toolCallId);
    return {
      id: key ?? createId(),
      title: `用户请求工具 · ${toolNameFromEvent(data)}`,
      detail: formatToolArguments(data),
      level: "info",
      category: "tool",
      status: "running",
      key
    };
  }
}

class ToolExecutionStartHandler extends CopilotOutputHandler {
  readonly eventType = "tool.execution_start" as const;

  format(data: EventData, createId: () => string): ActivityItem {
    const key = stringValue(data?.toolCallId);
    return {
      id: key ?? createId(),
      title: `正在调用工具 · ${toolNameFromEvent(data)}`,
      detail: formatToolArguments(data),
      level: "info",
      category: "tool",
      status: "running",
      key
    };
  }
}

class ToolExecutionPartialResultHandler extends CopilotOutputHandler {
  readonly eventType = "tool.execution_partial_result" as const;

  format(data: EventData, createId: () => string): ActivityItem {
    const key = stringValue(data?.toolCallId);
    return {
      id: key ?? createId(),
      title: "工具输出更新",
      detail: stringValue(data?.partialOutput),
      level: "info",
      category: "tool",
      status: "running",
      key
    };
  }
}

class ToolExecutionProgressHandler extends CopilotOutputHandler {
  readonly eventType = "tool.execution_progress" as const;

  format(data: EventData, createId: () => string): ActivityItem {
    const key = stringValue(data?.toolCallId);
    return {
      id: key ?? createId(),
      title: stringValue(data?.progressMessage) ?? "工具执行中",
      level: "info",
      category: "tool",
      status: "running",
      key
    };
  }
}

class ToolExecutionCompleteHandler extends CopilotOutputHandler {
  readonly eventType = "tool.execution_complete" as const;

  completedKey(data: EventData): string | undefined {
    if (data?.success === false) {
      return undefined;
    }

    return stringValue(data?.toolCallId);
  }

  format(data: EventData, createId: () => string): ActivityItem | undefined {
    if (data?.success !== false) {
      return undefined;
    }

    return {
      id: createId(),
      title: `工具调用失败 · ${toolNameFromEvent(data)}`,
      detail: stringValue(recordValue(data?.error)?.message) ?? prettyJson(data?.error),
      level: "error",
      category: "tool",
      status: "complete"
    };
  }
}

class SessionIdleHandler extends CopilotOutputHandler {
  readonly eventType = "session.idle" as const;
}

class SessionErrorHandler extends CopilotOutputHandler {
  readonly eventType = "session.error" as const;

  format(data: EventData, createId: () => string): ActivityItem {
    return {
      id: createId(),
      title: "运行错误",
      detail: stringValue(data?.message),
      level: "error",
      category: "session"
    };
  }
}

class SessionCompactionStartHandler extends CopilotOutputHandler {
  readonly eventType = "session.compaction_start" as const;
}

class SessionCompactionCompleteHandler extends CopilotOutputHandler {
  readonly eventType = "session.compaction_complete" as const;

  format(data: EventData, createId: () => string): ActivityItem | undefined {
    if (data?.success !== false) {
      return undefined;
    }

    return {
      id: createId(),
      title: "上下文压缩失败",
      detail: stringValue(data?.error),
      level: "warning",
      category: "session"
    };
  }
}

class SessionTitleChangedHandler extends CopilotOutputHandler {
  readonly eventType = "session.title_changed" as const;
}

class SessionContextChangedHandler extends CopilotOutputHandler {
  readonly eventType = "session.context_changed" as const;
}

class SessionUsageInfoHandler extends CopilotOutputHandler {
  readonly eventType = "session.usage_info" as const;
}

class SessionTaskCompleteHandler extends CopilotOutputHandler {
  readonly eventType = "session.task_complete" as const;
}

class SessionShutdownHandler extends CopilotOutputHandler {
  readonly eventType = "session.shutdown" as const;
}

class PermissionRequestedHandler extends CopilotOutputHandler {
  readonly eventType = "permission.requested" as const;

  format(data: EventData, createId: () => string): ActivityItem {
    const key = stringValue(data?.requestId);
    return {
      id: key ?? createId(),
      title: formatPermissionTitle(data),
      detail: formatPermissionDetail(data),
      level: "warning",
      category: "permission",
      key
    };
  }
}

class PermissionCompletedHandler extends CopilotOutputHandler {
  readonly eventType = "permission.completed" as const;

  completedKey(data: EventData): string | undefined {
    return stringValue(data?.requestId);
  }
}

class UserInputRequestedHandler extends CopilotOutputHandler {
  readonly eventType = "user_input.requested" as const;
}

class UserInputCompletedHandler extends CopilotOutputHandler {
  readonly eventType = "user_input.completed" as const;
}

class ElicitationRequestedHandler extends CopilotOutputHandler {
  readonly eventType = "elicitation.requested" as const;
}

class ElicitationCompletedHandler extends CopilotOutputHandler {
  readonly eventType = "elicitation.completed" as const;
}

class SubagentStartedHandler extends CopilotOutputHandler {
  readonly eventType = "subagent.started" as const;

  format(data: EventData, createId: () => string): ActivityItem {
    const key = stringValue(data?.toolCallId);
    return {
      id: key ?? createId(),
      title: `子代理启动 · ${stringValue(data?.agentDisplayName) ?? stringValue(data?.agentName) ?? "agent"}`,
      detail: stringValue(data?.agentDescription),
      level: "info",
      category: "subagent",
      status: "running",
      key
    };
  }
}

class SubagentCompletedHandler extends CopilotOutputHandler {
  readonly eventType = "subagent.completed" as const;

  completedKey(data: EventData): string | undefined {
    return stringValue(data?.toolCallId);
  }
}

class SubagentFailedHandler extends CopilotOutputHandler {
  readonly eventType = "subagent.failed" as const;

  completedKey(data: EventData): string | undefined {
    return undefined;
  }

  format(data: EventData, createId: () => string): ActivityItem {
    return {
      id: createId(),
      title: `子代理失败 · ${stringValue(data?.agentDisplayName) ?? stringValue(data?.agentName) ?? "agent"}`,
      detail: stringValue(data?.error),
      level: "error",
      category: "subagent",
      status: "complete"
    };
  }
}

class SubagentSelectedHandler extends CopilotOutputHandler {
  readonly eventType = "subagent.selected" as const;
}

class SubagentDeselectedHandler extends CopilotOutputHandler {
  readonly eventType = "subagent.deselected" as const;
}

class SkillInvokedHandler extends CopilotOutputHandler {
  readonly eventType = "skill.invoked" as const;

  format(data: EventData, createId: () => string): ActivityItem {
    const skill = skillSummaryFromRecord(data);
    return {
      id: createId(),
      title: `已调用 Skill · ${skill?.name ?? "unknown"}`,
      level: "info",
      category: "skill",
      status: "complete",
      skills: skill ? [skill] : undefined
    };
  }
}

class AbortHandler extends CopilotOutputHandler {
  readonly eventType = "abort" as const;

  format(data: EventData, createId: () => string): ActivityItem {
    return {
      id: createId(),
      title: "任务已中止",
      detail: stringValue(data?.reason),
      level: "warning",
      category: "control"
    };
  }
}

class UserMessageHandler extends CopilotOutputHandler {
  readonly eventType = "user.message" as const;
}

class SystemMessageHandler extends CopilotOutputHandler {
  readonly eventType = "system.message" as const;
}

class ExternalToolRequestedHandler extends CopilotOutputHandler {
  readonly eventType = "external_tool.requested" as const;

  format(data: EventData, createId: () => string): ActivityItem {
    const key = stringValue(data?.requestId);
    return {
      id: key ?? createId(),
      title: `等待外部工具 · ${stringValue(data?.toolName) ?? "tool"}`,
      detail: prettyJson(data?.arguments),
      level: "warning",
      category: "external_tool",
      status: "running",
      key
    };
  }
}

class ExternalToolCompletedHandler extends CopilotOutputHandler {
  readonly eventType = "external_tool.completed" as const;

  completedKey(data: EventData): string | undefined {
    return stringValue(data?.requestId);
  }
}

class CommandQueuedHandler extends CopilotOutputHandler {
  readonly eventType = "command.queued" as const;

  format(data: EventData, createId: () => string): ActivityItem {
    const key = stringValue(data?.requestId);
    return {
      id: key ?? createId(),
      title: `命令排队 · ${stringValue(data?.command) ?? "command"}`,
      level: "info",
      category: "command",
      status: "running",
      key
    };
  }
}

class CommandCompletedHandler extends CopilotOutputHandler {
  readonly eventType = "command.completed" as const;

  completedKey(data: EventData): string | undefined {
    return stringValue(data?.requestId);
  }
}

class ExitPlanModeRequestedHandler extends CopilotOutputHandler {
  readonly eventType = "exit_plan_mode.requested" as const;

  format(data: EventData, createId: () => string): ActivityItem {
    const key = stringValue(data?.requestId);
    return {
      id: key ?? createId(),
      title: "计划等待确认",
      detail: [stringValue(data?.summary), stringValue(data?.planContent)].filter(Boolean).join("\n\n") || undefined,
      level: "warning",
      category: "plan",
      status: "running",
      key
    };
  }
}

class ExitPlanModeCompletedHandler extends CopilotOutputHandler {
  readonly eventType = "exit_plan_mode.completed" as const;

  completedKey(data: EventData): string | undefined {
    return stringValue(data?.requestId);
  }
}

class LegacyWarningHandler extends CopilotOutputHandler {
  readonly eventType = "session.error" as const;

  canHandle(type: string | undefined): boolean {
    return type === "session.warning" || type === "error";
  }

  formatLegacy(type: string | undefined, data: EventData, createId: () => string): ActivityItem {
    const isError = type === "error";
    return {
      id: createId(),
      title: isError ? "运行错误" : "会话提醒",
      detail: stringValue(data?.message),
      level: isError ? "error" : "warning",
      category: "system"
    };
  }
}

const handlers: CopilotOutputHandler[] = [
  new AssistantTurnStartHandler(),
  new AssistantIntentHandler(),
  new AssistantReasoningHandler(),
  new AssistantReasoningDeltaHandler(),
  new AssistantStreamingDeltaHandler(),
  new AssistantMessageHandler(),
  new AssistantMessageDeltaHandler(),
  new AssistantTurnEndHandler(),
  new AssistantUsageHandler(),
  new ToolUserRequestedHandler(),
  new ToolExecutionStartHandler(),
  new ToolExecutionPartialResultHandler(),
  new ToolExecutionProgressHandler(),
  new ToolExecutionCompleteHandler(),
  new SessionIdleHandler(),
  new SessionErrorHandler(),
  new SessionCompactionStartHandler(),
  new SessionCompactionCompleteHandler(),
  new SessionTitleChangedHandler(),
  new SessionContextChangedHandler(),
  new SessionUsageInfoHandler(),
  new SessionTaskCompleteHandler(),
  new SessionShutdownHandler(),
  new PermissionRequestedHandler(),
  new PermissionCompletedHandler(),
  new UserInputRequestedHandler(),
  new UserInputCompletedHandler(),
  new ElicitationRequestedHandler(),
  new ElicitationCompletedHandler(),
  new SubagentStartedHandler(),
  new SubagentCompletedHandler(),
  new SubagentFailedHandler(),
  new SubagentSelectedHandler(),
  new SubagentDeselectedHandler(),
  new SkillInvokedHandler(),
  new AbortHandler(),
  new UserMessageHandler(),
  new SystemMessageHandler(),
  new ExternalToolRequestedHandler(),
  new ExternalToolCompletedHandler(),
  new CommandQueuedHandler(),
  new CommandCompletedHandler(),
  new ExitPlanModeRequestedHandler(),
  new ExitPlanModeCompletedHandler()
];

const legacyWarningHandler = new LegacyWarningHandler();

export function parseUsageEvent(event: ActivityEvent): UsageStats | undefined {
  return handlerFor(event.event.type)?.parseUsage(event.event.data);
}

export function formatActivityItem(event: ActivityEvent, createId: () => string): ActivityItem | undefined {
  const handler = handlerFor(event.event.type);
  if (handler) {
    return handler.format(event.event.data, createId);
  }

  if (legacyWarningHandler.canHandle(event.event.type)) {
    return legacyWarningHandler.formatLegacy(event.event.type, event.event.data, createId);
  }

  return undefined;
}

export function completedActivityKey(event: ActivityEvent): string | undefined {
  return handlerFor(event.event.type)?.completedKey(event.event.data);
}

function handlerFor(type: string | undefined): CopilotOutputHandler | undefined {
  return handlers.find((handler) => handler.eventType === type);
}

function toolNameFromEvent(data: EventData): string {
  return (
    stringValue(data?.toolName) ??
    stringValue(data?.name) ??
    stringValue(data?.mcpToolName) ??
    "tool"
  );
}

function formatToolArguments(data: EventData): string | undefined {
  const parts = [
    stringValue(data?.mcpServerName) ? `MCP server: ${String(data?.mcpServerName)}` : undefined,
    prettyJson(data?.arguments)
  ].filter((part): part is string => Boolean(part));

  return parts.length ? parts.join("\n\n") : undefined;
}

function skillSummaryFromRecord(data: EventData): SkillSummary | undefined {
  const name = stringValue(data?.name);
  if (!name) {
    return undefined;
  }

  const allowedTools = Array.isArray(data?.allowedTools)
    ? data.allowedTools.filter((tool): tool is string => typeof tool === "string" && Boolean(tool.trim()))
    : undefined;

  return {
    name,
    description: stringValue(data?.description),
    path: stringValue(data?.path),
    source: stringValue(data?.source),
    pluginName: stringValue(data?.pluginName),
    pluginVersion: stringValue(data?.pluginVersion),
    allowedTools: allowedTools?.length ? allowedTools : undefined,
    enabled: booleanValue(data?.enabled),
    userInvocable: booleanValue(data?.userInvocable)
  };
}

function formatPermissionTitle(data: EventData): string {
  const request = recordValue(data?.permissionRequest);
  const kind = stringValue(request?.kind) ?? "unknown";
  return `需要权限 · ${kind}`;
}

function formatPermissionDetail(data: EventData): string | undefined {
  const request = recordValue(data?.permissionRequest);
  if (!request) {
    return undefined;
  }

  switch (request.kind) {
    case "shell":
      return [stringValue(request.intention), stringValue(request.fullCommandText)].filter(Boolean).join("\n\n");
    case "write":
      return [stringValue(request.intention), stringValue(request.fileName), stringValue(request.diff)]
        .filter(Boolean)
        .join("\n\n");
    case "read":
      return [stringValue(request.intention), stringValue(request.path)].filter(Boolean).join("\n\n");
    case "mcp":
      return [
        stringValue(request.toolTitle) ?? stringValue(request.toolName),
        stringValue(request.serverName),
        prettyJson(request.args)
      ]
        .filter(Boolean)
        .join("\n\n");
    default:
      return prettyJson(request);
  }
}

function prettyJson(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "string") {
    return value.trim() || undefined;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function numericValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

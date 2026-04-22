import type { ActivityItem, SkillSummary, StreamEvent, UsageStats } from "./types.js";

type ActivityEvent = Extract<StreamEvent, { type: "activity" }>;

export function parseUsageEvent(event: ActivityEvent): UsageStats | undefined {
  if (event.event.type !== "assistant.usage") {
    return undefined;
  }

  return {
    inputTokens: numericValue(event.event.data?.inputTokens),
    outputTokens: numericValue(event.event.data?.outputTokens),
    duration: numericValue(event.event.data?.duration)
  };
}

export function formatActivityItem(event: ActivityEvent, createId: () => string): ActivityItem | undefined {
  if (event.event.type === "skill.invoked") {
    const skill = skillSummaryFromRecord(event.event.data);
    return {
      id: createId(),
      title: `已调用 Skill · ${skill?.name ?? "unknown"}`,
      level: "info",
      category: "skill",
      status: "complete",
      skills: skill ? [skill] : undefined
    };
  }

  if (event.event.type === "tool.user_requested" || event.event.type === "tool.execution_start") {
    const toolName = toolNameFromEvent(event.event.data);
    const key = stringValue(event.event.data?.toolCallId);
    return {
      id: key ?? createId(),
      title: `${event.event.type === "tool.user_requested" ? "用户请求工具" : "正在调用工具"} · ${toolName}`,
      detail: formatToolArguments(event.event.data),
      level: "info",
      category: "tool",
      status: "running",
      key
    };
  }

  if (event.event.type === "permission.requested") {
    const key = stringValue(event.event.data?.requestId);
    return {
      id: key ?? createId(),
      title: formatPermissionTitle(event.event.data),
      detail: formatPermissionDetail(event.event.data),
      level: "warning",
      category: "permission",
      key
    };
  }

  if (event.event.type === "session.warning" || event.event.type === "session.error" || event.event.type === "error") {
    return {
      id: createId(),
      title: event.event.type === "session.warning" ? "会话提醒" : "运行错误",
      detail: stringValue(event.event.data?.message),
      level: event.event.type === "session.warning" ? "warning" : "error",
      category: "system"
    };
  }

  return undefined;
}

export function completedActivityKey(event: ActivityEvent): string | undefined {
  if (event.event.type === "tool.execution_complete" || event.event.type === "permission.completed") {
    return stringValue(event.event.data?.toolCallId) ?? stringValue(event.event.data?.requestId);
  }

  return undefined;
}

function toolNameFromEvent(data: Record<string, unknown> | undefined): string {
  return (
    stringValue(data?.toolName) ??
    stringValue(data?.name) ??
    stringValue(data?.mcpToolName) ??
    "tool"
  );
}

function formatToolArguments(data: Record<string, unknown> | undefined): string | undefined {
  const parts = [
    stringValue(data?.mcpServerName) ? `MCP server: ${String(data?.mcpServerName)}` : undefined,
    prettyJson(data?.arguments)
  ].filter((part): part is string => Boolean(part));

  return parts.length ? parts.join("\n\n") : undefined;
}

function skillsFromEvent(data: Record<string, unknown> | undefined): SkillSummary[] {
  const skills = Array.isArray(data?.skills) ? data.skills : [];
  return skills
    .map((skill) => skillSummaryFromRecord(recordValue(skill)))
    .filter((skill): skill is SkillSummary => Boolean(skill));
}

function skillSummaryFromRecord(data: Record<string, unknown> | undefined): SkillSummary | undefined {
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

function formatPermissionTitle(data: Record<string, unknown> | undefined): string {
  const request = recordValue(data?.permissionRequest);
  const kind = stringValue(request?.kind) ?? "unknown";
  return `需要权限 · ${kind}`;
}

function formatPermissionDetail(data: Record<string, unknown> | undefined): string | undefined {
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

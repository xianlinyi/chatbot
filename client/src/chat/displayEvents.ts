import type { ChatDisplayEvent } from "../types.js";

export function createDisplayEvent(
  type: ChatDisplayEvent["type"],
  eventType: string,
  data: Record<string, unknown>
): ChatDisplayEvent {
  return { type, eventType, data };
}

export function displayEventTypeFor(eventType: string): ChatDisplayEvent["type"] {
  if (eventType.startsWith("tool.")) {
    return "tool";
  }

  if (eventType.startsWith("session.")) {
    return "session_event";
  }

  return "assistant_event";
}

export function areBooleanRecordsEqual(left: Record<string, boolean>, right: Record<string, boolean>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => left[key] === right[key]);
}

import type { AgentInfoResponse, StreamEvent } from "./types.js";

export async function fetchAgentInfo(signal?: AbortSignal): Promise<AgentInfoResponse> {
  const response = await fetch("/api/agent-info", { signal });
  if (!response.ok) {
    throw new Error("Unable to load agent info.");
  }

  return response.json() as Promise<AgentInfoResponse>;
}

export async function* sendMessage(
  sessionId: string | undefined,
  message: string,
  signal?: AbortSignal
): AsyncIterable<StreamEvent> {
  const response = await fetch("/api/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ sessionId, message }),
    signal
  });

  if (!response.ok || !response.body) {
    const error = await safeError(response);
    throw new Error(error);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const event = parseSseFrame(frame);
      if (event) {
        yield event;
      }
    }
  }
}

export async function answerUserInput(
  sessionId: string,
  requestId: string,
  answer: string,
  wasFreeform = true
): Promise<void> {
  const response = await fetch("/api/user-input", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ sessionId, requestId, answer, wasFreeform })
  });

  if (!response.ok) {
    const error = await safeError(response);
    throw new Error(error);
  }
}

export async function enqueuePrompt(sessionId: string, message: string): Promise<void> {
  const response = await fetch("/api/prompts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ sessionId, message })
  });

  if (!response.ok) {
    const error = await safeError(response);
    throw new Error(error);
  }
}

export async function stopSession(sessionId: string | undefined): Promise<void> {
  const response = await fetch("/api/stop", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ sessionId })
  });

  if (!response.ok) {
    const error = await safeError(response);
    throw new Error(error);
  }
}

async function safeError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? "Agent request failed.";
  } catch {
    return "Agent request failed.";
  }
}

function parseSseFrame(frame: string): StreamEvent | undefined {
  const dataLine = frame
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("data:"));

  if (!dataLine) {
    return undefined;
  }

  return JSON.parse(dataLine.slice("data:".length).trim()) as StreamEvent;
}

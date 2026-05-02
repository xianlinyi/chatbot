import { describe, expect, it } from "vitest";
import { CopilotSdkAdapter } from "../src/copilot/CopilotSdkAdapter.js";
import type { AgentInfo, AgentProvider, AgentSession, AgentStreamEvent, ElicitationResult } from "../src/providers/types.js";
import { testConfig } from "./helpers.js";

describe("CopilotSdkAdapter", () => {
  it("prefers text-only provider calls for internal runtime asks", async () => {
    const provider = new TextFirstProvider();
    const adapter = new CopilotSdkAdapter(provider);

    await expect(adapter.ask("hello")).resolves.toBe("text result");

    expect(provider.textCallCount).toBe(1);
    expect(provider.streamCallCount).toBe(0);
  });

  it("falls back to stream collection when the provider has no text API", async () => {
    const provider = new StreamOnlyProvider();
    const adapter = new CopilotSdkAdapter(provider);

    await expect(adapter.ask("hello")).resolves.toBe("stream result");

    expect(provider.streamCallCount).toBe(1);
  });
});

class TextFirstProvider implements AgentProvider {
  textCallCount = 0;
  streamCallCount = 0;

  getInfo(): AgentInfo {
    return info();
  }

  async createSession(): Promise<AgentSession> {
    return session();
  }

  async sendMessageText(): Promise<string> {
    this.textCallCount += 1;
    return "text result";
  }

  async *sendMessageStream(): AsyncIterable<AgentStreamEvent> {
    this.streamCallCount += 1;
    yield { type: "delta", content: "stream result" };
  }

  async enqueuePrompt(): Promise<boolean> {
    return false;
  }

  async respondToUserInput(): Promise<boolean> {
    return false;
  }

  async respondToElicitation(_sessionId: string, _requestId: string, _result: ElicitationResult): Promise<boolean> {
    return false;
  }

  async closeSession(): Promise<void> {}

  async stop(): Promise<void> {}
}

class StreamOnlyProvider implements AgentProvider {
  streamCallCount = 0;

  getInfo(): AgentInfo {
    return info();
  }

  async createSession(): Promise<AgentSession> {
    return session();
  }

  async *sendMessageStream(): AsyncIterable<AgentStreamEvent> {
    this.streamCallCount += 1;
    yield { type: "delta", content: "stream " };
    yield { type: "delta", content: "result" };
  }

  async enqueuePrompt(): Promise<boolean> {
    return false;
  }

  async respondToUserInput(): Promise<boolean> {
    return false;
  }

  async respondToElicitation(_sessionId: string, _requestId: string, _result: ElicitationResult): Promise<boolean> {
    return false;
  }

  async closeSession(): Promise<void> {}

  async stop(): Promise<void> {}
}

function info(): AgentInfo {
  return {
    provider: "github-copilot",
    model: "test-model",
    auth: { mode: "none", hasToken: false },
    instructions: "",
    customAgents: [],
    skillDirectories: [],
    disabledSkills: [],
    mcpServers: {},
    permissions: testConfig.provider.permissions,
    persistence: { enabled: false, scope: "memory-only" }
  };
}

function session(): AgentSession {
  return { id: "session-1", createdAt: "2026-05-01T00:00:00.000Z" };
}

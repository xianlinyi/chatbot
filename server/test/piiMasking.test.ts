import { describe, expect, it, vi } from "vitest";
import { CopilotSdkAdapter } from "../src/copilot/CopilotSdkAdapter.js";
import { PiiMaskingService } from "../src/policy/PiiMaskingService.js";
import type { AgentInfo, AgentProvider, AgentSession, AgentStreamEvent, ElicitationResult } from "../src/providers/types.js";
import { testConfig } from "./helpers.js";

describe("PiiMaskingService", () => {
  it("redacts sensitive keys recursively before evidence is stored", () => {
    const masking = new PiiMaskingService(["literal-secret"]);

    expect(
      masking.maskUnknown({
        safe: "visible",
        password: "db-pass",
        nested: {
          Authorization: "Bearer token-value",
          connectionString: "mysql://user:pass@example.test/db",
          note: "literal-secret should not leak"
        }
      })
    ).toEqual({
      safe: "visible",
      password: "[SECRET_REDACTED]",
      nested: {
        Authorization: "[SECRET_REDACTED]",
        connectionString: "[SECRET_REDACTED]",
        note: "[SECRET_REDACTED] should not leak"
      }
    });
  });

  it("redacts inline credentials and bearer tokens in prompt text", () => {
    const masking = new PiiMaskingService();

    expect(
      masking.maskText("dsn=mysql://user:pass@example.test/db Authorization: Bearer abc.def password=hello")
    ).toBe(
      "dsn=mysql://user:[SECRET_REDACTED]@example.test/db Authorization: Bearer [SECRET_REDACTED] password=[SECRET_REDACTED]"
    );
  });
});

describe("CopilotSdkAdapter", () => {
  it("sanitizes prompts before sending them to the provider", async () => {
    const provider = new PromptCaptureProvider();
    const adapter = new CopilotSdkAdapter(provider, new PiiMaskingService(["super-secret"]));

    await adapter.ask("please use password=super-secret and Authorization: Bearer token-value");

    expect(provider.prompts[0]).toBe(
      "please use password=[SECRET_REDACTED] and Authorization: Bearer [SECRET_REDACTED]"
    );
  });
});

class PromptCaptureProvider implements AgentProvider {
  readonly prompts: string[] = [];

  getInfo(): AgentInfo {
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

  async createSession(): Promise<AgentSession> {
    return { id: "session-1", createdAt: "2026-05-01T00:00:00.000Z" };
  }

  async *sendMessageStream(_sessionId: string, prompt: string): AsyncIterable<AgentStreamEvent> {
    this.prompts.push(prompt);
    yield { type: "delta", content: "ok" };
  }

  async sendMessageText(_sessionId: string, prompt: string): Promise<string> {
    this.prompts.push(prompt);
    return "ok";
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

  async closeSession(): Promise<void> {
    vi.fn();
  }

  async stop(): Promise<void> {
    vi.fn();
  }
}

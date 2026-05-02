import type { AppConfig } from "../src/config/types.js";
import type {
  AgentInfo,
  AgentProvider,
  AgentSession,
  AgentStreamEvent,
  ElicitationResult
} from "../src/providers/types.js";

export const testConfig: AppConfig = {
  server: {
    host: "127.0.0.1",
    port: 3000
  },
  app: {
    name: "Test Chatbot",
    icon: "spark"
  },
  provider: {
    name: "github-copilot",
    model: "test-model",
    auth: {
      token: "secret-token",
      tokenType: "fine-grained-pat",
      useLoggedInUser: false
    },
    instructions: "Test instructions",
    customAgents: [
      {
        name: "test-agent",
        prompt: "Test prompt",
        description: "Test description"
      }
    ],
    skillDirectories: ["./skills"],
    disabledSkills: [],
    mcpServers: {
      demo: {
        type: "http",
        url: "https://example.test",
        headers: {
          authorization: "Bearer secret"
        },
        tools: ["*"]
      }
    },
    permissions: {
      mode: "allow-all"
    }
  }
};

export class MockAgentProvider implements AgentProvider {
  readonly closed = new Set<string>();
  readonly prompts: Array<{ sessionId: string; prompt: string }> = [];
  activePromptSessionIds = new Set<string>(["session-1"]);
  readonly info: AgentInfo = {
    provider: "github-copilot",
    model: "test-model",
    auth: {
      mode: "token",
      tokenType: "fine-grained-pat",
      hasToken: true
    },
    instructions: "Test instructions",
    customAgents: testConfig.provider.customAgents,
    skillDirectories: testConfig.provider.skillDirectories,
    disabledSkills: [],
    mcpServers: testConfig.provider.mcpServers,
    permissions: testConfig.provider.permissions,
    persistence: {
      enabled: false,
      scope: "memory-only"
    }
  };

  getInfo(): AgentInfo {
    return this.info;
  }

  async createSession(): Promise<AgentSession> {
    return {
      id: "session-1",
      createdAt: "2026-04-20T00:00:00.000Z"
    };
  }

  async *sendMessageStream(): AsyncIterable<AgentStreamEvent> {
    yield { type: "delta", content: "hel" };
    yield { type: "delta", content: "lo" };
    yield { type: "done" };
  }

  async sendMessageText(): Promise<string> {
    return "hello";
  }

  async enqueuePrompt(sessionId: string, prompt: string): Promise<boolean> {
    if (!this.activePromptSessionIds.has(sessionId)) {
      return false;
    }

    this.prompts.push({ sessionId, prompt });
    return true;
  }

  async respondToUserInput(
    sessionId: string,
    requestId: string,
    answer: string,
    _wasFreeform: boolean
  ): Promise<boolean> {
    return sessionId === "session-1" && requestId === "request-1" && Boolean(answer);
  }

  async respondToElicitation(sessionId: string, requestId: string, result: ElicitationResult): Promise<boolean> {
    return sessionId === "session-1" && requestId === "elicitation-1" && result.action === "accept";
  }

  async closeSession(sessionId: string): Promise<void> {
    this.closed.add(sessionId);
  }

  async stop(): Promise<void> {}
}

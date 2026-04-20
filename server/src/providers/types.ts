import type { AppConfig, CustomAgentConfig, McpServerConfig, PermissionMode } from "../config/types.js";

export type AgentInfo = {
  provider: string;
  model: string;
  auth: {
    mode: "github-token" | "logged-in-user" | "none";
    githubTokenEnv?: string;
    hasGithubToken: boolean;
  };
  instructions: string;
  customAgents: CustomAgentConfig[];
  skillDirectories: string[];
  disabledSkills: string[];
  mcpServers: Record<string, McpServerConfig>;
  permissions: {
    mode: PermissionMode;
  };
  persistence: {
    enabled: false;
    scope: "memory-only";
  };
};

export type AgentSession = {
  id: string;
  createdAt: string;
};

export type AgentStreamEvent =
  | { type: "session"; sessionId: string; created: boolean }
  | { type: "delta"; content: string }
  | { type: "done" }
  | { type: "error"; message: string };

export interface AgentProvider {
  getInfo(): AgentInfo;
  createSession(): Promise<AgentSession>;
  sendMessageStream(sessionId: string, prompt: string): AsyncIterable<AgentStreamEvent>;
  closeSession(sessionId: string): Promise<void>;
  stop(): Promise<void>;
}

export type ProviderFactory = (config: AppConfig) => AgentProvider;

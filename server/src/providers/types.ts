import type {
  AppConfig,
  CopilotTokenType,
  CustomAgentConfig,
  McpServerConfig,
  PermissionMode
} from "../config/types.js";

export type AgentInfo = {
  provider: string;
  model: string;
  auth: {
    mode: "token" | "logged-in-user" | "none";
    tokenType?: CopilotTokenType;
    hasToken: boolean;
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
  | { type: "activity"; title: string; detail?: string; level?: "info" | "warning" | "error" }
  | {
      type: "input_request";
      requestId: string;
      question: string;
      choices?: string[];
      allowFreeform: boolean;
    }
  | { type: "input_response"; requestId: string; answer: string }
  | { type: "done" }
  | { type: "error"; message: string };

export interface AgentProvider {
  getInfo(): AgentInfo;
  createSession(): Promise<AgentSession>;
  sendMessageStream(sessionId: string, prompt: string): AsyncIterable<AgentStreamEvent>;
  respondToUserInput(sessionId: string, requestId: string, answer: string): Promise<boolean>;
  closeSession(sessionId: string): Promise<void>;
  stop(): Promise<void>;
}

export type ProviderFactory = (config: AppConfig) => AgentProvider;

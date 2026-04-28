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

export type ElicitationFieldValue = string | number | boolean | string[];

export type ElicitationSchemaField =
  | {
      type: "string";
      title?: string;
      description?: string;
      enum?: string[];
      enumNames?: string[];
      minLength?: number;
      maxLength?: number;
      format?: "email" | "uri" | "date" | "date-time";
      default?: string;
    }
  | {
      type: "boolean";
      title?: string;
      description?: string;
      default?: boolean;
    }
  | {
      type: "number" | "integer";
      title?: string;
      description?: string;
      minimum?: number;
      maximum?: number;
      default?: number;
    };

export type ElicitationSchema = {
  type: "object";
  properties: Record<string, ElicitationSchemaField>;
  required?: string[];
};

export type ElicitationResult = {
  action: "accept" | "decline" | "cancel";
  content?: Record<string, ElicitationFieldValue>;
};

export type ElicitationRequest = {
  requestId: string;
  message: string;
  requestedSchema?: ElicitationSchema;
  mode?: "form" | "url";
  elicitationSource?: string;
  url?: string;
};

export type ElicitationContext = Omit<ElicitationRequest, "requestId"> & {
  sessionId: string;
};

export type AgentStreamEvent =
  | { type: "session"; sessionId: string; created: boolean }
  | { type: "delta"; content: string }
  | { type: "copilot_event"; eventType: string; data: Record<string, unknown> }
  | { type: "assistant_event"; eventType: string; data: Record<string, unknown> }
  | { type: "session_event"; eventType: string; data: Record<string, unknown> }
  | { type: "tool"; eventType: string; data: Record<string, unknown> }
  | {
      type: "input_request";
      requestId: string;
      question: string;
      choices?: string[];
      allowFreeform: boolean;
    }
  | ({ type: "elicitation_request" } & ElicitationRequest)
  | { type: "done" }
  | { type: "error"; message: string };

export interface AgentProvider {
  getInfo(): AgentInfo;
  createSession(): Promise<AgentSession>;
  sendMessageStream(sessionId: string, prompt: string): AsyncIterable<AgentStreamEvent>;
  enqueuePrompt(sessionId: string, prompt: string): Promise<boolean>;
  respondToUserInput(sessionId: string, requestId: string, answer: string, wasFreeform: boolean): Promise<boolean>;
  respondToElicitation(sessionId: string, requestId: string, result: ElicitationResult): Promise<boolean>;
  closeSession(sessionId: string): Promise<void>;
  stop(): Promise<void>;
}

export type ProviderFactory = (config: AppConfig) => AgentProvider;

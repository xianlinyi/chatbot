export type AgentInfoResponse = {
  app: {
    name: string;
    icon: string;
  };
  agent: {
    provider: string;
    model: string;
    auth: {
      mode: string;
      tokenType?: "fine-grained-pat" | "copilot-cli-oauth" | "github-cli-oauth";
      hasToken: boolean;
    };
    instructions: string;
    customAgents: Array<{
      name: string;
      displayName?: string;
      description?: string;
    }>;
    skillDirectories: string[];
    disabledSkills: string[];
    mcpServers: Record<string, unknown>;
    permissions: {
      mode: string;
    };
    persistence: {
      enabled: false;
      scope: string;
    };
  };
};

export type ChatSession = {
  id: string;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  status?: "streaming" | "done" | "error";
  isNew?: boolean;
  inputRequests?: InputRequest[];
  events?: ChatDisplayEvent[];
};

export type ChatDisplayEvent = {
  type: "assistant_event" | "session_event" | "tool" | "input_request" | "elicitation_request";
  eventType: string;
  data: Record<string, unknown>;
};

export type InputRequest = {
  requestId: string;
  question: string;
  choices?: string[];
  allowFreeform: boolean;
};

export type ElicitationFieldValue = string | number | boolean | string[];

export type ElicitationSchemaField = {
  type: "string" | "number" | "integer" | "boolean";
  title?: string;
  description?: string;
  enum?: string[];
  enumNames?: string[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  default?: ElicitationFieldValue;
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

export type UsageStats = {
  inputTokens: number;
  outputTokens: number;
  duration: number;
};

export type StreamEvent =
  | {
      type: "session";
      sessionId: string;
      created: boolean;
    }
  | {
      type: "delta";
      content: string;
    }
  | {
      type: "copilot_event";
      eventType: string;
      data: Record<string, unknown>;
    }
  | {
      type: "assistant_event";
      eventType: string;
      data: Record<string, unknown>;
    }
  | {
      type: "session_event";
      eventType: string;
      data: Record<string, unknown>;
    }
  | {
      type: "tool";
      eventType: string;
      data: Record<string, unknown>;
    }
  | {
      type: "input_request";
      requestId: string;
      question: string;
      choices?: string[];
      allowFreeform: boolean;
    }
  | ({
      type: "elicitation_request";
    } & ElicitationRequest)
  | {
      type: "done";
    }
  | {
      type: "error";
      message: string;
    };

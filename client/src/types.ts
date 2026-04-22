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
  activities?: ActivityItem[];
  inputRequests?: InputRequest[];
  usage?: UsageStats;
};

export type ActivityItem = {
  id: string;
  title: string;
  detail?: string;
  level?: "info" | "warning" | "error";
  category?: "tool" | "permission" | "system" | "skill";
  status?: "running" | "complete";
  key?: string;
  skills?: SkillSummary[];
};

export type SkillSummary = {
  name: string;
  description?: string;
  path?: string;
  source?: string;
  pluginName?: string;
  pluginVersion?: string;
  allowedTools?: string[];
  enabled?: boolean;
  userInvocable?: boolean;
};

export type InputRequest = {
  requestId: string;
  question: string;
  choices?: string[];
  allowFreeform: boolean;
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
      type: "activity";
      event: {
        type?: string;
        data?: Record<string, unknown>;
      };
    }
  | {
      type: "input_request";
      requestId: string;
      question: string;
      choices?: string[];
      allowFreeform: boolean;
    }
  | {
      type: "input_response";
      requestId: string;
      answer: string;
    }
  | {
      type: "done";
    }
  | {
      type: "error";
      message: string;
    };

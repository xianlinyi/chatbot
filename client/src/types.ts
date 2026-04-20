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
      githubTokenEnv?: string;
      hasGithubToken: boolean;
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
      type: "done";
    }
  | {
      type: "error";
      message: string;
    };

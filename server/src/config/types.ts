export type PermissionMode = "allow-all";

export type CopilotTokenType = "fine-grained-pat" | "copilot-cli-oauth" | "github-cli-oauth";

export type McpServerConfig = {
  type?: "local" | "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  tools?: string[];
  timeout?: number;
  url?: string;
  headers?: Record<string, string>;
};

export type CustomAgentConfig = {
  name: string;
  displayName?: string;
  description?: string;
  prompt: string;
  tools?: string[] | null;
  mcpServers?: Record<string, McpServerConfig>;
  infer?: boolean;
};

export type SkillSourceConfig = {
  type: "git";
  url: string;
  branch?: string;
  path?: string;
};

export type AgentSkillWorkflowStep = {
  id: string;
  goal: string;
  required?: boolean;
};

export type AgentSkillWorkflow = {
  name: string;
  sourcePath: string;
  steps: AgentSkillWorkflowStep[];
};

export type MemoryConfig = {
  enabled: boolean;
  vaultPath: string;
  queryLimit: number;
};

export type AppConfig = {
  server: {
    host: string;
    port: number;
  };
  app: {
    name: string;
    icon: string;
  };
  provider: {
    name: "github-copilot";
    model: string;
    auth: {
      token?: string;
      tokenType?: CopilotTokenType;
      /** @deprecated Use token instead. */
      githubToken?: string;
      useLoggedInUser: boolean;
    };
    instructions: string;
    customAgents: CustomAgentConfig[];
    skillDirectories: string[];
    skillSources: SkillSourceConfig[];
    skillWorkflows: AgentSkillWorkflow[];
    disabledSkills: string[];
    mcpServers: Record<string, McpServerConfig>;
    permissions: {
      mode: PermissionMode;
    };
  };
  memory: MemoryConfig;
};

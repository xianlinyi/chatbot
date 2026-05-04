import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AppConfig, CopilotTokenType } from "./types.js";

const supportedTokenTypes = new Set<CopilotTokenType>([
  "fine-grained-pat",
  "copilot-cli-oauth",
  "github-cli-oauth"
]);

const defaultConfig: AppConfig = {
  server: {
    host: "0.0.0.0",
    port: 3000
  },
  app: {
    name: "Agent Chatbot",
    icon: "spark"
  },
  provider: {
    name: "github-copilot",
    model: "gpt-4.1",
    auth: {
      tokenType: "fine-grained-pat",
      useLoggedInUser: false
    },
    instructions:
      "You are a local coding agent exposed through a lightweight web chat. When the user asks you to perform an engineering task, keep working through the concrete steps until the task is completed or a real blocker is reached. Do not stop after saying you will do something. Use available tools, report concise progress, and ask for confirmation only when it is required to avoid an unsafe or ambiguous action.",
    customAgents: [],
    skillDirectories: [],
    skillSources: [],
    skillWorkflows: [],
    disabledSkills: [],
    mcpServers: {},
    permissions: {
      mode: "allow-all"
    }
  },
  memory: {
    enabled: false,
    vaultPath: "~/agent-memory/MyVault",
    queryLimit: 5
  }
};

type PartialConfig = Partial<AppConfig> & {
  server?: Partial<AppConfig["server"]>;
  provider?: Partial<AppConfig["provider"]>;
  app?: Partial<AppConfig["app"]>;
  memory?: Partial<AppConfig["memory"]>;
};

export async function loadConfig(cwd = process.cwd()): Promise<AppConfig> {
  const fileConfig = await readConfigFile(cwd);
  const merged = mergeConfig(defaultConfig, fileConfig);
  validateAuthConfig(merged.provider.auth);

  const providerName = process.env.AGENT_PROVIDER ?? merged.provider.name;
  if (providerName !== "github-copilot") {
    throw new Error(`Unsupported AGENT_PROVIDER "${providerName}". Only "github-copilot" is implemented.`);
  }

  return {
    ...merged,
    server: {
      ...merged.server,
      host: process.env.HOST ?? merged.server.host,
      port: Number(process.env.PORT ?? merged.server.port)
    },
    provider: {
      ...merged.provider,
      name: providerName,
      model: process.env.COPILOT_MODEL ?? merged.provider.model,
      auth: {
        ...merged.provider.auth,
        token: resolveConfiguredToken(merged.provider.auth)
      }
    }
  };
}

async function readConfigFile(cwd: string): Promise<PartialConfig> {
  const configPath = path.join(cwd, "agent.config.json");

  try {
    const raw = await readFile(configPath, "utf8");
    return JSON.parse(raw) as PartialConfig;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {};
    }

    throw new Error(`Unable to load agent.config.json: ${(error as Error).message}`);
  }
}

function mergeConfig(base: AppConfig, override: PartialConfig): AppConfig {
  return {
    server: {
      ...base.server,
      ...override.server
    },
    app: {
      ...base.app,
      ...override.app
    },
    memory: {
      ...base.memory,
      ...override.memory
    },
    provider: {
      ...base.provider,
      ...override.provider,
      customAgents: override.provider?.customAgents ?? base.provider.customAgents,
      skillDirectories: override.provider?.skillDirectories ?? base.provider.skillDirectories,
      skillSources: override.provider?.skillSources ?? base.provider.skillSources,
      skillWorkflows: override.provider?.skillWorkflows ?? base.provider.skillWorkflows,
      disabledSkills: override.provider?.disabledSkills ?? base.provider.disabledSkills,
      mcpServers: override.provider?.mcpServers ?? base.provider.mcpServers,
      auth: {
        ...base.provider.auth,
        ...override.provider?.auth
      },
      permissions: {
        ...base.provider.permissions,
        ...override.provider?.permissions
      }
    }
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function validateAuthConfig(auth: AppConfig["provider"]["auth"]): void {
  if (auth.tokenType && !supportedTokenTypes.has(auth.tokenType)) {
    throw new Error(
      `Unsupported provider.auth.tokenType "${auth.tokenType}". Supported values: ${[...supportedTokenTypes].join(", ")}.`
    );
  }

  const token = resolveConfiguredToken(auth);
  if (!token && !auth.useLoggedInUser) {
    throw new Error("provider.auth.token is required when provider.auth.useLoggedInUser is false.");
  }

  if (token?.startsWith("ghp_")) {
    throw new Error("Classic GitHub personal access tokens (ghp_) are not supported by GitHub Copilot SDK auth.");
  }
}

function resolveConfiguredToken(auth: AppConfig["provider"]["auth"]): string | undefined {
  return auth.token?.trim() || auth.githubToken?.trim() || undefined;
}

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "./types.js";

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
      githubTokenEnv: "GITHUB_TOKEN",
      useLoggedInUser: false
    },
    instructions:
      "You are a helpful local coding agent exposed through a lightweight web chat. Be concise, practical, and explicit about actions you can or cannot take.",
    customAgents: [],
    skillDirectories: [],
    disabledSkills: [],
    mcpServers: {},
    permissions: {
      mode: "allow-all"
    }
  }
};

type PartialConfig = Partial<AppConfig> & {
  server?: Partial<AppConfig["server"]>;
  provider?: Partial<AppConfig["provider"]>;
  app?: Partial<AppConfig["app"]>;
};

export async function loadConfig(cwd = process.cwd()): Promise<AppConfig> {
  const fileConfig = await readConfigFile(cwd);
  const merged = mergeConfig(defaultConfig, fileConfig);

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
        githubToken:
          process.env.COPILOT_GITHUB_TOKEN ??
          process.env.GITHUB_TOKEN ??
          process.env.GH_TOKEN ??
          resolveConfiguredToken(merged.provider.auth)
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
    provider: {
      ...base.provider,
      ...override.provider,
      customAgents: override.provider?.customAgents ?? base.provider.customAgents,
      skillDirectories: override.provider?.skillDirectories ?? base.provider.skillDirectories,
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

function resolveConfiguredToken(auth: AppConfig["provider"]["auth"]): string | undefined {
  if (auth.githubToken) {
    return auth.githubToken;
  }

  if (auth.githubTokenEnv) {
    return process.env[auth.githubTokenEnv];
  }

  return undefined;
}

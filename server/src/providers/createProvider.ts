import type { AppConfig } from "../config/types.js";
import { GithubCopilotAgentProvider } from "./githubCopilotProvider.js";
import type { AgentProvider } from "./types.js";

export function createProvider(config: AppConfig): AgentProvider {
  switch (config.provider.name) {
    case "github-copilot":
      return new GithubCopilotAgentProvider(config);
  }
}

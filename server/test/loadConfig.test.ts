import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/loadConfig.js";

const originalEnv = { ...process.env };
const tempDirs: string[] = [];

describe("loadConfig", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("reads token auth from config instead of token environment variables", async () => {
    process.env.GITHUB_TOKEN = "env-token";
    process.env.COPILOT_GITHUB_TOKEN = "copilot-env-token";
    process.env.GH_TOKEN = "gh-env-token";
    const cwd = await writeConfig({
      provider: {
        auth: {
          token: "config-token",
          tokenType: "github-cli-oauth",
          useLoggedInUser: false
        }
      }
    });

    const config = await loadConfig(cwd);

    expect(config.provider.auth.token).toBe("config-token");
    expect(config.provider.auth.tokenType).toBe("github-cli-oauth");
  });

  it("rejects unsupported token types", async () => {
    const cwd = await writeConfig({
      provider: {
        auth: {
          token: "config-token",
          tokenType: "classic-pat",
          useLoggedInUser: false
        }
      }
    });

    await expect(loadConfig(cwd)).rejects.toThrow("Unsupported provider.auth.tokenType");
  });

  it("rejects classic personal access tokens", async () => {
    const cwd = await writeConfig({
      provider: {
        auth: {
          token: "ghp_classic",
          tokenType: "fine-grained-pat",
          useLoggedInUser: false
        }
      }
    });

    await expect(loadConfig(cwd)).rejects.toThrow("Classic GitHub personal access tokens");
  });

  it("requires a configured token when logged-in user auth is disabled", async () => {
    const cwd = await writeConfig({
      provider: {
        auth: {
          token: "",
          tokenType: "fine-grained-pat",
          useLoggedInUser: false
        }
      }
    });

    await expect(loadConfig(cwd)).rejects.toThrow("provider.auth.token is required");
  });

  it("reads git skill sources from config", async () => {
    const cwd = await writeConfig({
      provider: {
        auth: {
          token: "config-token",
          tokenType: "fine-grained-pat",
          useLoggedInUser: false
        },
        skillDirectories: ["./resource/skills"],
        skillSources: [
          {
            type: "git",
            url: "https://github.com/example/skills.git",
            branch: "release",
            path: "skills"
          }
        ]
      }
    });

    const config = await loadConfig(cwd);

    expect(config.provider.skillDirectories).toEqual(["./resource/skills"]);
    expect(config.provider.skillSources).toEqual([
      {
        type: "git",
        url: "https://github.com/example/skills.git",
        branch: "release",
        path: "skills"
      }
    ]);
  });

  it("reads memory context config", async () => {
    const cwd = await writeConfig({
      memory: {
        enabled: true,
        vaultPath: "/tmp/test-memory-vault",
        queryLimit: 3
      },
      provider: {
        auth: {
          token: "config-token",
          tokenType: "fine-grained-pat",
          useLoggedInUser: false
        }
      }
    });

    const config = await loadConfig(cwd);

    expect(config.memory).toEqual({
      enabled: true,
      vaultPath: "/tmp/test-memory-vault",
      queryLimit: 3
    });
  });
});

async function writeConfig(config: Record<string, unknown>): Promise<string> {
  const cwd = await mkdtemp(path.join(tmpdir(), "chatbot-config-test-"));
  tempDirs.push(cwd);
  await writeFile(path.join(cwd, "agent.config.json"), JSON.stringify(config), "utf8");
  return cwd;
}

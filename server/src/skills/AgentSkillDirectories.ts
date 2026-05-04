import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { AppConfig, SkillSourceConfig } from "../config/types.js";

const execFileAsync = promisify(execFile);

export async function resolveAgentSkillDirectories(config: AppConfig, workspaceRoot: string): Promise<string[]> {
  const defaultDirectories = ["resource/skills", "resources/skills"]
    .map((directory) => resolvePath(workspaceRoot, directory))
    .filter((directory) => existsSync(directory));
  const configuredDirectories = config.provider.skillDirectories.map((directory) => resolvePath(workspaceRoot, directory));
  const sourceDirectories = await Promise.all(
    config.provider.skillSources.map((source) => materializeSkillSource(source, workspaceRoot))
  );

  return unique([...defaultDirectories, ...configuredDirectories, ...sourceDirectories]);
}

async function materializeSkillSource(source: SkillSourceConfig, workspaceRoot: string): Promise<string> {
  if (source.type !== "git") {
    throw new Error(`Unsupported skill source type "${String(source.type)}".`);
  }

  const branch = source.branch ?? "main";
  const cacheRoot = path.join(workspaceRoot, ".cache", "agent-skills");
  const checkoutRoot = path.join(cacheRoot, safeCacheName(`${source.url}#${branch}`));
  await mkdir(cacheRoot, { recursive: true });
  await rm(checkoutRoot, { recursive: true, force: true });
  await execFileAsync("git", ["clone", "--depth", "1", "--branch", branch, source.url, checkoutRoot], {
    cwd: workspaceRoot,
    timeout: 120_000
  });

  return source.path ? path.join(checkoutRoot, source.path) : checkoutRoot;
}

function resolvePath(root: string, value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(root, value);
}

function safeCacheName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

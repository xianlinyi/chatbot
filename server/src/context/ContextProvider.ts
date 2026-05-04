import { homedir } from "node:os";
import path from "node:path";
import { MemoryEngine } from "@xianlinyi/agent-memory";
import type { WikiQueryResult } from "@xianlinyi/agent-memory";
import type { MemoryConfig } from "../config/types.js";
import type {
  ContextBundle,
  ContextTerm,
  ContextTermKind,
  MemoryContext,
  MemoryContextPage,
  MemoryContextSource,
  ProjectContext,
  ResolvedContextTerm,
  SkillDefinition,
  TaskSpec
} from "../model/agentTypes.js";

const DEFAULT_CONTEXT_QUERY_LIMIT = 5;

export type MemoryEngineLike = {
  query(input: { text: string; limit?: number; synthesize?: boolean }): Promise<WikiQueryResult>;
  ingest?(input: {
    text: string;
    targetScope?: "memory" | "wiki";
    source?: {
      kind?: "message";
      label?: string;
      uri?: string;
    };
    memory?: {
      class?: "semantic";
      sessionId?: string;
      eventTime?: string;
      confidence?: number;
    };
    deferConsolidation?: boolean;
  }): Promise<unknown>;
  consolidate?(options?: { sessionId?: string }): Promise<unknown>;
  close?(): Promise<void>;
};

export type ContextProviderOptions = {
  createMemoryEngine?: (vaultPath: string) => Promise<MemoryEngineLike>;
};

export type ContextDefinition = {
  term: string;
  meaning: string;
};

export type ParsedContextDefinitions = {
  definitions: ContextDefinition[];
  invalidLines: string[];
};

export class ContextProvider {
  private readonly createMemoryEngine: (vaultPath: string) => Promise<MemoryEngineLike>;

  constructor(
    private readonly workspaceRoot = process.cwd(),
    private readonly memoryConfig?: MemoryConfig,
    options: ContextProviderOptions = {}
  ) {
    this.createMemoryEngine = options.createMemoryEngine ?? ((vaultPath) => MemoryEngine.create({ vaultPath }));
  }

  loadBase(): ContextBundle {
    return {
      projects: [this.chatbotProject()],
      concepts: [],
      systems: [],
      memory: emptyMemoryContext({ enabled: Boolean(this.memoryConfig?.enabled) })
    };
  }

  async load(taskSpec: TaskSpec, selectedSkills: SkillDefinition[] = []): Promise<ContextBundle> {
    const projects = [this.chatbotProject()];
    const terms = planContextTerms(taskSpec, selectedSkills);
    const memory = await this.resolveMemory(terms);

    return {
      projects,
      concepts: [],
      systems: [],
      memory
    };
  }

  async ingestContextDefinitions(definitions: ContextDefinition[], sessionId?: string): Promise<string[]> {
    if (!this.memoryConfig?.enabled || definitions.length === 0) {
      return [];
    }

    const vaultPath = resolveHome(this.memoryConfig.vaultPath);
    const engine = await this.createMemoryEngine(vaultPath);
    const stored: string[] = [];
    try {
      if (!engine.ingest) {
        return stored;
      }

      for (const definition of definitions) {
        await engine.ingest({
          text: `${definition.term}: ${definition.meaning}`,
          targetScope: "memory",
          source: {
            kind: "message",
            label: `Context definition: ${definition.term}`
          },
          memory: {
            class: "semantic",
            sessionId,
            eventTime: new Date().toISOString(),
            confidence: 0.8
          },
          deferConsolidation: true
        });
        stored.push(definition.term);
      }

      await engine.consolidate?.({ sessionId });
      return stored;
    } finally {
      await engine.close?.();
    }
  }

  private async resolveMemory(terms: ContextTerm[]): Promise<MemoryContext> {
    const loadedAt = new Date().toISOString();
    if (!this.memoryConfig?.enabled) {
      return {
        loadedAt,
        enabled: false,
        terms,
        resolved: [],
        missing: []
      };
    }

    const vaultPath = resolveHome(this.memoryConfig.vaultPath);
    if (terms.length === 0) {
      return {
        loadedAt,
        enabled: true,
        vaultPath,
        terms,
        resolved: [],
        missing: []
      };
    }

    const engine = await this.createMemoryEngine(vaultPath);
    const resolved: ResolvedContextTerm[] = [];
    const missing: ContextTerm[] = [];
    try {
      for (const term of terms) {
        const result = await engine.query({
          text: term.term,
          limit: this.memoryConfig.queryLimit || DEFAULT_CONTEXT_QUERY_LIMIT,
          synthesize: false
        });
        if (result.pages.length === 0) {
          missing.push(term);
          continue;
        }

        resolved.push({
          term,
          pages: result.pages.map(compactPage),
          sources: result.sources.map(compactSource)
        });
      }

      return {
        loadedAt,
        enabled: true,
        vaultPath,
        terms,
        resolved,
        missing
      };
    } catch (error) {
      return {
        loadedAt,
        enabled: true,
        vaultPath,
        terms,
        resolved,
        missing: [],
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      await engine.close?.();
    }
  }

  private chatbotProject(): ProjectContext {
    return {
      name: "chatbot",
      aliases: ["chatbot", "聊天机器人", "bot 项目"],
      path: this.workspaceRoot,
      repo: true,
      framework: "React + Fastify",
      packageManager: "npm",
      commands: {
        test: "npm test",
        build: "npm run build"
      },
      structure: {
        client: "client/src",
        server: "server/src",
        components: "client/src/components",
        providers: "server/src/providers"
      },
      policies: ["不自动 push", "修改前必须查看 git diff", "修复后必须运行 lint 或 test"]
    };
  }
}

export function planContextTerms(taskSpec: TaskSpec, selectedSkills: SkillDefinition[] = []): ContextTerm[] {
  const terms = new Map<string, ContextTerm>();
  const add = (term: string | null | undefined, kind: ContextTermKind, reason: string, required = true) => {
    const normalized = normalizeContextTerm(term);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    const existing = terms.get(key);
    if (existing) {
      terms.set(key, {
        ...existing,
        required: existing.required || required,
        reason: existing.reason === reason ? existing.reason : `${existing.reason}; ${reason}`
      });
      return;
    }

    terms.set(key, {
      term: normalized,
      reason,
      kind,
      required
    });
  };

  for (const term of taskSpec.context_terms ?? []) add(term, "prompt", "Prompt context term");
  if (taskSpec.domain) add(taskSpec.domain, "task", "Task domain");
  if (taskSpec.scenario) add(taskSpec.scenario, "task", "Task scenario");

  for (const entity of taskSpec.entities) {
    add(entity.type, "entity", `Task entity type ${entity.type}`);
    add(entity.name, "entity", `Task entity ${entity.type}`);
    add(entity.canonical_name, "entity", `Task entity ${entity.type}`);
    if (!looksLikeOpaqueIdentifier(entity.value)) add(entity.value, "entity", `Task entity ${entity.type}`);
  }

  for (const term of promptContextHints(taskSpec.rawInput)) add(term, "prompt", "Prompt context hint");

  for (const skill of selectedSkills) {
    for (const term of skill.required_entities?.all_of ?? []) add(term, "skill", `Skill ${skill.name} required entity`);
    for (const term of skill.required_entities?.any_of ?? []) add(term, "skill", `Skill ${skill.name} accepted entity`);
    for (const term of skill.triggers?.keywords ?? []) add(term, "skill", `Skill ${skill.name} trigger keyword`);
  }

  return [...terms.values()];
}

export function parseContextDefinitionAnswer(answer: string): ParsedContextDefinitions {
  const definitions: ContextDefinition[] = [];
  const invalidLines: string[] = [];

  for (const rawLine of answer.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const separator = line.indexOf("=");
    if (separator <= 0 || separator === line.length - 1) {
      invalidLines.push(line);
      continue;
    }

    const term = normalizeContextTerm(line.slice(0, separator));
    const meaning = line.slice(separator + 1).trim();
    if (!term || !meaning) {
      invalidLines.push(line);
      continue;
    }

    definitions.push({ term, meaning });
  }

  return { definitions, invalidLines };
}

function emptyMemoryContext(options: { enabled: boolean }): MemoryContext {
  return {
    loadedAt: new Date().toISOString(),
    enabled: options.enabled,
    terms: [],
    resolved: [],
    missing: []
  };
}

function compactPage(page: WikiQueryResult["pages"][number]): MemoryContextPage {
  return {
    title: page.title,
    path: page.path,
    summary: page.summary,
    snippet: page.snippet,
    score: page.score
  };
}

function compactSource(source: WikiQueryResult["sources"][number]): MemoryContextSource {
  return {
    id: source.id,
    path: source.path,
    label: source.label,
    kind: source.kind,
    uri: source.uri
  };
}

function promptContextHints(input: string): string[] {
  const terms = new Set<string>();
  const patterns = [
    /`([^`]{2,80})`/g,
    /["']([^"']{2,80})["']/g,
    /\b([A-Za-z][A-Za-z0-9_.-]{1,60})\s*=/g,
    /\b([A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)+)\b/g,
    /\b([A-Za-z]+[A-Z][A-Za-z0-9]*)\b/g
  ];

  for (const pattern of patterns) {
    for (const match of input.matchAll(pattern)) {
      const term = normalizeContextTerm(match[1]);
      if (term && !COMMON_PROMPT_TERMS.has(term.toLowerCase()) && !looksLikeOpaqueIdentifier(term)) {
        terms.add(term);
      }
    }
  }

  return [...terms];
}

function normalizeContextTerm(value: string | null | undefined): string | undefined {
  const normalized = value?.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length < 2 || normalized.length > 80) return undefined;
  if (/^\d+$/.test(normalized)) return undefined;
  return normalized;
}

function looksLikeOpaqueIdentifier(value: string | null | undefined): boolean {
  const normalized = value?.trim();
  if (!normalized) return false;
  if (/^\d+$/.test(normalized)) return true;
  if (/^[a-f0-9]{12,}$/i.test(normalized)) return true;
  return false;
}

function resolveHome(inputPath: string): string {
  if (inputPath === "~") return homedir();
  if (inputPath.startsWith("~/")) return path.join(homedir(), inputPath.slice(2));
  return path.resolve(inputPath);
}

const COMMON_PROMPT_TERMS = new Set([
  "http",
  "https",
  "localhost",
  "true",
  "false",
  "null",
  "undefined"
]);

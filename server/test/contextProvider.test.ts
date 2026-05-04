import { describe, expect, it } from "vitest";
import {
  ContextProvider,
  parseContextDefinitionAnswer,
  planContextTerms,
  type MemoryEngineLike
} from "../src/context/ContextProvider.js";
import type { SkillDefinition, TaskSpec } from "../src/model/agentTypes.js";

describe("ContextProvider", () => {
  it("plans context terms from task entities, prompt hints, and selected skills", () => {
    const task = taskSpec({
      rawInput: "帮我查 orderId=123456 的 `payment proof`",
      context_terms: ["payment proof"],
      entities: [
        {
          type: "orderId",
          name: "order id",
          value: "123456",
          canonical_name: "orderId",
          confidence: 0.9
        }
      ]
    });
    const skill: SkillDefinition = {
      name: "payment-diagnosis",
      type: "diagnosis",
      description: "Diagnose payment delivery",
      required_entities: {
        all_of: ["customerAccount"]
      },
      triggers: {
        keywords: ["payment proof"]
      },
      steps: []
    };

    const terms = planContextTerms(task, [skill]);

    expect(terms.map((term) => term.term)).toEqual(["payment proof", "orderId", "order id", "customerAccount"]);
    expect(terms.find((term) => term.term === "payment proof")?.reason).toContain("Prompt context term");
    expect(terms.find((term) => term.term === "orderId")?.reason).toContain("Task entity type");
    expect(terms.find((term) => term.term === "customerAccount")?.reason).toContain("Skill payment-diagnosis");
  });

  it("resolves each memory context term independently", async () => {
    const calls: string[] = [];
    const provider = new ContextProvider(
      process.cwd(),
      { enabled: true, vaultPath: "/tmp/context-test", queryLimit: 3 },
      {
        createMemoryEngine: async () => fakeMemoryEngine(calls, new Set(["known-term"]))
      }
    );

    const context = await provider.load(taskSpec({ context_terms: ["known-term", "missing-term"] }));

    expect(calls).toEqual(["known-term", "missing-term"]);
    expect(context.memory.enabled).toBe(true);
    expect(context.memory.resolved.map((item) => item.term.term)).toEqual(["known-term"]);
    expect(context.memory.missing.map((term) => term.term)).toEqual(["missing-term"]);
  });

  it("skips missing-term clarification when memory is disabled", async () => {
    const provider = new ContextProvider(
      process.cwd(),
      { enabled: false, vaultPath: "/tmp/context-test", queryLimit: 3 },
      {
        createMemoryEngine: async () => {
          throw new Error("memory should not be opened when disabled");
        }
      }
    );

    const context = await provider.load(taskSpec({ context_terms: ["unknown-term"] }));

    expect(context.memory.enabled).toBe(false);
    expect(context.memory.terms.map((term) => term.term)).toEqual(["unknown-term"]);
    expect(context.memory.missing).toEqual([]);
  });

  it("parses newline key-value context definitions", () => {
    const parsed = parseContextDefinitionAnswer(
      [
        "foo=Foo means the payment artifact",
        "",
        "bar = Bar is the callback service",
        "not a key value",
        "empty="
      ].join("\n")
    );

    expect(parsed.definitions).toEqual([
      { term: "foo", meaning: "Foo means the payment artifact" },
      { term: "bar", meaning: "Bar is the callback service" }
    ]);
    expect(parsed.invalidLines).toEqual(["not a key value", "empty="]);
  });
});

function fakeMemoryEngine(calls: string[], hits: Set<string>): MemoryEngineLike {
  return {
    query: async ({ text }) => {
      calls.push(text);
      if (!hits.has(text)) {
        return {
          query: text,
          answer: "",
          pages: [],
          sources: []
        };
      }

      return {
        query: text,
        answer: "",
        pages: [
          {
            id: `page-${text}`,
            path: `memory/long/semantic/${text}.md`,
            title: text,
            summary: `${text} summary`,
            snippet: `${text} snippet`,
            score: 1
          }
        ],
        sources: [
          {
            id: `raw-${text}`,
            path: `memory/raw/${text}.md`,
            label: text,
            kind: "message"
          }
        ]
      };
    }
  };
}

function taskSpec(overrides: Partial<TaskSpec> = {}): TaskSpec {
  return {
    taskId: "task-1",
    rawInput: "test prompt",
    intent: "unknown",
    domain: null,
    scenario: null,
    entities: [],
    context_terms: [],
    missing_info: [],
    risk_level: "readonly",
    recommended_skills: [],
    clarifying_question: null,
    ...overrides
  };
}

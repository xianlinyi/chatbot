import { describe, expect, it } from "vitest";
import { AgentTaskService } from "../src/agent/AgentTaskService.js";
import { ContextProvider, type MemoryEngineLike } from "../src/context/ContextProvider.js";
import type { AgentProvider } from "../src/providers/types.js";
import { MockAgentProvider } from "./helpers.js";

describe("AgentTaskService context clarification", () => {
  it("asks for missing memory context, stores key-value definitions, and continues", async () => {
    const memory = sharedMemoryEngine();
    const provider = new ContextTermProvider(["foo"]);
    const service = new AgentTaskService(
      provider,
      process.cwd(),
      undefined,
      { enabled: true, vaultPath: "/tmp/context-test", queryLimit: 3 },
      {
        contextProvider: new ContextProvider(process.cwd(), { enabled: true, vaultPath: "/tmp/context-test", queryLimit: 3 }, {
          createMemoryEngine: memory.create
        })
      }
    );

    const events = [];
    for await (const event of service.runMessageStream("session-1", "foo 是什么")) {
      events.push(event);
      if (event.type === "input_request") {
        const accepted = await service.respondToUserInput(
          "session-1",
          event.requestId,
          "foo=Foo means the payment artifact",
          true
        );
        expect(accepted).toBe(true);
      }
    }

    expect(events.some((event) => event.type === "input_request")).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === "assistant_event" &&
          event.eventType === "runtime.context_definitions_saved" &&
          Array.isArray(event.data.storedTerms) &&
          event.data.storedTerms.includes("foo")
      )
    ).toBe(true);
    expect(events).toContainEqual({ type: "delta", content: "final answer" });
    expect(events.at(-1)).toEqual({ type: "done" });
    expect(memory.ingested).toEqual(["foo: Foo means the payment artifact"]);
    expect(memory.consolidations).toBe(1);
    expect(memory.queries).toEqual(["foo", "foo"]);
  });

  it("does not ask for clarification when memory already resolves all terms", async () => {
    const memory = sharedMemoryEngine(["foo"]);
    const provider = new ContextTermProvider(["foo"]);
    const service = new AgentTaskService(
      provider,
      process.cwd(),
      undefined,
      { enabled: true, vaultPath: "/tmp/context-test", queryLimit: 3 },
      {
        contextProvider: new ContextProvider(process.cwd(), { enabled: true, vaultPath: "/tmp/context-test", queryLimit: 3 }, {
          createMemoryEngine: memory.create
        })
      }
    );

    const events = [];
    for await (const event of service.runMessageStream("session-1", "foo 是什么")) {
      events.push(event);
    }

    expect(events.some((event) => event.type === "input_request")).toBe(false);
    expect(events).toContainEqual({ type: "delta", content: "final answer" });
    expect(events.at(-1)).toEqual({ type: "done" });
    expect(memory.ingested).toEqual([]);
  });
});

class ContextTermProvider extends MockAgentProvider implements AgentProvider {
  constructor(private readonly contextTerms: string[]) {
    super();
  }

  override async sendMessageText(_sessionId: string, prompt: string): Promise<string> {
    if (prompt.includes("TaskSpecIntentExtraction")) {
      return JSON.stringify({
        intent: "unknown",
        domain: null,
        scenario: null,
        entities: [],
        context_terms: this.contextTerms,
        missing_info: [],
        risk_level: "readonly",
        recommended_skills: [],
        clarifying_question: null
      });
    }

    return "final answer";
  }
}

function sharedMemoryEngine(initialHits: string[] = []) {
  const hits = new Set(initialHits);
  const memory = {
    queries: [] as string[],
    ingested: [] as string[],
    consolidations: 0,
    create: async (): Promise<MemoryEngineLike> => ({
      query: async ({ text }) => {
        memory.queries.push(text);
        if (!hits.has(text)) {
          return { query: text, answer: "", pages: [], sources: [] };
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
          sources: []
        };
      },
      ingest: async ({ text }) => {
        memory.ingested.push(text);
        const term = text.split(":")[0]?.trim();
        if (term) hits.add(term);
      },
      consolidate: async () => {
        memory.consolidations += 1;
      }
    })
  };
  return memory;
}

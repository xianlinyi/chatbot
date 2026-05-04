import { nanoid } from "nanoid";
import type { TaskSpec } from "../model/agentTypes.js";
import type { StructuredJsonProvider } from "../copilot/StructuredJsonProvider.js";
import { taskSpecStructuredJsonInstructions, taskSpecStructuredJsonSchema } from "./taskSpecSchema.js";

export class TaskParser {
  constructor(private readonly structuredJson?: StructuredJsonProvider) {}

  async parse(rawInput: string): Promise<TaskSpec> {
    if (this.structuredJson) {
      try {
        return withRuntimeFields(
          await this.structuredJson.extract<Omit<TaskSpec, "taskId" | "rawInput">>({
            name: "TaskSpecIntentExtraction",
            schema: taskSpecStructuredJsonSchema,
            input: rawInput,
            instructions: taskSpecStructuredJsonInstructions
          }),
          rawInput
        );
      } catch {
        // The runtime must remain available even when model JSON parsing fails.
      }
    }

    return createUnclassifiedTask(rawInput);
  }
}

function withRuntimeFields(parsed: Omit<TaskSpec, "taskId" | "rawInput">, rawInput: string): TaskSpec {
  return {
    ...parsed,
    taskId: nanoid(),
    rawInput,
    entities: parsed.entities ?? [],
    context_terms: parsed.context_terms ?? [],
    missing_info: parsed.missing_info ?? [],
    recommended_skills: parsed.recommended_skills ?? [],
    clarifying_question: parsed.clarifying_question ?? null
  };
}

function createUnclassifiedTask(rawInput: string): TaskSpec {
  return {
    taskId: nanoid(),
    rawInput,
    intent: "unknown",
    domain: null,
    scenario: null,
    entities: [],
    context_terms: [],
    missing_info: [],
    risk_level: "readonly",
    recommended_skills: [],
    clarifying_question: null
  };
}

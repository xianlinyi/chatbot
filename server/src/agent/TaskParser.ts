import { nanoid } from "nanoid";
import type { EntityRef, TaskSpec } from "../model/agentTypes.js";
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

    return parseWithRules(rawInput);
  }
}

function withRuntimeFields(parsed: Omit<TaskSpec, "taskId" | "rawInput">, rawInput: string): TaskSpec {
  return {
    ...parsed,
    taskId: nanoid(),
    rawInput,
    entities: parsed.entities ?? [],
    missing_info: parsed.missing_info ?? [],
    recommended_skills: parsed.recommended_skills ?? [],
    clarifying_question: parsed.clarifying_question ?? null
  };
}

function parseWithRules(rawInput: string): TaskSpec {
  const input = rawInput.toLowerCase();
  const entities: EntityRef[] = [];
  const orderId = /(orderid|order_id|订单号|订单)\s*[:=：]?\s*([a-z0-9_-]+)/i.exec(rawInput);
  if (orderId?.[2]) {
    entities.push({
      type: "order_id",
      name: orderId[1],
      value: orderId[2],
      canonical_name: null,
      confidence: 1,
      source: "user_input"
    });
  }

  if (input.includes("payment proof") || rawInput.includes("支付凭证") || rawInput.includes("付款凭证")) {
    entities.push({
      type: "business_concept",
      name: "payment proof",
      value: null,
      canonical_name: "payment_proof",
      confidence: 0.95,
      source: "user_input"
    });
  }

  if (input.includes("chatbot") || rawInput.includes("聊天机器人")) {
    entities.push({
      type: "project",
      name: "chatbot",
      value: "chatbot",
      canonical_name: "chatbot",
      confidence: 0.98,
      source: "user_input"
    });
  }

  const errorMessage = extractErrorMessage(rawInput);
  if (errorMessage) {
    entities.push({
      type: "error_message",
      name: "error_message",
      value: errorMessage,
      canonical_name: null,
      confidence: 0.8,
      source: "user_input"
    });
  }

  if (isCommitRequest(input)) {
    return {
      taskId: nanoid(),
      rawInput,
      intent: "git_commit",
      domain: "engineering",
      scenario: "git_commit",
      entities: ensureProject(entities),
      missing_info: [],
      risk_level: "write_requires_confirmation",
      recommended_skills: ["git-commit-workflow"],
      clarifying_question: null
    };
  }

  if (isBugRequest(input, rawInput)) {
    return {
      taskId: nanoid(),
      rawInput,
      intent: "fix_or_investigate_bug",
      domain: "engineering",
      scenario: "frontend_runtime_error",
      entities: ensureProject(entities),
      missing_info: [],
      risk_level: "code_write_requires_review",
      recommended_skills: ["code-bug-localization"],
      clarifying_question: null
    };
  }

  if (input.includes("payment proof") || input.includes("proof") || rawInput.includes("凭证")) {
    const missingInfo = entities.some((entity) => entity.type === "order_id") ? [] : ["order_id"];
    return {
      taskId: nanoid(),
      rawInput,
      intent: "diagnose_business_issue",
      domain: "payment",
      scenario: "artifact_delivery_missing",
      entities,
      missing_info: missingInfo,
      risk_level: "readonly",
      recommended_skills: ["artifact-delivery-diagnosis"],
      clarifying_question: missingInfo.length ? "请提供 orderId、paymentId、userId、requestId 或 traceId 中至少一个查询条件。" : null
    };
  }

  return {
    taskId: nanoid(),
    rawInput,
    intent: "unknown",
    domain: null,
    scenario: null,
    entities,
    missing_info: [],
    risk_level: "readonly",
    recommended_skills: ["default-investigation"],
    clarifying_question: null
  };
}

function isCommitRequest(input: string): boolean {
  return input.includes("commit") || input.includes("git commit") || input.includes("提交");
}

function isBugRequest(input: string, rawInput: string): boolean {
  return (
    input.includes("error") ||
    input.includes("bug") ||
    input.includes("undefined") ||
    input.includes("null") ||
    input.includes("exception") ||
    rawInput.includes("报错") ||
    rawInput.includes("期望") ||
    rawInput.includes("实际") ||
    rawInput.includes("截图")
  );
}

function ensureProject(entities: EntityRef[]): EntityRef[] {
  if (entities.some((entity) => entity.type === "project")) {
    return entities;
  }

  return [
    ...entities,
    {
      type: "project",
      name: "chatbot",
      value: "chatbot",
      canonical_name: "chatbot",
      confidence: 0.7,
      source: "context"
    }
  ];
}

function extractErrorMessage(rawInput: string): string | undefined {
  const cannotRead = /(Cannot\s+read[^，。.\n]+)/i.exec(rawInput);
  if (cannotRead?.[1]) {
    return cannotRead[1].trim();
  }

  const quoted = /["'“”‘’]([^"'“”‘’]+(?:undefined|null|error|exception)[^"'“”‘’]*)["'“”‘’]/i.exec(rawInput);
  return quoted?.[1]?.trim();
}

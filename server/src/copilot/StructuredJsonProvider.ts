import { PiiMaskingService } from "../policy/PiiMaskingService.js";
import type { CopilotSdkAdapter } from "./CopilotSdkAdapter.js";

export type JsonSchema =
  | {
      type: "object";
      properties: Record<string, JsonSchema>;
      required?: string[];
      additionalProperties?: boolean;
    }
  | {
      type: "array";
      items: JsonSchema;
    }
  | {
      type: "string";
      enum?: string[];
      nullable?: boolean;
    }
  | {
      type: "number" | "integer" | "boolean";
      nullable?: boolean;
    };

export type StructuredJsonRequest = {
  name: string;
  schema: JsonSchema;
  input: string;
  instructions?: string[];
};

const structuredJsonSystemPrompt = `你是一个结构化信息抽取引擎，不是聊天助手。
你的唯一任务是根据输入填充调用方提供的 JSON schema。
字段由程序定义，禁止自行设计字段。
禁止输出任何自然语言。
禁止输出 Markdown。
禁止解释。
只输出一个严格 JSON 对象。`;

export class StructuredJsonProvider {
  constructor(
    private readonly copilot: CopilotSdkAdapter,
    private readonly masking = new PiiMaskingService()
  ) {}

  async extract<T>(request: StructuredJsonRequest): Promise<T> {
    const prompt = this.createPrompt(request);
    const text = await this.copilot.ask(prompt);
    const parsed = JSON.parse(extractJson(text)) as unknown;
    const sanitized = this.masking.maskUnknown(parsed);
    assertMatchesSchema(sanitized, request.schema, request.name);
    return sanitized as T;
  }

  private createPrompt(request: StructuredJsonRequest): string {
    const rules = [
      "只能填充 schema 中已经存在的字段。",
      "所有 required 字段必须出现。",
      "additionalProperties=false 时禁止增加额外字段。",
      "无法判断的 string 字段填 null 或空字符串，array 字段填 []，boolean 字段填 false，number 字段填 0。",
      "输出必须能被 JSON.parse 直接解析。",
      "不要输出 ```json 代码块。"
    ];

    return [
      structuredJsonSystemPrompt,
      "",
      `任务名称: ${request.name}`,
      "",
      "固定规则:",
      ...rules.map((rule) => `- ${rule}`),
      ...(request.instructions?.length ? ["", "业务规则:", ...request.instructions.map((rule) => `- ${rule}`)] : []),
      "",
      "JSON Schema:",
      JSON.stringify(request.schema, null, 2),
      "",
      "用户输入:",
      request.input
    ].join("\n");
  }
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  throw new Error("Structured JSON response did not contain JSON.");
}

function assertMatchesSchema(value: unknown, schema: JsonSchema, path: string): void {
  if ("nullable" in schema && schema.nullable && value === null) {
    return;
  }

  switch (schema.type) {
    case "object":
      assertObject(value, schema, path);
      return;
    case "array":
      if (!Array.isArray(value)) {
        throw new Error(`${path} must be an array.`);
      }
      value.forEach((item, index) => assertMatchesSchema(item, schema.items, `${path}[${index}]`));
      return;
    case "string":
      if (typeof value !== "string") {
        throw new Error(`${path} must be a string.`);
      }
      if (schema.enum && !schema.enum.includes(value)) {
        throw new Error(`${path} must be one of: ${schema.enum.join(", ")}.`);
      }
      return;
    case "number":
      if (typeof value !== "number" || Number.isNaN(value)) {
        throw new Error(`${path} must be a number.`);
      }
      return;
    case "integer":
      if (typeof value !== "number" || !Number.isInteger(value)) {
        throw new Error(`${path} must be an integer.`);
      }
      return;
    case "boolean":
      if (typeof value !== "boolean") {
        throw new Error(`${path} must be a boolean.`);
      }
      return;
  }
}

function assertObject(value: unknown, schema: Extract<JsonSchema, { type: "object" }>, path: string): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }

  const record = value as Record<string, unknown>;
  for (const requiredKey of schema.required ?? []) {
    if (!(requiredKey in record)) {
      throw new Error(`${path}.${requiredKey} is required.`);
    }
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(record)) {
      if (!(key in schema.properties)) {
        throw new Error(`${path}.${key} is not allowed by schema.`);
      }
    }
  }

  for (const [key, childSchema] of Object.entries(schema.properties)) {
    if (key in record) {
      assertMatchesSchema(record[key], childSchema, `${path}.${key}`);
    }
  }
}

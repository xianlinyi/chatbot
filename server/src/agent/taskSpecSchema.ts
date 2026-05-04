import type { JsonSchema } from "../copilot/StructuredJsonProvider.js";

export const taskSpecStructuredJsonSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "intent",
    "domain",
    "scenario",
    "entities",
    "context_terms",
    "missing_info",
    "risk_level",
    "recommended_skills",
    "clarifying_question"
  ],
  properties: {
    intent: {
      type: "string",
      enum: [
        "diagnose_business_issue",
        "fix_or_investigate_bug",
        "git_commit",
        "code_search",
        "explain_code",
        "create_report",
        "unknown"
      ]
    },
    domain: { type: "string", nullable: true },
    scenario: { type: "string", nullable: true },
    entities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "name", "value", "canonical_name", "confidence"],
        properties: {
          type: { type: "string" },
          name: { type: "string", nullable: true },
          value: { type: "string", nullable: true },
          canonical_name: { type: "string", nullable: true },
          confidence: { type: "number" }
        }
      }
    },
    context_terms: {
      type: "array",
      items: { type: "string" }
    },
    missing_info: {
      type: "array",
      items: { type: "string" }
    },
    risk_level: {
      type: "string",
      enum: ["readonly", "write_requires_confirmation", "code_write_requires_review", "dangerous_requires_manual"]
    },
    recommended_skills: {
      type: "array",
      items: { type: "string" }
    },
    clarifying_question: { type: "string", nullable: true }
  }
};

export const taskSpecStructuredJsonInstructions = [
  "不要依赖内置业务规则或内置 skill 名称。",
  "只能从用户输入中抽取明确表达的信息；无法判断时 intent=unknown。",
  "context_terms 填用户输入中需要查询上下文含义的业务词、代码对象、缩写、系统名、实体名；不要做普通字面分词。",
  "只读查询 risk_level=readonly；写文件或改代码 risk_level=code_write_requires_review；commit、push 或外部副作用 risk_level=write_requires_confirmation；高危操作 risk_level=dangerous_requires_manual。",
  "recommended_skills 只填写上游或外部配置明确提供的 skill；没有明确匹配时填 []。",
  "不要添加 taskId 或 rawInput 字段，这两个字段由 Runtime 填充。"
];

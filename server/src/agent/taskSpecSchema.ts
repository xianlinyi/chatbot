import type { JsonSchema } from "../copilot/StructuredJsonProvider.js";

export const taskSpecStructuredJsonSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "intent",
    "domain",
    "scenario",
    "entities",
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
  "如果用户是在查业务问题，intent=diagnose_business_issue。",
  "如果用户是在描述测试问题、报错、截图、期望结果，intent=fix_or_investigate_bug。",
  "如果用户要求 commit，intent=git_commit。",
  "只读查询 risk_level=readonly。",
  "写文件或改代码 risk_level=code_write_requires_review。",
  "commit、push、重发通知 risk_level=write_requires_confirmation。",
  "数据库更新、生产部署 risk_level=dangerous_requires_manual。",
  "recommended_skills 只能从 artifact-delivery-diagnosis、async-chain-diagnosis、code-bug-localization、git-commit-workflow、default-investigation 中选择。",
  "不要添加 taskId 或 rawInput 字段，这两个字段由 Runtime 填充。"
];

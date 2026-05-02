import { describe, expect, it } from "vitest";
import { StructuredJsonProvider, type JsonSchema } from "../src/copilot/StructuredJsonProvider.js";

const schema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "businessType", "summary", "needImages", "priority", "nextAction"],
  properties: {
    intent: { type: "string" },
    businessType: { type: "string" },
    summary: { type: "string" },
    needImages: { type: "boolean" },
    priority: { type: "integer" },
    nextAction: {
      type: "array",
      items: { type: "string" }
    }
  }
};

describe("StructuredJsonProvider", () => {
  it("returns schema-shaped JSON when the model fills only allowed fields", async () => {
    const provider = new StructuredJsonProvider(
      fakeCopilot(
        JSON.stringify({
          intent: "bug_report",
          businessType: "payment",
          summary: "payment proof not sent",
          needImages: true,
          priority: 4,
          nextAction: ["select_skill"]
        })
      )
    );

    await expect(
      provider.extract({
        name: "TaskIntent",
        schema,
        input: "payment proof not sent"
      })
    ).resolves.toEqual({
      intent: "bug_report",
      businessType: "payment",
      summary: "payment proof not sent",
      needImages: true,
      priority: 4,
      nextAction: ["select_skill"]
    });
  });

  it("rejects extra fields instead of letting the model design the JSON", async () => {
    const provider = new StructuredJsonProvider(
      fakeCopilot(
        JSON.stringify({
          intent: "bug_report",
          businessType: "payment",
          summary: "payment proof not sent",
          needImages: true,
          priority: 4,
          nextAction: ["select_skill"],
          modelInventedField: "nope"
        })
      )
    );

    await expect(provider.extract({ name: "TaskIntent", schema, input: "x" })).rejects.toThrow(
      "modelInventedField is not allowed"
    );
  });

  it("rejects missing required fields", async () => {
    const provider = new StructuredJsonProvider(
      fakeCopilot(
        JSON.stringify({
          intent: "bug_report",
          businessType: "payment",
          summary: "payment proof not sent",
          needImages: true,
          priority: 4
        })
      )
    );

    await expect(provider.extract({ name: "TaskIntent", schema, input: "x" })).rejects.toThrow(
      "TaskIntent.nextAction is required"
    );
  });
});

function fakeCopilot(response: string) {
  return {
    ask: async (prompt: string) => {
      expect(prompt).toContain("你是一个结构化信息抽取引擎，不是聊天助手");
      expect(prompt).toContain("字段由程序定义，禁止自行设计字段");
      expect(prompt).toContain("JSON Schema:");
      return response;
    }
  };
}
